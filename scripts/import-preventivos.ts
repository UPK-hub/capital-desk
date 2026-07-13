/**
 * Importa casos de mantenimiento PREVENTIVO desde una lista fija (Excel "preventivo.xlsx").
 * Cada fila => un Caso tipo PREVENTIVO, estado RESUELTO. Horas: apertura 10:00 PM
 * del día dado y cierre 4:00 AM del día siguiente (lógica nocturna).
 *
 *  - Resuelve el bus por código "K{num}" (con respaldos).
 *  - Asigna caseNo consecutivo (max + 1).
 *  - Fija Case.updatedAt = misma fecha (cierre) vía SQL crudo (Prisma no deja sobrescribir @updatedAt).
 *  - Crea eventos CREATED + STATUS_CHANGE fechados en ese día.
 *  - Idempotente: omite si ya existe un preventivo para ese bus en esa fecha.
 *
 * DRY-RUN por defecto; --apply para aplicar. Tenant por code (def. CAPITALBUS).
 *   npm run import:preventivos
 *   npm run import:preventivos -- --apply
 *   npm run import:preventivos -- --apply --tenant CAPITALBUS
 */
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { CaseEventType, CaseStatus, CaseType, WorkOrderStatus } from "@prisma/client";

const DATA: { bus: number; fecha: string }[] = [
  { bus: 1407, fecha: "2026-06-18" }, { bus: 1410, fecha: "2026-06-10" }, { bus: 1417, fecha: "2026-06-20" },
  { bus: 1422, fecha: "2026-06-18" }, { bus: 1423, fecha: "2026-06-18" }, { bus: 1426, fecha: "2026-06-15" },
  { bus: 1428, fecha: "2026-06-18" }, { bus: 1430, fecha: "2026-06-20" }, { bus: 1431, fecha: "2026-06-18" },
  { bus: 1434, fecha: "2026-06-20" }, { bus: 1438, fecha: "2026-06-18" }, { bus: 1439, fecha: "2026-06-12" },
  { bus: 1441, fecha: "2026-06-12" }, { bus: 1452, fecha: "2026-06-12" }, { bus: 1463, fecha: "2026-06-17" },
  { bus: 1474, fecha: "2026-06-12" }, { bus: 1482, fecha: "2026-06-17" }, { bus: 1487, fecha: "2026-06-12" },
  { bus: 1488, fecha: "2026-06-22" }, { bus: 1490, fecha: "2026-06-22" }, { bus: 1492, fecha: "2026-06-12" },
  { bus: 1498, fecha: "2026-06-22" }, { bus: 1502, fecha: "2026-06-22" }, { bus: 1509, fecha: "2026-06-16" },
  { bus: 1511, fecha: "2026-06-22" }, { bus: 1515, fecha: "2026-06-12" }, { bus: 1520, fecha: "2026-06-12" },
  { bus: 1527, fecha: "2026-06-16" }, { bus: 1530, fecha: "2026-06-13" }, { bus: 1533, fecha: "2026-06-13" },
  { bus: 1536, fecha: "2026-06-17" }, { bus: 1544, fecha: "2026-06-17" }, { bus: 1546, fecha: "2026-06-13" },
  { bus: 1558, fecha: "2026-06-14" }, { bus: 1564, fecha: "2026-06-18" }, { bus: 1567, fecha: "2026-06-15" },
  { bus: 1569, fecha: "2026-06-16" }, { bus: 1577, fecha: "2026-06-22" }, { bus: 1582, fecha: "2026-06-22" },
  { bus: 1584, fecha: "2026-06-22" }, { bus: 1604, fecha: "2026-06-15" }, { bus: 1607, fecha: "2026-06-17" },
  { bus: 1611, fecha: "2026-06-22" }, { bus: 1616, fecha: "2026-06-15" }, { bus: 1619, fecha: "2026-06-19" },
  { bus: 1623, fecha: "2026-06-12" }, { bus: 1625, fecha: "2026-06-19" }, { bus: 1626, fecha: "2026-06-19" },
  { bus: 1627, fecha: "2026-06-12" }, { bus: 1628, fecha: "2026-06-19" }, { bus: 1630, fecha: "2026-06-19" },
  { bus: 1631, fecha: "2026-06-19" }, { bus: 1634, fecha: "2026-06-17" }, { bus: 1638, fecha: "2026-06-18" },
  { bus: 1646, fecha: "2026-06-22" }, { bus: 1647, fecha: "2026-06-15" }, { bus: 1649, fecha: "2026-06-16" },
  { bus: 1657, fecha: "2026-06-19" },
];

function atCot(fecha: string, hhmm: string) {
  return new Date(`${fecha}T${hhmm}:00-05:00`);
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const tIdx = args.indexOf("--tenant");
  const tenantCode = tIdx >= 0 ? args[tIdx + 1] : "CAPITALBUS";

  // Lista de buses/fechas: por defecto la DATA de arriba; con --csv se usa un
  // archivo "bus,fecha" (una fila por preventivo; ej: K1401,2026-06-02),
  // como el que genera `npm run export:preventivos-junio`.
  const cIdx = args.indexOf("--csv");
  const csvPath = cIdx >= 0 ? path.resolve(String(args[cIdx + 1] ?? "")) : null;
  let rows: { bus: number | string; fecha: string; ot?: string; responsable?: string }[] = DATA;
  if (csvPath) {
    if (!fs.existsSync(csvPath)) {
      console.error(`✗ No existe el CSV: ${csvPath}`);
      process.exit(1);
    }
    rows = [];
    for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || /^bus\s*,/i.test(t)) continue; // salta encabezado/vacías
      const [busRaw, fechaRaw, otRaw, respRaw] = t.split(",").map((x) => String(x ?? "").trim());
      if (!busRaw || !/^\d{4}-\d{2}-\d{2}$/.test(fechaRaw ?? "")) {
        console.error(`✗ Fila inválida en el CSV: "${t}" (esperado: bus,YYYY-MM-DD[,ot,responsable])`);
        process.exit(1);
      }
      rows.push({
        bus: busRaw,
        fecha: fechaRaw,
        ot: otRaw && /^\d+$/.test(otRaw) ? otRaw : "",
        responsable: respRaw ?? "",
      });
    }
    console.log(`CSV: ${csvPath} (${rows.length} filas)`);
  }

  const tenant = await prisma.tenant.findFirst({ where: { code: tenantCode } });
  if (!tenant) {
    console.error(`✗ No se encontró tenant con code="${tenantCode}".`);
    process.exit(1);
  }
  const tenantId = tenant.id;

  const creator =
    (await prisma.user.findFirst({ where: { tenantId, email: "gerenciatactica@upkeepservices.com.co" } })) ??
    (await prisma.user.findFirst({ where: { tenantId, role: "ADMIN" } }));
  const creatorId = creator?.id ?? null;

  // Responsables del CSV -> usuarios de la plataforma (por nombre, sin
  // acentos ni mayúsculas). Si alguno no existe, se crea el caso sin asignar
  // y se reporta al final.
  const normalizeName = (v: string) =>
    v
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  const allUsers = await prisma.user.findMany({
    where: { tenantId },
    select: { id: true, name: true, active: true },
  });
  const userIdByResp = new Map<string, string | null>();
  const respNoEncontrados = new Set<string>();
  const resolveResp = (raw: string): string | null => {
    const key = normalizeName(raw);
    if (!key) return null;
    if (userIdByResp.has(key)) return userIdByResp.get(key) ?? null;
    let match =
      allUsers.find((u) => normalizeName(u.name) === key) ??
      allUsers.find((u) => normalizeName(u.name).includes(key) || key.includes(normalizeName(u.name)));
    if (!match) {
      // último intento: por palabras (nombre y apellido presentes)
      const words = key.split(" ").filter((w) => w.length > 2);
      match = allUsers.find((u) => {
        const un = normalizeName(u.name);
        return words.length > 0 && words.every((w) => un.includes(w));
      });
    }
    userIdByResp.set(key, match?.id ?? null);
    if (!match) respNoEncontrados.add(raw);
    return match?.id ?? null;
  };

  // Números de OT ya usados (en BD o repetidos dentro del propio CSV): el
  // sistema exige OT única por tenant, así que la segunda vez se crea la OT
  // SIN número y se reporta (en vez de frenar toda la importación).
  const existingWoNos = await prisma.workOrder.findMany({
    where: { tenantId, workOrderNo: { not: null } },
    select: { workOrderNo: true },
  });
  const usedOtNos = new Set<number>(existingWoNos.map((w) => w.workOrderNo!).filter((n) => n != null));
  const otDuplicadas: string[] = [];

  const maxAgg = await prisma.case.aggregate({ where: { tenantId }, _max: { caseNo: true } });
  let nextNo = (maxAgg._max.caseNo ?? 0) + 1;

  console.log("");
  console.log(`Modo:   ${apply ? "APLICAR" : "DRY-RUN (solo lectura)"}`);
  console.log(`Tenant: ${tenantCode}  |  Creador: ${creator?.name ?? "(ninguno)"}`);
  console.log(`Filas:  ${rows.length}  |  Próximo # de caso: ${nextNo}`);
  console.log("");

  let toCreate = 0;
  let dup = 0;
  const missing: Array<number | string> = [];
  const plan: {
    code: string;
    busId: string;
    fecha: string;
    caseNo: number;
    ot: number | null;
    respRaw: string;
    respUserId: string | null;
  }[] = [];

  for (const row of rows) {
    const busStr = String(row.bus).trim();
    const candidates = /^\d+$/.test(busStr)
      ? [`K${busStr}`, busStr, `k${busStr}`]
      : [busStr.toUpperCase(), busStr];
    let bus: { id: string; code: string } | null = null;
    for (const code of candidates) {
      bus = await prisma.bus.findFirst({ where: { tenantId, code }, select: { id: true, code: true } });
      if (bus) break;
    }
    if (!bus) {
      missing.push(row.bus);
      console.log(`  ✗ Bus ${row.bus}: no encontrado (probé ${candidates.join(", ")})`);
      continue;
    }

    const dayStart = atCot(row.fecha, "00:00");
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
    const exists = await prisma.case.findFirst({
      where: { tenantId, busId: bus.id, type: CaseType.PREVENTIVO, createdAt: { gte: dayStart, lt: dayEnd } },
      select: { id: true, caseNo: true },
    });
    if (exists) {
      dup += 1;
      console.log(`  = Bus ${bus.code} ${row.fecha}: ya existe (caso #${exists.caseNo}), se omite`);
      continue;
    }

    let otNo = row.ot && /^\d+$/.test(row.ot) ? Number(row.ot) : null;
    if (otNo != null) {
      if (usedOtNos.has(otNo)) {
        otDuplicadas.push(`OT ${otNo} repetida: bus ${bus.code} queda con OT sin número`);
        otNo = null;
      } else {
        usedOtNos.add(otNo);
      }
    }
    const respRaw = String(row.responsable ?? "").trim();
    const respUserId = respRaw ? resolveResp(respRaw) : null;
    plan.push({ code: bus.code, busId: bus.id, fecha: row.fecha, caseNo: nextNo, ot: otNo, respRaw, respUserId });
    console.log(
      `  + Bus ${bus.code} ${row.fecha}  ->  caso #${nextNo} (OT ${otNo ?? "sin #"}, ${respRaw || "sin responsable"}${
        respRaw && !respUserId ? " ⚠️ usuario no encontrado" : ""
      })`
    );
    nextNo += 1;
    toCreate += 1;
  }

  console.log("");
  console.log(`Por crear: ${toCreate}  |  Ya existían: ${dup}  |  Buses no encontrados: ${missing.length}`);
  if (missing.length) console.log(`Buses no encontrados: ${missing.join(", ")}`);

  if (!apply) {
    console.log("");
    console.log("DRY-RUN: no se creó nada. Ejecuta con --apply para crear los casos.");
    await prisma.$disconnect();
    return;
  }

  let created = 0;
  for (const p of plan) {
    // Lógica nocturna: apertura 10:00 PM del día del mantenimiento y
    // cierre 4:00 AM del día siguiente (el trabajo cruza la medianoche).
    const apertura = atCot(p.fecha, "22:00");
    const cierre = new Date(apertura.getTime() + 6 * 60 * 60 * 1000);
    const c = await prisma.case.create({
      data: {
        tenantId,
        caseNo: p.caseNo,
        busId: p.busId,
        type: CaseType.PREVENTIVO,
        status: CaseStatus.RESUELTO,
        priority: 3,
        title: `Mantenimiento preventivo ${p.code}`,
        description: `Mantenimiento preventivo programado del bus ${p.code} (${p.fecha}).`,
        createdAt: apertura,
        ...(p.respUserId ? { assignedToId: p.respUserId } : {}),
      },
      select: { id: true },
    });

    // Orden de trabajo con su número de CapitalBus, FINALIZADA con la lógica
    // nocturna (inicio 10 PM, fin 4 AM) y asignada al responsable.
    await prisma.workOrder.create({
      data: {
        tenantId,
        caseId: c.id,
        workOrderNo: p.ot,
        status: WorkOrderStatus.FINALIZADA,
        ...(p.respUserId ? { assignedToId: p.respUserId, assignedAt: apertura } : {}),
        scheduledAt: apertura,
        scheduledTo: cierre,
        startedAt: apertura,
        finishedAt: cierre,
      },
    });

    // Fijar updatedAt (cierre) = 4:00 AM del día siguiente.
    try {
      await prisma.$executeRawUnsafe(`UPDATE "Case" SET "updatedAt" = $1 WHERE "id" = $2`, cierre, c.id);
    } catch (e: any) {
      console.warn(`  ! No se pudo fijar updatedAt del caso #${p.caseNo}: ${e?.message ?? e}`);
    }

    await prisma.caseEvent.create({
      data: {
        caseId: c.id,
        type: CaseEventType.CREATED,
        createdAt: apertura,
        message: "Caso creado (importación de preventivos)",
        meta: { userId: creatorId, source: "import-preventivos" },
      },
    });
    await prisma.caseEvent.create({
      data: {
        caseId: c.id,
        type: CaseEventType.STATUS_CHANGE,
        createdAt: cierre,
        message: "Caso resuelto (preventivo realizado)",
        meta: { from: "NUEVO", to: "RESUELTO", source: "import-preventivos" },
      },
    });
    created += 1;
  }

  console.log("");
  console.log(`✓ Listo. Casos creados: ${created}.`);
  if (respNoEncontrados.size) {
    console.log(`⚠️  Responsables SIN usuario en la plataforma (casos quedaron sin asignar): ${Array.from(respNoEncontrados).join(", ")}`);
  }
  if (otDuplicadas.length) {
    console.log(`⚠️  OTs con número repetido (se creó la OT sin número):`);
    for (const d of otDuplicadas) console.log(`   - ${d}`);
  }
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("✗ Importación falló:", err);
  await prisma.$disconnect();
  process.exit(1);
});
