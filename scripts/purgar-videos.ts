/**
 * Purga los ARCHIVOS de video de solicitudes antiguas para liberar disco.
 *
 * - Solo toca adjuntos de tipo VIDEO; las actas/PDF (kind OTRO) NO se tocan.
 * - Borra el archivo del disco y marca el adjunto como inactivo: el registro
 *   sigue en la base (nombre, tamaño, quién lo subió) y desaparece de la lista
 *   de adjuntos de la solicitud.
 * - Los casos, las actas y el histórico quedan intactos.
 *
 * DRY-RUN por defecto (no borra nada):
 *   npm run videos:purgar -- --antes 2026-07-01
 *   npm run videos:purgar -- --antes 2026-07-01 --apply
 *
 * Opcional: --huerfanos borra también archivos sueltos en uploads/video-requests
 * que ya no están referenciados en la base (subidas que fallaron a medias).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { VideoAttachmentKind } from "@prisma/client";
import { getUploadsRoot, resolveUploadPath, normalizeUploadRelPath } from "@/lib/uploads";

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? String(process.argv[i + 1] ?? "") : null;
}

const GB = 1024 * 1024 * 1024;
const gb = (bytes: number) => (bytes / GB).toFixed(2) + " GB";
const mes = (d: Date) => d.toISOString().slice(0, 7);

async function sizeOnDisk(abs: string): Promise<number | null> {
  try {
    const st = await fs.stat(abs);
    return st.isFile() ? st.size : null;
  } catch {
    return null;
  }
}

async function walk(dir: string, out: { abs: string; size: number; mtime: Date }[]) {
  let entries: any[] = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walk(abs, out);
    } else if (e.isFile()) {
      try {
        const st = await fs.stat(abs);
        out.push({ abs, size: st.size, mtime: st.mtime });
      } catch {
        /* ignorar */
      }
    }
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const conHuerfanos = process.argv.includes("--huerfanos");
  const antesRaw = arg("--antes");
  if (!antesRaw) {
    console.error('Falta la fecha de corte. Ejemplo: npm run videos:purgar -- --antes 2026-07-01');
    process.exit(1);
  }
  const cutoff = new Date(`${antesRaw}T00:00:00.000Z`);
  if (Number.isNaN(cutoff.getTime())) {
    console.error(`Fecha inválida: ${antesRaw}. Usa el formato AAAA-MM-DD.`);
    process.exit(1);
  }

  console.log("\n=== Purga de videos ===");
  console.log(`Modo:      ${apply ? "APLICAR (borra archivos)" : "PRUEBA (no borra nada)"}`);
  console.log(`Corte:     videos subidos antes de ${cutoff.toISOString().slice(0, 10)}`);
  console.log(`Uploads:   ${getUploadsRoot()}`);
  console.log(`Huérfanos: ${conHuerfanos ? "sí, también se limpian" : "no (solo se informan)"}\n`);

  const attachments = await prisma.videoAttachment.findMany({
    where: { kind: VideoAttachmentKind.VIDEO, active: true, createdAt: { lt: cutoff } },
    select: { id: true, filePath: true, size: true, createdAt: true, requestId: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Adjuntos de video candidatos: ${attachments.length}`);

  const porMes = new Map<string, { n: number; bytes: number }>();
  let bytesEnDisco = 0;
  let faltantes = 0;
  const aBorrar: { id: string; abs: string | null; relPath: string; bytes: number }[] = [];

  for (const a of attachments) {
    let abs: string | null = null;
    try {
      abs = resolveUploadPath(a.filePath);
    } catch {
      abs = null;
    }
    const real = abs ? await sizeOnDisk(abs) : null;
    if (real == null) faltantes += 1;
    const bytes = real ?? 0;
    bytesEnDisco += bytes;
    const k = mes(a.createdAt);
    const acc = porMes.get(k) ?? { n: 0, bytes: 0 };
    acc.n += 1;
    acc.bytes += bytes;
    porMes.set(k, acc);
    aBorrar.push({ id: a.id, abs, relPath: normalizeUploadRelPath(a.filePath), bytes });
  }

  console.log("\nPor mes de subida:");
  for (const k of [...porMes.keys()].sort()) {
    const v = porMes.get(k)!;
    console.log(`  ${k}   ${String(v.n).padStart(5)} archivos   ${gb(v.bytes).padStart(10)}`);
  }
  console.log(`\nEspacio a liberar (archivos presentes en disco): ${gb(bytesEnDisco)}`);
  if (faltantes) console.log(`Adjuntos cuyo archivo ya no está en disco: ${faltantes} (solo se marcan como inactivos)`);

  // Huérfanos: archivos en disco que ninguna fila de la base referencia.
  let huerfanos: { abs: string; size: number }[] = [];
  const rootVideos = path.join(getUploadsRoot(), "video-requests");
  const enDisco: { abs: string; size: number; mtime: Date }[] = [];
  await walk(rootVideos, enDisco);
  if (enDisco.length) {
    const todos = await prisma.videoAttachment.findMany({ select: { filePath: true } });
    const conocidos = new Set(
      todos.map((t) => {
        try {
          return resolveUploadPath(t.filePath).toLowerCase();
        } catch {
          return "";
        }
      })
    );
    huerfanos = enDisco
      .filter((f) => !conocidos.has(f.abs.toLowerCase()) && f.mtime < cutoff)
      .map((f) => ({ abs: f.abs, size: f.size }));
    const bytesH = huerfanos.reduce((s, f) => s + f.size, 0);
    console.log(`\nArchivos huérfanos anteriores al corte: ${huerfanos.length} (${gb(bytesH)})`);
  }

  if (!apply) {
    console.log("\nModo prueba: no se borró nada. Vuelve a correrlo con --apply para ejecutar.\n");
    await prisma.$disconnect();
    return;
  }

  let borrados = 0;
  let liberados = 0;
  for (const item of aBorrar) {
    if (item.abs) {
      try {
        await fs.unlink(item.abs);
        borrados += 1;
        liberados += item.bytes;
      } catch (e: any) {
        if (String(e?.code) !== "ENOENT") {
          console.error(`  No se pudo borrar ${item.relPath}: ${e?.message ?? e}`);
          continue;
        }
      }
    }
    await prisma.videoAttachment.update({ where: { id: item.id }, data: { active: false } });
    await prisma.uploadBackup.deleteMany({ where: { filePath: item.relPath } });
    if (borrados % 100 === 0 && borrados) console.log(`  ...${borrados} archivos borrados (${gb(liberados)})`);
  }

  let borradosH = 0;
  let liberadosH = 0;
  if (conHuerfanos) {
    for (const f of huerfanos) {
      try {
        await fs.unlink(f.abs);
        borradosH += 1;
        liberadosH += f.size;
      } catch {
        /* ignorar */
      }
    }
  }

  console.log(`\nListo.`);
  console.log(`  Videos borrados:   ${borrados}  (${gb(liberados)})`);
  console.log(`  Adjuntos marcados: ${aBorrar.length}`);
  if (conHuerfanos) console.log(`  Huérfanos borrados: ${borradosH}  (${gb(liberadosH)})`);
  console.log("");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
