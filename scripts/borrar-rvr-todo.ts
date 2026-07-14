import { prisma } from "@/lib/prisma";
import { invalidateUploadsByPrefix } from "@/lib/uploads";

/**
 * BORRA TODAS las revisiones visuales remotas (RVR) para empezar de cero:
 *   - Todas las RemoteVisualReview y sus buses (caen en cascada).
 *   - Las evidencias subidas en RVR (archivos en disco + respaldo en BD,
 *     carpeta rvr/<reviewId>/...).
 *
 * NO toca los casos correctivos que se hayan creado desde RVR (esos son
 * casos reales del módulo de Casos y se conservan).
 *
 * El consecutivo vuelve a empezar: la próxima revisión será RVR-0001.
 *
 * Dry-run por defecto; --apply para borrar.
 * Uso:  npm run borrar:rvr
 *       npm run borrar:rvr -- --apply
 */
const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(APPLY ? "MODO APLICAR: se BORRAN todas las revisiones RVR." : "MODO SIMULACRO (dry-run): no se borra nada. Usa -- --apply para borrar.");
  console.log("");

  const reviews = await prisma.remoteVisualReview.findMany({
    orderBy: { reviewDate: "asc" },
    select: {
      id: true,
      reviewNo: true,
      reviewDate: true,
      status: true,
      _count: { select: { buses: true } },
    },
  });

  console.log(`Revisiones RVR encontradas: ${reviews.length}`);
  for (const r of reviews) {
    console.log(
      `  RVR-${String(r.reviewNo ?? 0).padStart(4, "0")}  fecha=${r.reviewDate.toISOString().slice(0, 10)}  estado=${r.status}  buses=${r._count.buses}`
    );
  }

  if (!APPLY) {
    console.log("");
    console.log("SIMULACRO: nada borrado. Ejecuta:  npm run borrar:rvr -- --apply");
    await prisma.$disconnect();
    return;
  }

  let evidenciasLimpiadas = 0;
  for (const r of reviews) {
    const res = await invalidateUploadsByPrefix(`rvr/${r.id}`).catch(() => null);
    if (res) evidenciasLimpiadas += res.removedBackup;
  }

  const del = await prisma.remoteVisualReview.deleteMany({});
  console.log("");
  console.log(`Listo. Revisiones borradas: ${del.count} (sus buses cayeron en cascada).`);
  console.log(`Archivos de evidencia RVR limpiados: ${evidenciasLimpiadas}.`);
  console.log("La próxima revisión que se genere será RVR-0001.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("El borrado falló:", e);
  await prisma.$disconnect();
  process.exit(1);
});
