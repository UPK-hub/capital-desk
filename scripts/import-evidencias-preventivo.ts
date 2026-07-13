/**
 * Importa las evidencias (fotos) de mantenimiento PREVENTIVO de junio 2026 a la
 * tarjeta "Evidencias y adjuntos" de cada caso, dejando la fecha de la evidencia
 * IGUAL a la fecha de cierre del caso.
 *
 * Cada foto se inserta como un mensaje del chat del caso (CaseChatMessage) con
 * meta.filePath, que es exactamente lo que la web lista como evidencia. El
 * archivo se guarda con saveGeneratedUpload (disco + respaldo en BD), igual que
 * cuando se sube por la web.
 *
 *   - Autor (quién cargó): Anderson Rueda (anderson.rueda@upk.local) por defecto.
 *   - Fecha de la evidencia: la fecha de cierre de la lista de abajo, a las 12:00
 *     hora Colombia (para que NO se corra de día por zona horaria).
 *   - Idempotente: si lo corres dos veces, NO duplica (marca meta.importBatch).
 *
 * Carpeta de evidencias esperada (una subcarpeta por bus):
 *   <dir>/K1407/foto1.png, <dir>/K1422/foto2.jpeg, ...
 * Por defecto <dir> = ./evidencias/6.Junio (dentro del repo). Se puede cambiar
 * con --dir.
 *
 * DRY-RUN por defecto (NO toca nada): muestra qué haría.
 *   npm run import:evidencias
 *   npm run import:evidencias -- --dir "C:\\ruta\\a\\6.Junio"
 *   npm run import:evidencias -- --apply
 *   npm run import:evidencias -- --apply --tenant CAPITALBUS --sender anderson.rueda@upk.local
 */
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { saveGeneratedUpload } from "@/lib/uploads";

const IMPORT_BATCH = "evidencias-preventivo-2026-06";

// Lista de casos: [numeroCaso, bus, fechaCierre(YYYY-MM-DD)]
const CASES: Array<[number, string, string]> = [
  [2379, "K1407", "2026-06-18"],
  [2380, "K1410", "2026-06-10"],
  [2381, "K1417", "2026-06-20"],
  [2382, "K1422", "2026-06-18"],
  [2383, "K1423", "2026-06-18"],
  [2384, "K1426", "2026-06-15"],
  [2385, "K1428", "2026-06-18"],
  [2386, "K1430", "2026-06-20"],
  [2387, "K1431", "2026-06-18"],
  [2388, "K1434", "2026-06-20"],
  [2389, "K1438", "2026-06-18"],
  [2390, "K1439", "2026-06-12"],
  [2391, "K1441", "2026-06-12"],
  [2392, "K1452", "2026-06-12"],
  [2393, "K1463", "2026-06-17"],
  [2394, "K1474", "2026-06-12"],
  [2395, "K1482", "2026-06-17"],
  [2396, "K1487", "2026-06-12"],
  [2397, "K1488", "2026-06-22"],
  [2398, "K1490", "2026-06-22"],
  [2399, "K1492", "2026-06-12"],
  [2400, "K1498", "2026-06-22"],
  [2401, "K1502", "2026-06-22"],
  [2402, "K1509", "2026-06-16"],
  [2403, "K1511", "2026-06-22"],
  [2404, "K1515", "2026-06-12"],
  [2405, "K1520", "2026-06-12"],
  [2406, "K1527", "2026-06-16"],
  [2407, "K1530", "2026-06-13"],
  [2408, "K1533", "2026-06-13"],
  [2409, "K1536", "2026-06-17"],
  [2410, "K1544", "2026-06-17"],
  [2411, "K1546", "2026-06-13"],
  [2412, "K1558", "2026-06-14"],
  [2413, "K1564", "2026-06-18"],
  [2414, "K1567", "2026-06-15"],
  [2415, "K1569", "2026-06-16"],
  [2416, "K1577", "2026-06-22"],
  [2417, "K1582", "2026-06-22"],
  [2418, "K1584", "2026-06-22"],
  [2419, "K1604", "2026-06-15"],
  [2420, "K1607", "2026-06-17"],
  [2421, "K1611", "2026-06-22"],
  [2422, "K1616", "2026-06-15"],
  [2423, "K1619", "2026-06-19"],
  [2424, "K1623", "2026-06-12"],
  [2425, "K1625", "2026-06-19"],
  [2426, "K1626", "2026-06-19"],
  [2427, "K1627", "2026-06-12"],
  [2428, "K1628", "2026-06-19"],
  [2429, "K1630", "2026-06-19"],
  [2430, "K1631", "2026-06-19"],
  [2431, "K1634", "2026-06-17"],
  [2432, "K1638", "2026-06-18"],
  [2433, "K1646", "2026-06-22"],
  [2434, "K1647", "2026-06-15"],
  [2435, "K1649", "2026-06-16"],
  [2436, "K1657", "2026-06-19"],
];

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".heic", ".heif", ".bmp"]);

function mimeFromExt(ext: string): string {
  const e = ext.toLowerCase();
  if (e === ".png") return "image/png";
  if (e === ".jpg" || e === ".jpeg") return "image/jpeg";
  if (e === ".webp") return "image/webp";
  if (e === ".gif") return "image/gif";
  if (e === ".bmp") return "image/bmp";
  if (e === ".heic") return "image/heic";
  if (e === ".heif") return "image/heif";
  return "application/octet-stream";
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? String(process.argv[i + 1] ?? "") : null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const tenantCode = arg("--tenant") || "CAPITALBUS";
  const senderEmail = (arg("--sender") || "anderson.rueda@upk.local").toLowerCase();
  const dir = path.resolve(arg("--dir") || path.join(process.cwd(), "evidencias", "6.Junio"));

  console.log(`\n=== Importar evidencias preventivo (junio 2026) ===`);
  console.log(`Modo:     ${apply ? "APLICAR (escribe en BD/disco)" : "PRUEBA (no toca nada)"}`);
  console.log(`Tenant:   ${tenantCode}`);
  console.log(`Autor:    ${senderEmail}`);
  console.log(`Carpeta:  ${dir}\n`);

  // 1) Tenant
  const tenant =
    (await prisma.tenant.findFirst({ where: { code: tenantCode } })) ??
    (await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!tenant) {
    console.error(`✗ No se encontró el tenant "${tenantCode}".`);
    process.exit(1);
  }
  const tenantId = tenant.id;

  // 2) Autor (Anderson)
  let sender = await prisma.user.findFirst({ where: { tenantId, email: senderEmail } });
  if (!sender) {
    sender = await prisma.user.findFirst({
      where: { tenantId, name: { contains: "Anderson", mode: "insensitive" } },
    });
  }
  if (!sender) {
    console.error(`✗ No se encontró el usuario autor (${senderEmail} ni "Anderson"). Verifica el correo con --sender.`);
    process.exit(1);
  }
  console.log(`Autor resuelto: ${sender.name} <${sender.email}> [${sender.role}]\n`);

  // Lista de casos: por defecto la CASES de arriba (números de caso fijos).
  // Con --csv se usa un archivo "bus,fecha" (el de export:preventivos-junio) y
  // el caso se busca por bus + fecha (sirve después de recrear los casos,
  // cuando los números cambian).
  let casesList: Array<[number, string, string]> = CASES;
  const csvPathRaw = arg("--csv");
  if (csvPathRaw) {
    const csvPath = path.resolve(csvPathRaw);
    if (!fs.existsSync(csvPath)) {
      console.error(`✗ No existe el CSV: ${csvPath}`);
      process.exit(1);
    }
    casesList = [];
    const noEncontradosCsv: string[] = [];
    for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || /^bus\s*,/i.test(t)) continue;
      const [busRaw, fechaRaw] = t.split(",").map((x) => String(x ?? "").trim());
      if (!busRaw || !/^\d{4}-\d{2}-\d{2}$/.test(fechaRaw ?? "")) {
        console.error(`✗ Fila inválida en el CSV: "${t}" (esperado: bus,YYYY-MM-DD)`);
        process.exit(1);
      }
      const busCode = busRaw.toUpperCase();
      const dayStart = new Date(`${fechaRaw}T00:00:00-05:00`);
      const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
      const kase = await prisma.case.findFirst({
        where: {
          tenantId,
          type: "PREVENTIVO",
          bus: { code: busCode },
          createdAt: { gte: dayStart, lt: dayEnd },
        },
        select: { caseNo: true },
        orderBy: { createdAt: "asc" },
      });
      if (!kase?.caseNo) {
        noEncontradosCsv.push(`${busCode} ${fechaRaw}`);
        continue;
      }
      casesList.push([kase.caseNo, busCode, fechaRaw]);
    }
    console.log(`CSV: ${csvPath} -> ${casesList.length} caso(s) resueltos por bus+fecha`);
    if (noEncontradosCsv.length) {
      console.log(`⚠️  Sin caso en BD para: ${noEncontradosCsv.join(", ")}`);
    }
    console.log("");
  }

  // 3) Carpeta de evidencias
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    console.error(`✗ No existe la carpeta de evidencias: ${dir}`);
    console.error(`  Copia la carpeta "6.Junio" ahí, o pásala con --dir "ruta".`);
    process.exit(1);
  }
  // Mapa nombreCarpeta(minúsculas) -> nombre real
  const folderByLower = new Map<string, string>();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) folderByLower.set(entry.name.toLowerCase(), entry.name);
  }

  // Acumuladores para el reporte final
  let totalFiles = 0;
  let totalCreated = 0;
  let totalSkippedExisting = 0;
  const sinCarpeta: string[] = [];
  const casoNoEncontrado: string[] = [];
  const busDistinto: string[] = [];
  const okResumen: string[] = [];

  for (const [caseNo, busRaw, dateStr] of casesList) {
    const bus = busRaw.toUpperCase();

    // Caso por número
    const kase = await prisma.case.findFirst({
      where: { tenantId, caseNo },
      include: { bus: { select: { code: true } } },
    });
    if (!kase) {
      casoNoEncontrado.push(`#${caseNo} (${bus})`);
      continue;
    }
    if ((kase.bus?.code ?? "").toUpperCase() !== bus) {
      // El caso existe pero su bus en BD no coincide con el de la lista: se omite por seguridad.
      busDistinto.push(`#${caseNo}: lista=${bus} vs BD=${kase.bus?.code ?? "?"}`);
      continue;
    }

    // Carpeta del bus
    const folderName = folderByLower.get(bus.toLowerCase());
    if (!folderName) {
      sinCarpeta.push(`${bus} (caso #${caseNo})`);
      continue;
    }
    const busDir = path.join(dir, folderName);
    const files = fs
      .readdirSync(busDir, { withFileTypes: true })
      .filter((f) => f.isFile() && IMAGE_EXTS.has(path.extname(f.name).toLowerCase()))
      .map((f) => f.name)
      .sort((a, b) => a.localeCompare(b, "es"));

    if (files.length === 0) {
      sinCarpeta.push(`${bus} (carpeta vacía, caso #${caseNo})`);
      continue;
    }

    // Idempotencia: qué fotos de este lote ya están cargadas en este caso
    const existing = await prisma.caseChatMessage.findMany({
      where: { tenantId, caseId: kase.id },
      select: { meta: true },
    });
    const yaCargadas = new Set<string>();
    for (const m of existing) {
      const meta = (m.meta ?? {}) as any;
      if (meta?.importBatch === IMPORT_BATCH && meta?.filename) yaCargadas.add(String(meta.filename));
    }

    // Fecha base: misma hora del cierre del caso = 4:00 AM (hora Colombia)
    // del día SIGUIENTE al mantenimiento (lógica nocturna: apertura 10 PM,
    // cierre 4 AM). 22:00 del día + 6 horas.
    const baseAt = new Date(new Date(`${dateStr}T22:00:00-05:00`).getTime() + 6 * 60 * 60 * 1000);

    let creadasCaso = 0;
    let saltadasCaso = 0;
    for (let i = 0; i < files.length; i++) {
      const original = files[i];
      totalFiles++;
      if (yaCargadas.has(original)) {
        saltadasCaso++;
        totalSkippedExisting++;
        continue;
      }

      const ext = path.extname(original);
      const mime = mimeFromExt(ext);
      const buffer = fs.readFileSync(path.join(busDir, original));
      const size = buffer.length;
      // Cada foto un segundo después para que ordenen igual que en la carpeta
      const createdAt = new Date(baseAt.getTime() + i * 1000);
      const relPath = `case-chat/${kase.id}/${IMPORT_BATCH}_${String(i).padStart(2, "0")}_${safeName(original)}`;

      if (apply) {
        await saveGeneratedUpload(relPath, buffer, { originalName: original, mimeType: mime });
        await prisma.caseChatMessage.create({
          data: {
            tenantId,
            caseId: kase.id,
            senderId: sender.id,
            message: "[Imagen]",
            createdAt,
            meta: {
              filePath: relPath,
              filename: original,
              mime,
              size,
              kind: "image",
              importBatch: IMPORT_BATCH,
              source: "import-evidencia",
            },
          },
        });
      }
      creadasCaso++;
      totalCreated++;
    }

    okResumen.push(
      `#${caseNo} ${bus} (${dateStr}): ${creadasCaso} ${apply ? "creadas" : "a crear"}` +
        (saltadasCaso ? `, ${saltadasCaso} ya estaban` : "")
    );
  }

  // ===== Reporte =====
  console.log(`--- Casos procesados (${okResumen.length}) ---`);
  for (const line of okResumen) console.log("  ✔ " + line);

  if (sinCarpeta.length) {
    console.log(`\n--- Sin carpeta de evidencia (${sinCarpeta.length}) ---`);
    for (const s of sinCarpeta) console.log("  • " + s);
  }
  if (casoNoEncontrado.length) {
    console.log(`\n--- Caso no encontrado en BD (${casoNoEncontrado.length}) ---`);
    for (const s of casoNoEncontrado) console.log("  • " + s);
  }
  if (busDistinto.length) {
    console.log(`\n--- OMITIDOS: el bus del caso en BD no coincide (${busDistinto.length}) ---`);
    for (const s of busDistinto) console.log("  • " + s);
  }

  console.log(`\n=== Totales ===`);
  console.log(`  Fotos encontradas:     ${totalFiles}`);
  console.log(`  ${apply ? "Evidencias creadas:" : "Evidencias a crear:"}    ${totalCreated}`);
  if (totalSkippedExisting) console.log(`  Ya estaban (saltadas): ${totalSkippedExisting}`);
  if (!apply) console.log(`\n(Modo PRUEBA: no se escribió nada. Agrega --apply para aplicar.)`);
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("✗ Falló la importación:", err);
    process.exit(1);
  });
