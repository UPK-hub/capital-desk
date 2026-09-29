/**
 * Estado de la cola de replica al OneDrive.
 *
 *   npm run onedrive:estado
 *
 * Muestra el conteo por estado y los ultimos adjuntos en ERROR con su motivo.
 */

import "./cargar-env";
import { prisma } from "@/lib/prisma";
import { resumenCola } from "@/lib/onedrive/sync";

async function main() {
  const resumen = await resumenCola();
  console.log("\nCola de replica a OneDrive\n");
  const etiquetas = ["PENDIENTE", "SUBIENDO", "REPLICADO", "ERROR", "OMITIDO"];
  for (const e of etiquetas) {
    console.log(`  ${e.padEnd(11)} ${resumen[e] ?? 0}`);
  }

  const errores = await prisma.videoAttachment.findMany({
    where: { odStatus: "ERROR" },
    orderBy: { createdAt: "desc" },
    take: 15,
    select: {
      id: true,
      originalName: true,
      odAttempts: true,
      odError: true,
      request: { select: { case: { select: { caseNo: true } } } },
    },
  });

  if (errores.length) {
    console.log("\nUltimos en ERROR:\n");
    for (const e of errores) {
      console.log(`  caso ${e.request?.case?.caseNo ?? "?"} | ${e.originalName ?? e.id} | intentos ${e.odAttempts}`);
      console.log(`     ${String(e.odError ?? "").slice(0, 160)}`);
    }
  }
  console.log("");
}

main()
  .catch((e) => {
    console.error("FALLO:", e?.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
