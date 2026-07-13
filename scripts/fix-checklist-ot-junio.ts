import { prisma } from "@/lib/prisma";
import { CaseType } from "@prisma/client";
import { normalizeChecklistData } from "@/lib/preventive/checklist-template";

/**
 * Rellena la sección IDENTIFICACIÓN del checklist de los preventivos de
 * JUNIO 2026 (los recreados por importación no traían checklist):
 *   - OT de Capital  = número de la orden de trabajo (workOrderNo)
 *   - Hora de inicio = 22:00
 *   - Hora de fin    = 04:00
 * Crea el checklist si no existe (status "completed", apertura/cierre con la
 * lógica nocturna y el responsable del caso). No pisa valores ya escritos.
 *
 * Dry-run por defecto; --apply para escribir.
 * Uso:  npm run fix:checklist-junio
 *       npm run fix:checklist-junio -- --apply
 */
const APPLY = process.argv.includes("--apply");

async function main() {
  const desde = new Date("2026-06-01T00:00:00-05:00");
  const hasta = new Date("2026-07-01T00:00:00-05:00");

  const cases = await prisma.case.findMany({
    where: { type: CaseType.PREVENTIVO, createdAt: { gte: desde, lt: hasta } },
    select: {
      id: true,
      caseNo: true,
      createdAt: true,
      bus: { select: { code: true } },
      workOrder: { select: { workOrderNo: true } },
      assignedTo: { select: { id: true, name: true } },
      preventiveChecklist: { select: { id: true, data: true, status: true } },
    },
    orderBy: { caseNo: "asc" },
  });

  console.log(`Preventivos de junio: ${cases.length}`);
  let cambiados = 0;
  let sinCambio = 0;

  for (const c of cases) {
    const data: any = normalizeChecklistData(c.preventiveChecklist?.data);
    const ident = (data.items.identificacion = data.items.identificacion ?? {});
    const otNo = c.workOrder?.workOrderNo != null ? String(c.workOrder.workOrderNo) : "";

    let cambio = false;
    if (otNo && !String(ident.otCapital?.value ?? "").trim()) {
      ident.otCapital = { ...(ident.otCapital ?? {}), value: otNo };
      cambio = true;
    }
    if (!String(ident.horaInicio?.value ?? "").trim()) {
      ident.horaInicio = { ...(ident.horaInicio ?? {}), value: "22:00" };
      cambio = true;
    }
    if (!String(ident.horaFin?.value ?? "").trim()) {
      ident.horaFin = { ...(ident.horaFin ?? {}), value: "04:00" };
      cambio = true;
    }
    if (!cambio && c.preventiveChecklist) {
      sinCambio++;
      continue;
    }

    cambiados++;
    console.log(`  #${c.caseNo ?? "s/n"} ${c.bus?.code ?? "?"}: OT=${otNo || "sin número"} · 22:00 → 04:00`);
    if (!APPLY) continue;

    const apertura = c.createdAt;
    const cierre = new Date(apertura.getTime() + 6 * 60 * 60 * 1000);
    if (c.preventiveChecklist) {
      await prisma.casePreventiveChecklist.update({
        where: { id: c.preventiveChecklist.id },
        data: { data },
      });
    } else {
      await prisma.casePreventiveChecklist.create({
        data: {
          caseId: c.id,
          status: "completed",
          data,
          aperturaAt: apertura,
          cierreAt: cierre,
          executedAt: cierre,
          ...(c.assignedTo
            ? {
                aperturaById: c.assignedTo.id,
                aperturaByName: c.assignedTo.name,
                cierreById: c.assignedTo.id,
                cierreByName: c.assignedTo.name,
                executedById: c.assignedTo.id,
                executedByName: c.assignedTo.name,
              }
            : {}),
        },
      });
    }
  }

  console.log("");
  console.log(`${APPLY ? "Actualizados" : "Por actualizar"}: ${cambiados} · sin cambios: ${sinCambio}`);
  if (!APPLY && cambiados) console.log("SIMULACRO: nada cambiado. Usa -- --apply para aplicar.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Falló:", e);
  await prisma.$disconnect();
  process.exit(1);
});
