/**
 * Importa los 15 mantenimientos PREVENTIVOS del 2026-06-23 (lote "23 jun").
 * Por cada bus crea un Caso PREVENTIVO RESUELTO con:
 *   - createdAt = updatedAt = cierre = 2026-06-23 (10:00 hora Colombia)
 *   - WorkOrder con su # OT (workOrderNo), FINALIZADA, finishedAt = esa fecha
 *   - RESPONSABLE = Case.assignedToId + WorkOrder.assignedToId (Leonardo Corredor / Anderson Rueda)
 *   - Eventos CREATED + STATUS_CHANGE + ASSIGNED fechados ese día
 *
 * Idempotente: omite si ya existe un preventivo para ese bus en esa fecha.
 * DRY-RUN por defecto; --apply para aplicar.
 *   npx tsx scripts/import-preventivos-23jun.ts
 *   npx tsx scripts/import-preventivos-23jun.ts --apply
 */
import { prisma } from "@/lib/prisma";
import { CaseEventType, CaseStatus, CaseType, WorkOrderStatus } from "@prisma/client";

const FECHA = "2026-06-23";

const DATA: { bus: number; ot: number; resp: string }[] = [
  { bus: 1416, ot: 1266850, resp: "Leonardo Corredor" },
  { bus: 1436, ot: 1266825, resp: "Leonardo Corredor" },
  { bus: 1444, ot: 1266866, resp: "Leonardo Corredor" },
  { bus: 1446, ot: 1266868, resp: "Leonardo Corredor" },
  { bus: 1447, ot: 1266869, resp: "Leonardo Corredor" },
  { bus: 1448, ot: 1266156, resp: "Anderson Rueda" },
  { bus: 1449, ot: 1266870, resp: "Leonardo Corredor" },
  { bus: 1450, ot: 1266157, resp: "Anderson Rueda" },
  { bus: 1453, ot: 1266872, resp: "Anderson Rueda" },
  { bus: 1455, ot: 1266873, resp: "Anderson Rueda" },
  { bus: 1456, ot: 1266159, resp: "Anderson Rueda" },
  { bus: 1458, ot: 1266875, resp: "Anderson Rueda" },
  { bus: 1459, ot: 1266160, resp: "Anderson Rueda" },
  { bus: 1466, ot: 1266891, resp: "Anderson Rueda" },
  { bus: 1467, ot: 1266686, resp: "Leonardo Corredor" },
];

function atCot(fecha: string, hhmm: string) {
  return new Date(`${fecha}T${hhmm}:00-05:00`);
}

type Usr = { id: string; name: string } | null;
async function resolveResp(tenantId: string, name: string): Promise<Usr> {
  if (/anderson/i.test(name)) {
    const a = await prisma.user.findFirst({ where: { tenantId, email: "anderson.rueda@upk.local" }, select: { id: true, name: true } });
    if (a) return a;
  }
  let u = await prisma.user.findFirst({ where: { tenantId, name: { contains: name, mode: "insensitive" } }, select: { id: true, name: true } });
  if (!u) {
    const tokens = name.split(/\s+/).filter(Boolean);
    if (tokens.length >= 2) {
      u = await prisma.user.findFirst({
        where: { tenantId, AND: tokens.slice(0, 2).map((t) => ({ name: { contains: t, mode: "insensitive" } })) },
        select: { id: true, name: true },
      });
    }
  }
  return u;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const tIdx = process.argv.indexOf("--tenant");
  const tenantCode = tIdx >= 0 ? process.argv[tIdx + 1] : "CAPITALBUS";

  const tenant =
    (await prisma.tenant.findFirst({ where: { code: tenantCode } })) ??
    (await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!tenant) { console.error("✗ No se encontró el tenant."); process.exit(1); }
  const tenantId = tenant.id;

  const creator =
    (await prisma.user.findFirst({ where: { tenantId, email: "gerenciatactica@upkeepservices.com.co" } })) ??
    (await prisma.user.findFirst({ where: { tenantId, role: "ADMIN" } }));
  const creatorId = creator?.id ?? null;

  // Resolver responsables (únicos) por nombre.
  const respByName = new Map<string, Usr>();
  for (const n of Array.from(new Set(DATA.map((d) => d.resp)))) {
    const u = await resolveResp(tenantId, n);
    respByName.set(n, u);
    console.log(`Responsable "${n}": ${u ? `${u.name} (${u.id})` : "✗ NO encontrado (se creará sin responsable)"}`);
  }

  const maxAgg = await prisma.case.aggregate({ where: { tenantId }, _max: { caseNo: true } });
  let nextNo = (maxAgg._max.caseNo ?? 0) + 1;

  console.log(`\nModo: ${apply ? "APLICAR (escribe en BD)" : "DRY-RUN (no toca nada)"}  ·  Tenant: ${tenantCode}  ·  Fecha: ${FECHA}`);
  console.log(`Filas: ${DATA.length}  ·  Próximo # de caso: ${nextNo}\n`);

  const dayStart = atCot(FECHA, "00:00");
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
  const when = atCot(FECHA, "10:00");

  let toCreate = 0, dup = 0, created = 0;
  const missing: number[] = [];

  for (const row of DATA) {
    const candidates = [`K${row.bus}`, `${row.bus}`, `k${row.bus}`];
    let bus: { id: string; code: string } | null = null;
    for (const code of candidates) {
      bus = await prisma.bus.findFirst({ where: { tenantId, code }, select: { id: true, code: true } });
      if (bus) break;
    }
    if (!bus) { missing.push(row.bus); console.log(`  ✗ Bus ${row.bus}: no encontrado`); continue; }

    const exists = await prisma.case.findFirst({
      where: { tenantId, busId: bus.id, type: CaseType.PREVENTIVO, createdAt: { gte: dayStart, lt: dayEnd } },
      select: { caseNo: true },
    });
    if (exists) { dup += 1; console.log(`  = ${bus.code}: ya existe (caso #${exists.caseNo}), se omite`); continue; }

    const resp = respByName.get(row.resp) ?? null;
    const respLabel = resp ? resp.name : "(sin responsable)";
    console.log(`  + ${bus.code}  ->  caso #${nextNo} · OT ${row.ot} · ${respLabel}`);
    toCreate += 1;

    if (apply) {
      const c = await prisma.case.create({
        data: {
          tenantId, caseNo: nextNo, busId: bus.id,
          type: CaseType.PREVENTIVO, status: CaseStatus.RESUELTO, priority: 3,
          assignedToId: resp?.id ?? null,
          title: `Mantenimiento preventivo ${bus.code}`,
          description: `Mantenimiento preventivo del bus ${bus.code} (${FECHA}). OT ${row.ot}.`,
          createdAt: when,
        },
        select: { id: true },
      });
      await prisma.$executeRawUnsafe(`UPDATE "Case" SET "updatedAt" = $1 WHERE "id" = $2`, when, c.id);

      await prisma.workOrder.create({
        data: {
          tenantId, caseId: c.id, workOrderNo: row.ot,
          status: WorkOrderStatus.FINALIZADA,
          assignedToId: resp?.id ?? null,
          assignedAt: resp ? when : null,
          finishedAt: when,
        },
      });

      await prisma.caseEvent.create({ data: { caseId: c.id, type: CaseEventType.CREATED, createdAt: when, message: "Caso creado (importación preventivos 23/jun)", meta: { userId: creatorId, source: "import-preventivos-23jun", workOrderNo: row.ot } } });
      await prisma.caseEvent.create({ data: { caseId: c.id, type: CaseEventType.STATUS_CHANGE, createdAt: when, message: "Caso resuelto (preventivo realizado)", meta: { from: "NUEVO", to: "RESUELTO", source: "import-preventivos-23jun" } } });
      if (resp) {
        await prisma.caseEvent.create({ data: { caseId: c.id, type: CaseEventType.ASSIGNED, createdAt: when, message: `Responsable del caso: ${resp.name}`, meta: { assignedToId: resp.id, by: creatorId, source: "import-preventivos-23jun" } } });
      }
      created += 1;
    }
    nextNo += 1;
  }

  console.log(`\n=== Totales ===`);
  console.log(`  Por crear: ${toCreate}  ·  Ya existían: ${dup}  ·  Buses no encontrados: ${missing.length}`);
  if (missing.length) console.log(`  Buses no encontrados: ${missing.join(", ")}`);
  if (apply) console.log(`  ✓ Casos creados: ${created}`);
  else console.log(`\n(DRY-RUN: no se creó nada. Agrega --apply para crear.)`);
  await prisma.$disconnect();
}

main().catch(async (err) => { console.error("✗ Falló:", err); await prisma.$disconnect(); process.exit(1); });
