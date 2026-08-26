/**
 * Recupera videos "eliminados" desde la aplicación cuyo ARCHIVO sigue en el disco.
 *
 * Al borrar un adjunto desde la app solo se marca como inactivo (borrado suave):
 * el archivo se queda en uploads. Este script busca esos casos y los vuelve a
 * dejar visibles en la solicitud.
 *
 * DRY-RUN por defecto (solo informa):
 *   npm run videos:recuperar
 *   npm run videos:recuperar -- --desde 2026-07-08
 *   npm run videos:recuperar -- --desde 2026-07-08 --apply
 */
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { VideoAttachmentKind } from "@prisma/client";
import { resolveUploadPath } from "@/lib/uploads";

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? String(process.argv[i + 1] ?? "") : null;
}

const gb = (b: number) => (b / (1024 * 1024 * 1024)).toFixed(2) + " GB";
const fecha = (d: Date) =>
  new Date(d).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" });

async function main() {
  const apply = process.argv.includes("--apply");
  const desdeRaw = arg("--desde");
  const desde = desdeRaw ? new Date(`${desdeRaw}T00:00:00.000Z`) : null;
  if (desdeRaw && Number.isNaN(desde!.getTime())) {
    console.error(`Fecha inválida: ${desdeRaw}. Usa AAAA-MM-DD.`);
    process.exit(1);
  }

  console.log("\n=== Recuperar videos eliminados desde la app ===");
  console.log(`Modo:  ${apply ? "APLICAR (los vuelve a mostrar)" : "PRUEBA (no cambia nada)"}`);
  console.log(`Desde: ${desde ? desde.toISOString().slice(0, 10) : "sin filtro (todos)"}\n`);

  const inactivos = await prisma.videoAttachment.findMany({
    where: {
      kind: VideoAttachmentKind.VIDEO,
      active: false,
      ...(desde ? { createdAt: { gte: desde } } : {}),
    },
    select: {
      id: true,
      filePath: true,
      originalName: true,
      camera: true,
      size: true,
      createdAt: true,
      request: { select: { case: { select: { caseNo: true, bus: { select: { code: true } } } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  const recuperables: { id: string; etiqueta: string; bytes: number }[] = [];
  let perdidos = 0;

  for (const a of inactivos) {
    let bytes = 0;
    try {
      const st = await fs.stat(resolveUploadPath(a.filePath));
      if (!st.isFile()) throw new Error("no es archivo");
      bytes = st.size;
    } catch {
      perdidos += 1;
      continue;
    }
    const caso = a.request?.case?.caseNo ?? "-";
    const bus = a.request?.case?.bus?.code ?? "-";
    recuperables.push({
      id: a.id,
      etiqueta: `CASO-${caso} · ${bus} · ${a.camera ?? "-"} · ${a.originalName || path.basename(a.filePath)} · ${fecha(a.createdAt)}`,
      bytes,
    });
  }

  console.log(`Adjuntos inactivos revisados: ${inactivos.length}`);
  console.log(`  Con el archivo AÚN en disco (recuperables): ${recuperables.length} (${gb(recuperables.reduce((s, r) => s + r.bytes, 0))})`);
  console.log(`  Sin archivo (borrados de verdad):           ${perdidos}\n`);

  if (recuperables.length) {
    console.log("Recuperables:");
    for (const r of recuperables.slice(0, 60)) console.log(`  ${r.etiqueta}`);
    if (recuperables.length > 60) console.log(`  ...y ${recuperables.length - 60} más`);
    console.log("");
  }

  if (!apply) {
    console.log("Modo prueba: no se cambió nada. Repite con --apply para recuperarlos.\n");
    await prisma.$disconnect();
    return;
  }

  for (const r of recuperables) {
    await prisma.videoAttachment.update({ where: { id: r.id }, data: { active: true } });
  }
  console.log(`Listo: ${recuperables.length} videos vuelven a aparecer en sus solicitudes.\n`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
