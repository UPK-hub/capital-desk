// src/app/uploads/[...path]/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { getUploadsRoot, resolveUploadPath } from "@/lib/uploads";


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
};

function contentTypeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

function normalizeIncomingUploadPath(raw: string): string {
  let value = String(raw ?? "").trim().replace(/\\/g, "/");
  value = value.replace(/^\/+/, "");
  value = value.replace(/^api\/uploads\//i, "");
  value = value.replace(/^uploads\//i, "");
  return value;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: { path: string[] } }
) {
  const rel = normalizeIncomingUploadPath((ctx.params.path || []).join("/"));
  if (!rel) return new Response("Not found", { status: 404 });

  let filePath = "";
  try {
    // Resuelve ruta absoluta usando helper oficial
    filePath = resolveUploadPath(rel);
  } catch {
    return new Response("Invalid path", { status: 400 });
  }

  // Seguridad: evita path traversal
  const uploadsRoot = path.resolve(getUploadsRoot());
  if (filePath !== uploadsRoot && !filePath.startsWith(uploadsRoot + path.sep)) {
    return new Response("Invalid path", { status: 400 });
  }

  if (!fs.existsSync(filePath)) {
    return new Response("Not found", { status: 404 });
  }

  const stream = fs.createReadStream(filePath);
  const stat = fs.statSync(filePath);
  const filename = path.basename(filePath);
  const contentType = contentTypeFromPath(filePath);
  // @ts-expect-error Node stream -> Web Response (runtime nodejs)
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(stat.size),
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
