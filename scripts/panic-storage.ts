/**
 * Reporte de almacenamiento del módulo de botón de pánico.
 *
 *   npm run panic:almacenamiento
 *
 * Muestra el estado de cada volumen declarado en PANIC_STORAGE_VOLUMES
 * (espacio libre, umbral de desbordamiento, alcanzabilidad), cuánto material
 * hay guardado por volumen y una proyección de consumo con el ritmo observado
 * en los últimos 30 días frente a la política de retención vigente.
 */

import { PrismaClient } from "@prisma/client";
import { PANIC_RETENTION_YEARS } from "../src/lib/panic/config";
import { getVolumesUsage } from "../src/lib/panic/storage";

const prisma = new PrismaClient();
const GB = 1024 * 1024 * 1024;

function gb(value: number | null | undefined) {
  if (value === null || value === undefined) return "sin dato";
  return `${(value / GB).toFixed(1)} GB`;
}

async function main() {
  console.log("=== Volúmenes de almacenamiento ===");
  const usage = await getVolumesUsage();

  for (const volume of usage) {
    console.log(
      [
        `- ${volume.key.toUpperCase()}`,
        `ruta: ${volume.root}`,
        `libre: ${gb(volume.freeBytes)} de ${gb(volume.totalBytes)}`,
        `mínimo: ${gb(volume.minFreeBytes)}`,
        volume.usable ? "estado: disponible" : "estado: NO DISPONIBLE",
        volume.error ? `error: ${volume.error}` : "",
      ]
        .filter(Boolean)
        .join(" | ")
    );
  }

  console.log("\n=== Material guardado ===");
  const porVolumen = await prisma.panicVideoClip.groupBy({
    by: ["storage"],
    _count: { _all: true },
    _sum: { sizeBytes: true },
  });

  for (const row of porVolumen) {
    console.log(
      `- ${row.storage.toUpperCase()}: ${row._count._all} clips, ${gb(Number(row._sum.sizeBytes ?? 0))}`
    );
  }

  const desde = new Date();
  desde.setDate(desde.getDate() - 30);

  const ultimos = await prisma.panicVideoClip.aggregate({
    where: { receivedAt: { gte: desde } },
    _count: { _all: true },
    _sum: { sizeBytes: true },
  });

  const bytes30 = Number(ultimos._sum.sizeBytes ?? 0);
  const libreTotal = usage.reduce((acc, item) => acc + (item.freeBytes ?? 0), 0);

  console.log("\n=== Proyección ===");
  console.log(`- Últimos 30 días: ${ultimos._count._all} clips, ${gb(bytes30)}`);
  console.log(`- Política de retención: ${PANIC_RETENTION_YEARS} años`);

  if (bytes30 > 0) {
    const mesesDisponibles = libreTotal / bytes30;
    console.log(`- Espacio libre total: ${gb(libreTotal)}`);
    console.log(`- Autonomía estimada: ${mesesDisponibles.toFixed(1)} meses al ritmo actual`);
    console.log(
      `- Necesario para ${PANIC_RETENTION_YEARS} años al ritmo actual: ${gb(bytes30 * 12 * PANIC_RETENTION_YEARS)}`
    );
  } else {
    console.log("- Sin material recibido en los últimos 30 días: no hay base para proyectar.");
  }

  const incompletos = await prisma.panicEvent.count({ where: { complete: false } });
  console.log(`\nEventos con cargue incompleto: ${incompletos}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
