import { prisma } from "@/lib/prisma";
import { CaseEventType } from "@prisma/client";

/**
 * Corrige la HORA de los preventivos IMPORTADOS (los del import-preventivos),
 * según la lógica real del trabajo nocturno:
 *
 *   - Apertura (creación del caso y evento CREATED): 10:00 PM hora Colombia
 *     del día del mantenimiento (antes quedó a las 10:00 AM).
 *   - Cierre (updatedAt del caso y evento STATUS_CHANGE): 4:00 AM del día
 *     SIGUIENTE (el trabajo cruza la medianoche).
 *   - Evidencias (fotos del import-evidencia): misma hora del cierre (4:00 AM,
 *     cada foto un segundo después para conservar el orden).
 *
 * Solo toca los casos creados por la importación (evento CREATED con
 * meta.source = "import-preventivos"). Idempotente: correrlo dos veces deja
 * los mismos valores. Dry-run por defecto; usar --apply para escribir.
 *
 * Uso:  npm run fix:hora-preventivos            (simulacro)
 *       npm run fix:hora-preventivos -- --apply (aplica los cambios)
 */

const APPLY = process.argv.includes("--apply");
const HOURS_6 = 6 * 60 * 60 * 1000; // 22:00 -> 04:00 del día siguiente

// Día (YYYY-MM-DD) en hora Colombia de una fecha guardada.
function bogotaDateStr(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

async function main() {
  console.log(APPLY ? "MODO APLICAR: se escriben los cambios." : "MODO SIMULACRO (dry-run): no se escribe nada. Usa -- --apply para aplicar.");

  // Casos importados: evento CREATED con meta.source = import-preventivos.
  const createdEvents = await prisma.caseEvent.findMany({
    where: {
      type: CaseEventType.CREATED,
      meta: { path: ["source"], equals: "import-preventivos" },
    },
    select: {
      id: true,
      caseId: true,
      case: { select: { id: true, caseNo: true, createdAt: true } },
    },
  });

  console.log(`Casos importados encontrados: ${createdEvents.length}`);
  let cambiados = 0;
  let sinCambio = 0;

  for (const ev of createdEvents) {
    const kase = ev.case;
    const dia = bogotaDateStr(kase.createdAt); // día del mantenimiento (hora Colombia)
    const apertura = new Date(`${dia}T22:00:00-05:00`); // 10:00 PM
    const cierre = new Date(apertura.getTime() + HOURS_6); // 4:00 AM del día siguiente

    const yaOk = kase.createdAt.getTime() === apertura.getTime();
    if (yaOk) {
      sinCambio++;
      continue;
    }

    console.log(
      `  Caso #${kase.caseNo ?? "s/n"}: apertura ${kase.createdAt.toISOString()} -> ${apertura.toISOString()} · cierre -> ${cierre.toISOString()}`
    );
    cambiados++;
    if (!APPLY) continue;

    // 1) Caso: createdAt (apertura) y updatedAt (cierre; SQL crudo porque
    //    Prisma no deja sobrescribir @updatedAt).
    await prisma.case.update({ where: { id: kase.id }, data: { createdAt: apertura } });
    await prisma.$executeRaw`UPDATE "Case" SET "updatedAt" = ${cierre} WHERE "id" = ${kase.id}`;

    // 2) Evento CREATED -> apertura.
    await prisma.caseEvent.update({ where: { id: ev.id }, data: { createdAt: apertura } });

    // 3) Evento STATUS_CHANGE de la importación -> cierre.
    await prisma.caseEvent.updateMany({
      where: {
        caseId: kase.id,
        type: CaseEventType.STATUS_CHANGE,
        meta: { path: ["source"], equals: "import-preventivos" },
      },
      data: { createdAt: cierre },
    });

    // 4) Evidencias importadas (mensajes de chat del import-evidencia) ->
    //    misma hora del cierre, +1 segundo por foto para conservar el orden.
    const fotos = await prisma.caseChatMessage.findMany({
      where: { caseId: kase.id, meta: { path: ["source"], equals: "import-evidencia" } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    for (let i = 0; i < fotos.length; i++) {
      await prisma.caseChatMessage.update({
        where: { id: fotos[i].id },
        data: { createdAt: new Date(cierre.getTime() + i * 1000) },
      });
    }
  }

  console.log("");
  console.log(`Resumen: ${cambiados} caso(s) ${APPLY ? "corregidos" : "por corregir"}, ${sinCambio} ya estaban bien.`);
  if (!APPLY && cambiados > 0) {
    console.log("Revisa la lista y corre de nuevo con:  npm run fix:hora-preventivos -- --apply");
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("La corrección falló:", e);
  await prisma.$disconnect();
  process.exit(1);
});
