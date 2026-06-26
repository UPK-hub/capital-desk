/**
 * Ajusta las fechas de los 15 preventivos del lote "23 jun" ya creados:
 *   - CREADO  = 2026-06-23 22:00 (10 PM) hora Colombia
 *   - CERRADO = 2026-06-24 04:00 (4 AM del día siguiente) hora Colombia
 *
 * Cambia: Case.createdAt, Case.updatedAt, los eventos (CREATED/ASSIGNED → creado;
 * STATUS_CHANGE → cerrado) y la OT (assignedAt → creado; finishedAt → cerrado).
 * Identifica los casos por el evento CREATED con meta.source = "import-preventivos-23jun".
 *
 * Idempotente. DRY-RUN por defecto; --apply para aplicar.
 *   npx tsx scripts/ajustar-fechas-preventivos-23jun.ts
 *   npx tsx scripts/ajustar-fechas-preventivos-23jun.ts --apply
 */
import { prisma } from "@/lib/prisma";
import { CaseEventType, CaseType } from "@prisma/client";

const CREADO = new Date("2026-06-23T22:00:00-05:00");
const CERRADO = new Date("2026-06-24T04:00:00-05:00");
const SOURCE = "import-preventivos-23jun";

function fmt(d: Date) {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short", timeZone: "America/Bogota" }).format(d);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const tenant =
    (await prisma.tenant.findFirst({ where: { code: "CAPITALBUS" } })) ??
    (await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!tenant) { console.error("✗ No se encontró el tenant."); process.exit(1); }
  const tenantId = tenant.id;

  console.log(`\n=== Ajustar fechas preventivos 23/jun ===`);
  console.log(`Modo:    ${apply ? "APLICAR (escribe en BD)" : "PRUEBA (no toca nada)"}`);
  console.log(`Creado:  ${fmt(CREADO)}   ·   Cerrado: ${fmt(CERRADO)}\n`);

  const cases = await prisma.case.findMany({
    where: {
      tenantId,
      type: CaseType.PREVENTIVO,
      events: { some: { type: CaseEventType.CREATED, meta: { path: ["source"], equals: SOURCE } } },
    },
    select: {
      id: true, caseNo: true,
      bus: { select: { code: true } },
      workOrder: { select: { id: true } },
      events: { select: { id: true, type: true } },
    },
    orderBy: { caseNo: "asc" },
  });

  console.log(`Casos encontrados: ${cases.length}\n`);
  let n = 0;

  for (const c of cases) {
    if (apply) {
      // Fechas del caso (createdAt + updatedAt) con SQL crudo (evita @updatedAt).
      await prisma.$executeRawUnsafe(`UPDATE "Case" SET "createdAt" = $1, "updatedAt" = $2 WHERE "id" = $3`, CREADO, CERRADO, c.id);
      // Eventos: CREATED/ASSIGNED → creado; STATUS_CHANGE → cerrado.
      for (const ev of c.events) {
        const target = ev.type === CaseEventType.STATUS_CHANGE ? CERRADO : ev.type === CaseEventType.CREATED || ev.type === CaseEventType.ASSIGNED ? CREADO : null;
        if (target) await prisma.$executeRawUnsafe(`UPDATE "CaseEvent" SET "createdAt" = $1 WHERE "id" = $2`, target, ev.id);
      }
      // OT: assignedAt → creado; finishedAt → cerrado.
      if (c.workOrder) {
        await prisma.workOrder.update({ where: { id: c.workOrder.id }, data: { assignedAt: CREADO, finishedAt: CERRADO } });
      }
    }
    n++;
    console.log(`  ✔ #${c.caseNo} ${c.bus?.code ?? ""}: creado→${fmt(CREADO)} · cerrado→${fmt(CERRADO)}`);
  }

  console.log(`\n=== Totales ===`);
  console.log(`  ${apply ? "Ajustados" : "Se ajustarían"}: ${n}`);
  if (!apply) console.log(`\n(PRUEBA: no se escribió nada. Agrega --apply para aplicar.)`);
  await prisma.$disconnect();
}

main().catch(async (err) => { console.error("✗ Falló:", err); await prisma.$disconnect(); process.exit(1); });
