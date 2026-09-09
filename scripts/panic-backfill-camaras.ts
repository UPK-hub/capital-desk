/**
 * Rellena el código de cámara del NVR en los clips ya almacenados.
 *
 *   npm run panic:camaras            (simulación, no escribe)
 *   npm run panic:camaras -- --apply (aplica los cambios)
 *
 * Los primeros eventos se guardaron cuando la mesa solo conocía el número de
 * canal. El código real (BV3-2, BTE, BFE...) viene dentro del nombre del archivo
 * que envía el equipo, así que se extrae de ahí y se completan cameraCode, wagon
 * y la etiqueta que ve la mesa.
 */

import { PanicClipSegment, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APLICAR = process.argv.includes("--apply");

function codigoDesdeNombre(...candidatos: (string | null)[]): string | null {
  for (const candidato of candidatos) {
    const limpio = String(candidato ?? "").toUpperCase();
    if (!limpio) continue;
    // Se descarta el prefijo que agrega la mesa (cam10_) y se toma lo que va
    // antes del código de evento: "BV3-2EV909-09-2026-...".
    const sinPrefijo = limpio.replace(/^CAM\d+_/, "");
    const m = sinPrefijo.match(/^([A-Z0-9_-]+?)EV\d/);
    if (m && m[1]) return m[1];
  }
  return null;
}

function vagonDesdeCodigo(codigo: string): string | null {
  const m = codigo.match(/^([A-Z]*\d*)[-_ ]?\d+$/);
  return m && m[1] ? m[1] : null;
}

async function main() {
  const clips = await prisma.panicVideoClip.findMany({
    where: { cameraCode: null },
    select: {
      id: true,
      filename: true,
      originalName: true,
      channel: true,
      segment: true,
      cameraLabel: true,
    },
  });

  console.log(`Clips sin código de cámara: ${clips.length}`);
  if (!clips.length) return;

  let actualizados = 0;

  for (const clip of clips) {
    const codigo = codigoDesdeNombre(clip.originalName, clip.filename);
    if (!codigo) {
      console.log(`- ${clip.id}: no se pudo deducir el código (${clip.originalName ?? clip.filename})`);
      continue;
    }

    const tramo =
      clip.segment === PanicClipSegment.PREVIO ? "minuto previo" : "cinco minutos posteriores";
    const base = clip.channel !== null ? `Cámara ${clip.channel} · ${codigo}` : `Cámara ${codigo}`;
    const etiqueta = `${base} · ${tramo}`;

    console.log(`- ${codigo.padEnd(6)} canal ${String(clip.channel ?? "-").padStart(2)} -> ${etiqueta}`);

    if (APLICAR) {
      await prisma.panicVideoClip.update({
        where: { id: clip.id },
        data: {
          cameraCode: codigo,
          wagon: vagonDesdeCodigo(codigo),
          cameraLabel: etiqueta,
        },
      });
      actualizados += 1;
    }
  }

  console.log(
    APLICAR
      ? `\nActualizados ${actualizados} clips.`
      : "\nSimulación: no se escribió nada. Vuelve a ejecutar con --apply para aplicar."
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
