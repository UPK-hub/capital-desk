/**
 * Utilidades para servir archivos con soporte de `Range` (HTTP 206).
 *
 * Es lo que permite que el reproductor de video del navegador pida solo el
 * pedazo que necesita (buscar en la barra de tiempo sin descargar todo) y que
 * los archivos grandes se reproduzcan en streaming.
 */

import fs from "node:fs";
import path from "node:path";

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
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".zip": "application/zip",
  ".rar": "application/vnd.rar",
  ".7z": "application/x-7z-compressed",
  // Video: importante declarar el tipo correcto. Con
  // `application/octet-stream` el navegador descarga en vez de reproducir.
  ".mp4": "video/mp4",
  ".m4v": "video/x-m4v",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".ogv": "video/ogg",
  ".ogg": "video/ogg",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".wmv": "video/x-ms-wmv",
  ".asf": "video/x-ms-asf",
  ".flv": "video/x-flv",
  ".3gp": "video/3gpp",
  ".mpg": "video/mpeg",
  ".mpeg": "video/mpeg",
  ".ts": "video/mp2t",
  ".m2ts": "video/mp2t",
  ".mts": "video/mp2t",
  // Formatos propios de DVR (no reproducibles en navegador, pero descargables).
  ".dav": "application/octet-stream",
  ".264": "application/octet-stream",
  ".h264": "application/octet-stream",
  ".ifv": "application/octet-stream",
};

export function contentTypeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

export function parseRange(rangeHeader: string | null, size: number) {
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

export function rangeNotSatisfiable(size: number) {
  return new Response("Range Not Satisfiable", {
    status: 416,
    headers: {
      "Content-Range": `bytes */${size}`,
      "Accept-Ranges": "bytes",
    },
  });
}

type FileResponseOptions = {
  contentType?: string;
  filename?: string;
  disposition?: "inline" | "attachment";
  cacheControl?: string;
  rangeHeader?: string | null;
};

/** Sirve un archivo del disco en streaming, respetando `Range`. */
export function fileStreamResponse(absPath: string, options: FileResponseOptions = {}) {
  const stat = fs.statSync(absPath);
  const contentType = options.contentType ?? contentTypeFromPath(absPath);
  const filename = options.filename ?? path.basename(absPath);
  const disposition = options.disposition ?? "inline";
  const cacheControl = options.cacheControl ?? "private, max-age=60";
  const range = parseRange(options.rangeHeader ?? null, stat.size);

  if (options.rangeHeader && !range) return rangeNotSatisfiable(stat.size);

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
        "Content-Disposition": `${disposition}; filename="${filename}"`,
        "Cache-Control": cacheControl,
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
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "Cache-Control": cacheControl,
    },
  });
}
