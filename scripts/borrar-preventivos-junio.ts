import { prisma } from "@/lib/prisma";
import { invalidateUploadsByPrefix, resolveUploadPath } from "@/lib/uploads";
import { CaseEventType } from "@prisma/client";
import fs from "node:fs";

/**
 * BORRA los preventivos de junio creados por la importación (los que tienen
 * evento CREATED con meta.source = "import-preventivos"), para volverlos a
 * crear con la lógica de horas correcta (apertura 10 PM, cierre 4 AM).
 *
 * ⚠️ ANTES de correr esto con --apply, descarga las OT cargadas:
 *      npm run export:ots
 *
 * Qué borra por cada caso:
 *   1. La Orden de Trabajo (y su PDF: archivo en disco + respaldo en BD).
 *   2. Las evidencias del chat (archivos en disco + respaldo en BD).
 *   3. El caso (sus eventos, chat y checklist se borran en cascada).
 *
 * NO toca preventivos creados por el bot ni por la web (solo los importados).
 * Dry-run por defecto; --apply para borrar de verdad.
 *
 * Uso:  npm run borrar:preventivos-junio
 *       npm run borrar:preventivos-junio -- --apply
 */

const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(APPLY ? "MODO APLICAR: se BORRAN los casos listados." : "MODO SIMULACRO (dry-run): no se borra nada. Usa -- --apply para borrar.");
  console.log("");

  const createdEvents = await prisma.caseEvent.findMany({
    where: {
      type: CaseEventType.CREATED,
      meta: { path: ["source"], equals: "import-preventivos" },
    },
    select: {
      caseId: true,
      case: {
        select: {
          id: true,
          caseNo: true,
          createdAt: true,
          bus: { select: { code: true } },
          workOrder: { select: { id: true, orderFilePath: true, orderFileName: true } },
          _count: { select: { chatMessages: true } },
        },
      },
    },
  });

  // Un caso puede tener más de un evento CREATED en teoría; deduplicar.
  const byCase = new Map<string, (typeof createdEvents)[number]["case"]>();
  for (const ev of createdEvents) byCase.set(ev.caseId, ev.case);
  const cases = Array.from(byCase.values()).sort((a, b) => (a.caseNo ?? 0) - (b.caseNo ?? 0));

  console.log(`Preventivos importados encontrados: ${cases.length}`);
  for (const c of cases) {
    console.log(
      `  #${c.caseNo ?? "s/n"}  bus=${c.bus?.code ?? "?"}  fecha=${c.createdAt.toISOString().slice(0, 10)}  OT=${
        c.workOrder?.orderFilePath ? `sí (${c.workOrder.orderFileName ?? "PDF"})` : "sin archivo"
      }  evidencias=${c._count.chatMessages}`
    );
  }

  if (!APPLY) {
    console.log("");
    console.log("SIMULACRO: nada borrado. Verifica la lista (y que ya corriste `npm run export:ots`),");
    console.log("y luego ejecuta:  npm run borrar:preventivos-junio -- --apply");
    await prisma.$disconnect();
    return;
  }

  let borrados = 0;
  for (const c of cases) {
    // 1) PDF de la OT: quitar respaldo en BD y archivo en disco.
    const otPath = c.workOrder?.orderFilePath ?? null;
    if (otPath) {
      await prisma.uploadBackup.deleteMany({ where: { filePath: otPath } }).catch(() => null);
      try {
        fs.unlinkSync(resolveUploadPath(otPath));
      } catch {
        // si no está en disco, no pasa nada (ya se exportó antes)
      }
    }

    // 2) Evidencias del chat (archivos + respaldos por prefijo del caso).
    await invalidateUploadsByPrefix(`case-chat/${c.id}`).catch(() => null);

    // 3) Orden de trabajo (no tiene borrado en cascada) y luego el caso
    //    (eventos/chat/checklist sí caen en cascada).
    await prisma.workOrder.deleteMany({ where: { caseId: c.id } });
    await prisma.case.delete({ where: { id: c.id } });
    borrados++;
    console.log(`  ✓ Borrado caso #${c.caseNo ?? "s/n"} (${c.bus?.code ?? "?"})`);
  }

  console.log("");
  console.log(`Listo. Casos borrados: ${borrados}.`);
  console.log("Ahora puedes recrearlos: npm run import:preventivos -- --apply, luego import:ot-preventivo e import:evidencias.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("El borrado falló:", e);
  await prisma.$disconnect();
  process.exit(1);
});
