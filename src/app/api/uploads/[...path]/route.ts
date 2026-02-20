// src/app/uploads/[...path]/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { getUploadsRoot, resolveUploadPath } from "@/lib/uploads";



export async function GET(
  _req: NextRequest,
  ctx: { params: { path: string[] } }
) {
  const rel = (ctx.params.path || []).join("/");
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
  // @ts-expect-error Node stream -> Web Response (runtime nodejs)
  return new Response(stream, { status: 200 });
}
