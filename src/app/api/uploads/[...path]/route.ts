// src/app/uploads/[...path]/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUploadsRoot, getUploadBackup, normalizeUploadRelPath, resolveUploadPath } from "@/lib/uploads";

// Seguridad: los archivos solo se sirven a usuarios con sesión activa,
// o a integraciones (bots) que envíen un secreto válido en `x-integration-secret`.
function integrationSecretOk(req: NextRequest) {
  const provided = String(req.headers.get("x-integration-secret") || "").trim();
  if (!provided) return false;
  const secrets = [
    process.env.NOVEDADES_INTAKE_SECRET,
    process.env.INTEGRATION_INGEST_SECRET,
    process.env.INTEGRATION_VIDEO_SECRET,
  ]
    .map((s) => String(s ?? "").trim())
    .filter(Boolean);
  return secrets.includes(provided);
}


const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
};

function contentTypeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

function parseRange(rangeHeader: string | null, size: number) {
  if (!rangeHeader || size <= 0) return null;

  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;

  const [, startRaw, endRaw] = match;
  if (!startRaw && !endRaw) return null;

  let start: number;
  let end: number;

  if (!startRaw) {
    const suffixLength = Number(endRaw);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number(startRaw);
    end = endRaw ? Number(endRaw) : size - 1;
  }

  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  if (start < 0 || start >= size || end < start) return null;

  return { start, end: Math.min(end, size - 1) };
}

function rangeNotSatisfiable(size: number) {
  return new Response("Range Not Satisfiable", {
    status: 416,
    headers: {
      "Content-Range": `bytes */${size}`,
      "Accept-Ranges": "bytes",
    },
  });
}

export async function GET(
  req: NextRequest,
  ctx: { params: { path: string[] } }
) {
  if (!integrationSecretOk(req)) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new Response("No autenticado", { status: 401 });
    }
  }

  const rel = normalizeUploadRelPath((ctx.params.path || []).join("/"));
  if (!rel) return new Response("No encontrado", { status: 404 });

  let filePath = "";
  try {
    // Resuelve ruta absoluta usando helper oficial
    filePath = resolveUploadPath(rel);
  } catch {
    return new Response("Ruta inválida", { status: 400 });
  }

  // Seguridad: evita path traversal
  const uploadsRoot = path.resolve(getUploadsRoot());
  if (filePath !== uploadsRoot && !filePath.startsWith(uploadsRoot + path.sep)) {
    return new Response("Ruta inválida", { status: 400 });
  }

  // Nombre de descarga opcional (?name=) y forzar descarga (?dl=1).
  const reqUrl = new URL(req.url);
  const overrideName = reqUrl.searchParams.get("name");
  const cleanOverride = overrideName
    ? overrideName.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120)
    : null;
  const dispoType = reqUrl.searchParams.get("dl") === "1" ? "attachment" : "inline";

  if (!fs.existsSync(filePath)) {
    const backup = await getUploadBackup(rel);
    if (!backup) return new Response("No encontrado", { status: 404 });

    const content = Buffer.from(backup.content);
    const filename = backup.originalName || path.basename(rel);
    const contentType = backup.mimeType || contentTypeFromPath(filename);
    const range = parseRange(req.headers.get("range"), content.length);

    if (req.headers.get("range") && !range) return rangeNotSatisfiable(content.length);
    if (range) {
      const chunk = content.subarray(range.start, range.end + 1);
      return new Response(chunk, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(chunk.length),
          "Content-Range": `bytes ${range.start}-${range.end}/${content.length}`,
          "Accept-Ranges": "bytes",
          "Content-Disposition": `${dispoType}; filename="${cleanOverride || filename}"`,
          "Cache-Control": "private, max-age=60",
        },
      });
    }

    return new Response(content, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(backup.sizeBytes || content.length),
        "Accept-Ranges": "bytes",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  }

  const stat = fs.statSync(filePath);
  const filename = path.basename(filePath);
  const contentType = contentTypeFromPath(filePath);
  const range = parseRange(req.headers.get("range"), stat.size);

  if (req.headers.get("range") && !range) return rangeNotSatisfiable(stat.size);
  if (range) {
    const partialStream = fs.createReadStream(filePath, { start: range.start, end: range.end });
    // @ts-expect-error Node stream -> Web Response (runtime nodejs)
    return new Response(partialStream, {
      status: 206,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(range.end - range.start + 1),
        "Content-Range": `bytes ${range.start}-${range.end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  }

  const stream = fs.createReadStream(filePath);
  // @ts-expect-error Node stream -> Web Response (runtime nodejs)
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(stat.size),
      "Accept-Ranges": "bytes",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
