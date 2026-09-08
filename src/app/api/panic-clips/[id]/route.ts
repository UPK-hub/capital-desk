export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reproducción y descarga de un clip de botón de pánico.
// El archivo vive en CBSTS1/CBSTS2, nunca se expone por ruta pública: se sirve
// aquí, con sesión válida y permiso del módulo, y con soporte de Range para que
// el navegador pueda saltar dentro del video sin descargarlo completo.

import fs from "node:fs";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewPanic } from "@/lib/panic/access";
import { resolveStoredClipPath } from "@/lib/panic/storage";

function parseRange(rangeHeader: string | null, size: number) {
  if (!rangeHeader || size <= 0) return null;
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;

  const [, startRaw, endRaw] = match;
  if (!startRaw && !endRaw) return null;

  let start: number;
  let end: number;

  if (!startRaw) {
    const suffix = Number(endRaw);
    if (!Number.isInteger(suffix) || suffix <= 0) return null;
    start = Math.max(size - suffix, 0);
    end = size - 1;
  } else {
    start = Number(startRaw);
    end = endRaw ? Number(endRaw) : size - 1;
  }

  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  if (start < 0 || start >= size || end < start) return null;
  return { start, end: Math.min(end, size - 1) };
}

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return new Response("No autenticado", { status: 401 });
  if (!canViewPanic(session.user as any)) return new Response("No autorizado", { status: 403 });

  const tenantId = (session.user as any).tenantId as string;
  const clip = await prisma.panicVideoClip.findFirst({
    where: { id: ctx.params.id, tenantId },
    select: { filePath: true, storage: true, mimeType: true, filename: true },
  });
  if (!clip) return new Response("No encontrado", { status: 404 });

  const absPath = resolveStoredClipPath(clip.storage, clip.filePath);
  if (!absPath) return new Response("Volumen de almacenamiento no configurado", { status: 503 });

  let stat: fs.Stats;
  try {
    stat = fs.statSync(absPath);
  } catch {
    return new Response("Archivo no disponible en el almacenamiento", { status: 404 });
  }

  const contentType = clip.mimeType || "video/mp4";
  const filename = clip.filename || "clip.mp4";
  const forceDownload = new URL(req.url).searchParams.get("dl") === "1";
  const disposition = `${forceDownload ? "attachment" : "inline"}; filename="${filename}"`;
  const range = parseRange(req.headers.get("range"), stat.size);

  if (req.headers.get("range") && !range) {
    return new Response("Range Not Satisfiable", {
      status: 416,
      headers: { "Content-Range": `bytes */${stat.size}`, "Accept-Ranges": "bytes" },
    });
  }

  if (range) {
    const partial = fs.createReadStream(absPath, { start: range.start, end: range.end });
    // @ts-expect-error Node stream -> Web Response (runtime nodejs)
    return new Response(partial, {
      status: 206,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(range.end - range.start + 1),
        "Content-Range": `bytes ${range.start}-${range.end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Disposition": disposition,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const stream = fs.createReadStream(absPath);
  // @ts-expect-error Node stream -> Web Response (runtime nodejs)
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(stat.size),
      "Accept-Ranges": "bytes",
      "Content-Disposition": disposition,
      "Cache-Control": "private, no-store",
    },
  });
}
