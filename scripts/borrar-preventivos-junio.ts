import { prisma } from "@/lib/prisma";
import { invalidateUploadsByPrefix, resolveUploadPath } from "@/lib/uploads";
import { CaseEventType, CaseType } from "@prisma/client";
import fs from "node:fs";

/**
 * BORRA TODOS los preventivos de JUNIO 2026 (importados Y del bot/web), para
 * volverlos a crear con la lógica de horas correcta (apertura 10 PM, cierre
 * 4 AM del día siguiente).
 *
 * ⚠️ ANTES de correr esto con --apply, respalda:
 *      npm run export:ots                 (PDF de las OT cargadas)
 *      npm run export:preventivos-junio   (CSV bus,fecha + fotos de evidencia)
 *
 * Qué borra por cada caso:
 *   1. Pasos y fotos de la OT (WorkOrderStep / WorkOrderMedia).
 *   2. La Orden de Trabajo (y su PDF: archivo en disco + respaldo en BD).
 *   3. Las evidencias del chat (archivos en disco + respaldo en BD).
 *   4. El caso (eventos, chat y checklist caen en cascada).
 *
 * OJO: los preventivos del bot pierden su checklist y certificado (aceptado
 * por Valeria el 13-jul-2026). Dry-run por defecto; --apply para borrar.
 *
 * Uso:  npm run borrar:preventivos-junio
 *       npm run borrar:preventivos-junio -- --apply
 */

const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(APPLY ? "MODO APLICAR: se BORRAN los casos listados." : "MODO SIMULACRO (dry-run): no se borra nada. Usa -- --apply para borrar.");
  console.log("");

  const desde = new Date("2026-06-01T00:00:00-05:00");
  const hasta = new Date("2026-07-01T00:00:00-05:00");

  const cases = await prisma.case.findMany({
    where: { type: CaseType.PREVENTIVO, createdAt: { gte: desde, lt: hasta } },
    orderBy: { caseNo: "asc" },
    select: {
      id: true,
      caseNo: true,
      createdAt: true,
      status: true,
      bus: { select: { code: true } },
      workOrder: { select: { id: true, orderFilePath: true, orderFileName: true } },
      _count: { select: { chatMessages: true } },
      events: { where: { type: CaseEventType.CREATED }, select: { meta: true } },
    },
  });

  let importados = 0;
  let botWeb = 0;
  for (const c of cases) {
    const esImportado = c.events.some((e) => ((e.meta ?? {}) as any)?.source === "import-preventivos");
    if (esImportado) importados++;
    else botWeb++;
    console.log(
      `  #${c.caseNo ?? "s/n"}  bus=${c.bus?.code ?? "?"}  fecha=${c.createdAt.toISOString().slice(0, 10)}  ${
        esImportado ? "importado" : "bot/web"
      }  OT=${c.workOrder?.orderFilePath ? "sí" : "no"}  evidencias=${c._count.chatMessages}`
    );
  }

  console.log("");
  console.log(`Total a borrar: ${cases.length}  (importados: ${importados}, bot/web: ${botWeb})`);

  if (!APPLY) {
    console.log("");
    console.log("SIMULACRO: nada borrado. Verifica que ya corriste export:ots y export:preventivos-junio,");
    console.log("y luego ejecuta:  npm run borrar:preventivos-junio -- --apply");
    await prisma.$disconnect();
    return;
  }

  let borrados = 0;
  for (const c of cases) {
    // 1) PDF de la OT: respaldo en BD y archivo en disco.
    const otPath = c.workOrder?.orderFilePath ?? null;
    if (otPath) {
      await prisma.uploadBackup.deleteMany({ where: { filePath: otPath } }).catch(() => null);
      try {
        fs.unlinkSync(resolveUploadPath(otPath));
      } catch {
        // si no está en disco, no pasa nada (ya quedó exportado)
      }
    }

    // 2) Evidencias del chat (archivos + respaldos por prefijo del caso).
    await invalidateUploadsByPrefix(`case-chat/${c.id}`).catch(() => null);

    // 3) OT: primero fotos y pasos (no tienen cascada), luego la OT.
    if (c.workOrder?.id) {
      const steps = await prisma.workOrderStep.findMany({
        where: { workOrderId: c.workOrder.id },
        select: { id: true },
      });
      if (steps.length) {
        await prisma.workOrderMedia.deleteMany({
          where: { workOrderStepId: { in: steps.map((s) => s.id) } },
        });
        await prisma.workOrderStep.deleteMany({ where: { workOrderId: c.workOrder.id } });
      }
    }
    await prisma.workOrder.deleteMany({ where: { caseId: c.id } });

    // 4) El caso (eventos/chat/checklist en cascada).
    await prisma.case.delete({ where: { id: c.id } });
    borrados++;
    console.log(`  ✓ Borrado caso #${c.caseNo ?? "s/n"} (${c.bus?.code ?? "?"})`);
  }

  console.log("");
  console.log(`Listo. Casos borrados: ${borrados}.`);
  console.log("Recrear con:");
  console.log("  npm run import:preventivos -- --csv exports/preventivos-junio.csv --apply");
  console.log('  npm run import:ot-preventivo -- --dir "exports/ots-preventivos" ...');
  console.log('  npm run import:evidencias -- --csv exports/preventivos-junio.csv --dir "exports/evidencias-junio" --apply');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("El borrado falló:", e);
  await prisma.$disconnect();
  process.exit(1);
});
