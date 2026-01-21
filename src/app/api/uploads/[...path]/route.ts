// src/app/uploads/[...path]/route.ts
import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { resolveUploadPath } from "@/lib/uploads";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: { path: string[] } }
) {
  const rel = (ctx.params.path || []).join("/");

  // Resuelve ruta absoluta usando helper oficial
  const filePath = resolveUploadPath(rel);

  // Seguridad: evita path traversal
  const uploadsRoot = path.resolve(process.cwd(), "uploads");
  if (!filePath.startsWith(uploadsRoot + path.sep)) {
    return new Response("Invalid path", { status: 400 });
  }

  if (!fs.existsSync(filePath)) {
    return new Response("Not found", { status: 404 });
  }

  const stream = fs.createReadStream(filePath);
  // @ts-expect-error Node stream -> Web Response (runtime nodejs)
  return new Response(stream, { status: 200 });
}
