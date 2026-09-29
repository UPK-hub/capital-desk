/**
 * Reencola los adjuntos que quedaron replicados en una ruta que ya no
 * corresponde a la estructura actual, para que vuelvan a subir al lugar
 * correcto.
 *
 * Caso de uso: los primeros archivos del backfill cayeron en carpetas de mes
 * sin el cero delante ("4 - Abril" en vez de "04 - Abril").
 *
 *   npm run onedrive:recolocar             simula
 *   npm run onedrive:recolocar -- --apply  reencola
 *
 * Los archivos viejos NO se borran del OneDrive: hay que eliminar a mano la
 * carpeta que queda vacia de contenido util.
 */

import "./cargar-env";
import { OneDriveSyncStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { construirRutaRemota } from "@/lib/onedrive/sync";

const APPLY = process.argv.includes("--apply");

async function main() {
  const replicados = await prisma.videoAttachment.findMany({
    where: { active: true, odStatus: OneDriveSyncStatus.REPLICADO, odPath: { not: null } },
    select: {
      id: true,
      filePath: true,
      originalName: true,
      odPath: true,
      createdAt: true,
      request: {
        select: { case: { select: { caseNo: true, createdAt: true, bus: { select: { code: true } } } } },
      },
    },
  });

  const desubicados: { id: string; antes: string; ahora: string }[] = [];

  for (const a of replicados) {
    const esperada = construirRutaRemota({
      creadoEn: a.request?.case?.createdAt ?? a.createdAt,
      codigoBus: a.request?.case?.bus?.code,
      caseNo: a.request?.case?.caseNo,
      nombreArchivo: a.originalName ?? a.filePath,
    });
    if (esperada !== a.odPath) {
      desubicados.push({ id: a.id, antes: String(a.odPath), ahora: esperada });
    }
  }

  console.log(`\nReplicados revisados: ${replicados.length}`);
  console.log(`Fuera de la estructura actual: ${desubicados.length}\n`);

  for (const d of desubicados.slice(0, 20)) {
    console.log(`  antes: ${d.antes}`);
    console.log(`  ahora: ${d.ahora}\n`);
  }
  if (desubicados.length > 20) console.log(`  ... y ${desubicados.length - 20} mas\n`);

  if (!APPLY) {
    console.log("SIMULACION. Nada se ha modificado. Agrega --apply para reencolar.\n");
    return;
  }

  if (!desubicados.length) {
    console.log("No hay nada que recolocar.\n");
    return;
  }

  const r = await prisma.videoAttachment.updateMany({
    where: { id: { in: desubicados.map((d) => d.id) } },
    data: {
      odStatus: OneDriveSyncStatus.PENDIENTE,
      odAttempts: 0,
      odError: null,
      odNextAttemptAt: new Date(),
    },
  });

  console.log(`Reencolados ${r.count} adjuntos. Se volveran a subir a la ruta correcta.`);
  console.log("Las copias viejas quedan en el OneDrive: borra esas carpetas a mano.\n");
}

main()
  .catch((e) => {
    console.error("FALLO:", e?.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
