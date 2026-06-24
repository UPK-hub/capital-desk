/**
 * Crea la Orden de Trabajo (OT) para los casos PREVENTIVO que no tienen una,
 * programada el día en que se cerró el caso (createdAt del caso). Sin técnico
 * (queda para editar luego desde "Responsable del caso"). NO cambia el estado
 * del caso (sigue Resuelto).
 *
 * Idempotente: solo toca preventivos sin OT.
 * DRY-RUN por defecto; --apply para aplicar.
 *   npm run backfill:preventivo-ot
 *   npm run backfill:preventivo-ot -- --apply
 *   npm run backfill:preventivo-ot -- --apply --tenant CAPITALBUS
 */
import { prisma } from "@/lib/prisma";
import { CaseType, WorkOrderStatus } from "@prisma/client";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const tIdx = args.indexOf("--tenant");
  const tenantCode = tIdx >= 0 ? args[tIdx + 1] : "CAPITALBUS";

  const tenant = await prisma.tenant.findFirst({ where: { code: tenantCode } });
  if (!tenant) {
    console.error(`✗ No se encontró tenant con code="${tenantCode}".`);
    process.exit(1);
  }
  const tenantId = tenant.id;

  const cases = await prisma.case.findMany({
    where: { tenantId, type: CaseType.PREVENTIVO, workOrder: null },
    select: { id: true, caseNo: true, createdAt: true, bus: { select: { code: true } } },
    orderBy: { caseNo: "asc" },
  });

  console.log("");
  console.log(`Modo:   ${apply ? "APLICAR" : "DRY-RUN (solo lectura)"}`);
  console.log(`Tenant: ${tenantCode}`);
  console.log(`Preventivos sin OT: ${cases.length}`);
  console.log("");
  for (const c of cases) {
    console.log(
      `  Caso #${c.caseNo}  bus=${c.bus?.code ?? "?"}  OT programada=${c.createdAt.toISOString().slice(0, 10)}`
    );
  }

  if (cases.length === 0) {
    console.log("Nada por hacer: todos los preventivos ya tienen OT.");
    await prisma.$disconnect();
    return;
  }
  if (!apply) {
    console.log("");
    console.log("DRY-RUN: no se creó nada. Ejecuta con --apply para generar las OT.");
    await prisma.$disconnect();
    return;
  }

  let created = 0;
  for (const c of cases) {
    const sched = new Date(c.createdAt);
    const schedTo = new Date(sched.getTime() + 60 * 60 * 1000);
    // Sin workOrderNo: el número de OT lo asigna CapitalBus y se edita luego en el caso.
    await prisma.workOrder.create({
      data: {
        tenantId,
        caseId: c.id,
        status: WorkOrderStatus.CREADA,
        scheduledAt: sched,
        scheduledTo: schedTo,
      },
    });
    created += 1;
  }

  console.log("");
  console.log(`✓ Listo. OT creadas: ${created}.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("✗ Backfill OT falló:", err);
  await prisma.$disconnect();
  process.exit(1);
});
