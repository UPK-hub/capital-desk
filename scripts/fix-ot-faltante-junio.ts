import { prisma } from "@/lib/prisma";
import { CaseType, WorkOrderStatus } from "@prisma/client";

/**
 * Crea la Orden de Trabajo FALTANTE de los preventivos de junio que quedaron
 * sin OT (p.ej. K1438, cuyo import se frenó por número de OT repetido).
 * La crea igual que el import: FINALIZADA, inicio = apertura del caso (10 PM)
 * y fin = +6 h (4 AM), asignada al responsable del caso, SIN número.
 *
 * Dry-run por defecto; --apply para escribir.
 * Uso:  npm run fix:ot-faltante
 *       npm run fix:ot-faltante -- --apply
 */
const APPLY = process.argv.includes("--apply");

async function main() {
  const desde = new Date("2026-06-01T00:00:00-05:00");
  const hasta = new Date("2026-07-01T00:00:00-05:00");

  const sinOt = await prisma.case.findMany({
    where: {
      type: CaseType.PREVENTIVO,
      createdAt: { gte: desde, lt: hasta },
      workOrder: null,
    },
    select: {
      id: true,
      caseNo: true,
      tenantId: true,
      createdAt: true,
      assignedToId: true,
      bus: { select: { code: true } },
    },
    orderBy: { caseNo: "asc" },
  });

  console.log(`Preventivos de junio SIN orden de trabajo: ${sinOt.length}`);
  for (const c of sinOt) {
    const apertura = c.createdAt;
    const cierre = new Date(apertura.getTime() + 6 * 60 * 60 * 1000);
    console.log(`  #${c.caseNo ?? "s/n"} ${c.bus?.code ?? "?"} -> OT FINALIZADA ${apertura.toISOString()} → ${cierre.toISOString()}`);
    if (!APPLY) continue;
    await prisma.workOrder.create({
      data: {
        tenantId: c.tenantId,
        caseId: c.id,
        workOrderNo: null,
        status: WorkOrderStatus.FINALIZADA,
        ...(c.assignedToId ? { assignedToId: c.assignedToId, assignedAt: apertura } : {}),
        scheduledAt: apertura,
        scheduledTo: cierre,
        startedAt: apertura,
        finishedAt: cierre,
      },
    });
  }
  console.log(APPLY ? "Listo." : "SIMULACRO: nada creado. Usa -- --apply para crear.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Falló:", e);
  await prisma.$disconnect();
  process.exit(1);
});
