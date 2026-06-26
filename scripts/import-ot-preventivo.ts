/**
 * Carga el archivo de la ORDEN DE TRABAJO (OT) — un PDF por bus — al caso
 * PREVENTIVO de junio 2026 de cada bus. El PDF se guarda en el slot
 * "Archivo de la OT" de la Orden de Trabajo del caso (WorkOrder.orderFile*),
 * exactamente igual que cuando se sube por la web en la tarjeta "Archivo de la OT".
 * El archivo se guarda con saveGeneratedUpload (disco + respaldo en BD).
 *
 * Carpeta esperada (PDFs planos, UNO por bus):
 *   <dir>/K1401 PREV.pdf, <dir>/K1402 PREV.pdf, ...
 * Por defecto <dir> = ./OTS/6.Junio 2026 (junto al server, p.ej.
 *   D:\apps\capital-desk\OTS\6.Junio 2026). Se cambia con --dir "ruta".
 *
 *   - Empareja por el código de bus que aparece en el nombre (K#### ...).
 *     "K1404 PRE" y "K1405 PREV" se reconocen igual (se toma el número del bus).
 *   - Si hay 2 PDFs para el mismo bus (p.ej. "K1405 PRE" y "K1405 PREV"), prefiere
 *     el que diga "PREV" y, si empatan, el más grande. Avisa del duplicado.
 *   - Si el preventivo del bus NO tiene OT, la crea (status CREADA, programada el
 *     día del caso), igual que backfill:preventivo-ot. Desactivar con --no-crear-ot.
 *   - Idempotente: si la OT ya tiene un archivo cargado, NO lo reemplaza
 *     (usa --force para sobrescribir).
 *   - DRY-RUN por defecto (no toca nada). --apply para escribir.
 *
 *   npm run import:ot-preventivo
 *   npm run import:ot-preventivo -- --apply
 *   npm run import:ot-preventivo -- --dir "D:\\apps\\capital-desk\\OTS\\6.Junio 2026" --apply
 *   npm run import:ot-preventivo -- --mes 2026-06 --apply
 */
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { saveGeneratedUpload } from "@/lib/uploads";
import { CaseEventType, CaseType, WorkOrderStatus } from "@prisma/client";

const IMPORT_BATCH = "ot-preventivo-2026-06";

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? String(process.argv[i + 1] ?? "") : null;
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/** Extrae el código de bus (K####) del nombre del archivo. null si no hay. */
function busCodeFromName(fileName: string): string | null {
  const base = path.basename(fileName, path.extname(fileName));
  const m = base.match(/k\s*0*([0-9]{3,4})/i); // "K1401", "K 1401", "k01401"
  if (!m) return null;
  return `K${parseInt(m[1], 10)}`;
}

/** ¿El nombre trae la palabra completa PREV (no PRE)? Para desempatar duplicados. */
function looksPrev(fileName: string): boolean {
  const base = path.basename(fileName, path.extname(fileName));
  return /\bprev\b/i.test(base);
}

/** Rango [inicio, fin) del mes "YYYY-MM" en hora Colombia (UTC-05:00). */
function monthRange(mes: string): { start: Date; end: Date } {
  const [y, m] = mes.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || m < 1 || m > 12) throw new Error(`--mes inválido: "${mes}" (usa YYYY-MM)`);
  const start = new Date(`${mes}-01T00:00:00-05:00`);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const end = new Date(`${ny}-${String(nm).padStart(2, "0")}-01T00:00:00-05:00`);
  return { start, end };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const force = process.argv.includes("--force");
  const crearOt = !process.argv.includes("--no-crear-ot");
  const tenantCode = arg("--tenant") || "CAPITALBUS";
  const mes = arg("--mes") || "2026-06";
  const dir = path.resolve(arg("--dir") || path.join(process.cwd(), "OTS", "6.Junio 2026"));
  const autorEmail = (arg("--autor") || "gerenciatactica@upkeepservices.com.co").toLowerCase();

  const { start, end } = monthRange(mes);

  console.log(`\n=== Cargar OT (PDF) a preventivos de ${mes} ===`);
  console.log(`Modo:     ${apply ? "APLICAR (escribe en BD/disco)" : "PRUEBA (no toca nada)"}`);
  console.log(`Tenant:   ${tenantCode}`);
  console.log(`Carpeta:  ${dir}`);
  console.log(`Rango:    ${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)} (casos PREVENTIVO)`);
  console.log(`Crear OT si falta: ${crearOt ? "sí" : "no"}   |   Sobrescribir existentes: ${force ? "sí" : "no"}\n`);

  // 1) Tenant
  const tenant =
    (await prisma.tenant.findFirst({ where: { code: tenantCode } })) ??
    (await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!tenant) {
    console.error(`✗ No se encontró el tenant "${tenantCode}".`);
    process.exit(1);
  }
  const tenantId = tenant.id;

  // 2) Autor (para el evento del caso)
  const autor =
    (await prisma.user.findFirst({ where: { tenantId, email: autorEmail } })) ??
    (await prisma.user.findFirst({ where: { tenantId, role: "ADMIN" } }));
  const autorId = autor?.id ?? null;
  console.log(`Autor del evento: ${autor?.name ?? "(ninguno)"} ${autor ? `<${autor.email}>` : ""}\n`);

  // 3) Carpeta de OTs
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    console.error(`✗ No existe la carpeta de OTs: ${dir}`);
    console.error(`  Pásala con --dir "ruta" (la carpeta con los PDF "K#### PREV.pdf").`);
    process.exit(1);
  }

  // Mapa bus -> mejor PDF (resolviendo duplicados)
  const fileByBus = new Map<string, { name: string; size: number }>();
  const sinCodigo: string[] = [];
  const duplicados: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (path.extname(entry.name).toLowerCase() !== ".pdf") continue;
    const code = busCodeFromName(entry.name);
    if (!code) {
      sinCodigo.push(entry.name);
      continue;
    }
    const size = fs.statSync(path.join(dir, entry.name)).size;
    const prev = fileByBus.get(code);
    if (!prev) {
      fileByBus.set(code, { name: entry.name, size });
      continue;
    }
    // Desempate: gana el que diga "PREV"; si empatan, el más grande.
    const prevIsPrev = looksPrev(prev.name);
    const curIsPrev = looksPrev(entry.name);
    let winner = prev;
    let loser = { name: entry.name, size };
    if (curIsPrev && !prevIsPrev) {
      winner = { name: entry.name, size };
      loser = prev;
    } else if (curIsPrev === prevIsPrev && size > prev.size) {
      winner = { name: entry.name, size };
      loser = prev;
    }
    fileByBus.set(code, winner);
    duplicados.push(`${code}: usa "${winner.name}", ignora "${loser.name}"`);
  }

  // 4) Casos PREVENTIVO del mes
  const cases = await prisma.case.findMany({
    where: { tenantId, type: CaseType.PREVENTIVO, createdAt: { gte: start, lt: end } },
    select: {
      id: true,
      caseNo: true,
      createdAt: true,
      bus: { select: { code: true } },
      workOrder: { select: { id: true, orderFilePath: true, orderFileName: true } },
    },
    orderBy: { caseNo: "asc" },
  });

  // Acumuladores
  const usados = new Set<string>(); // códigos de bus que sí emparejaron con un caso
  let totalCargadas = 0;
  let otCreadas = 0;
  const yaTenia: string[] = [];
  const sinPdf: string[] = [];
  const sinCaso2: string[] = []; // se llena al final con los PDFs que no emparejaron
  const okResumen: string[] = [];

  for (const c of cases) {
    const busCode = (c.bus?.code ?? "").toUpperCase();
    if (!busCode) continue;

    const pdf = fileByBus.get(busCode);
    if (!pdf) {
      sinPdf.push(`#${c.caseNo} ${busCode || "?"}`);
      continue;
    }
    usados.add(busCode);

    // ¿OT existe?
    let woId = c.workOrder?.id ?? null;
    const yaTieneArchivo = !!c.workOrder?.orderFilePath;

    if (yaTieneArchivo && !force) {
      yaTenia.push(`#${c.caseNo} ${busCode} (${c.workOrder?.orderFileName ?? "archivo"})`);
      continue;
    }
    if (!woId && !crearOt) {
      // No tiene OT y se pidió no crearla
      sinPdf.push(`#${c.caseNo} ${busCode} (sin OT; corre backfill:preventivo-ot o quita --no-crear-ot)`);
      continue;
    }

    const original = pdf.name;
    const buffer = apply ? fs.readFileSync(path.join(dir, original)) : Buffer.alloc(0);
    const size = pdf.size;
    const orderFileName = original; // el nombre ya trae el código del bus
    const relPath = `work-orders/${woId ?? "NEW"}/order-file/${Date.now()}_${safeName(busCode)}_${safeName(original)}`;
    const when = c.createdAt; // fechar la OT igual que el caso (cierre)

    if (apply) {
      // Crear OT si falta
      if (!woId) {
        const sched = new Date(c.createdAt);
        const schedTo = new Date(sched.getTime() + 60 * 60 * 1000);
        const wo = await prisma.workOrder.create({
          data: {
            tenantId,
            caseId: c.id,
            status: WorkOrderStatus.CREADA,
            scheduledAt: sched,
            scheduledTo: schedTo,
          },
          select: { id: true },
        });
        woId = wo.id;
        otCreadas += 1;
      }

      const finalRel = relPath.replace("/NEW/", `/${woId}/`);
      await saveGeneratedUpload(finalRel, buffer, { originalName: original, mimeType: "application/pdf" });
      await prisma.workOrder.update({
        where: { id: woId! },
        data: {
          orderFilePath: finalRel,
          orderFileName,
          orderFileMimeType: "application/pdf",
          orderFileSize: size,
          orderFileUpdatedAt: when,
        },
      });
      await prisma.caseEvent.create({
        data: {
          caseId: c.id,
          type: CaseEventType.COMMENT,
          createdAt: when,
          message: `Archivo OT cargado: ${orderFileName}`,
          meta: {
            workOrderId: woId,
            by: autorId,
            filePath: finalRel,
            kind: "WORK_ORDER_FILE",
            source: "import-ot-preventivo",
            importBatch: IMPORT_BATCH,
          },
        },
      });
    } else if (!woId) {
      otCreadas += 1; // se contaría como OT a crear
    }

    totalCargadas += 1;
    okResumen.push(
      `#${c.caseNo} ${busCode}: ${apply ? "cargado" : "a cargar"} "${original}"` +
        (!woId ? " (+ OT nueva)" : "") +
        (yaTieneArchivo && force ? " (reemplaza)" : "")
    );
  }

  // PDFs que no emparejaron con ningún caso de junio
  for (const [code, f] of fileByBus) {
    if (!usados.has(code)) sinCaso2.push(`${code} ("${f.name}")`);
  }

  // ===== Reporte =====
  console.log(`--- Preventivos con OT ${apply ? "cargada" : "a cargar"} (${okResumen.length}) ---`);
  for (const line of okResumen) console.log("  ✔ " + line);

  if (yaTenia.length) {
    console.log(`\n--- Ya tenían archivo de OT (omitidos; usa --force para reemplazar) (${yaTenia.length}) ---`);
    for (const s of yaTenia) console.log("  • " + s);
  }
  if (sinPdf.length) {
    console.log(`\n--- Casos de junio SIN PDF de OT (${sinPdf.length}) ---`);
    for (const s of sinPdf) console.log("  • " + s);
  }
  if (sinCaso2.length) {
    console.log(`\n--- PDFs SIN caso preventivo de junio (revisar) (${sinCaso2.length}) ---`);
    for (const s of sinCaso2) console.log("  • " + s);
  }
  if (duplicados.length) {
    console.log(`\n--- Duplicados resueltos (${duplicados.length}) ---`);
    for (const s of duplicados) console.log("  • " + s);
  }
  if (sinCodigo.length) {
    console.log(`\n--- PDFs sin código de bus reconocible (${sinCodigo.length}) ---`);
    for (const s of sinCodigo) console.log("  • " + s);
  }

  console.log(`\n=== Totales ===`);
  console.log(`  PDFs en la carpeta:        ${fileByBus.size}${sinCodigo.length ? ` (+${sinCodigo.length} sin código)` : ""}`);
  console.log(`  Casos preventivo (${mes}):  ${cases.length}`);
  console.log(`  ${apply ? "OT con archivo cargado:" : "OT con archivo a cargar:"}   ${totalCargadas}`);
  console.log(`  ${apply ? "OT creadas (no tenían):" : "OT que se crearían:"}    ${otCreadas}`);
  if (yaTenia.length) console.log(`  Ya tenían archivo:         ${yaTenia.length}`);
  if (!apply) console.log(`\n(Modo PRUEBA: no se escribió nada. Agrega --apply para aplicar.)`);
  console.log("");
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("✗ Falló la carga de OT:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
