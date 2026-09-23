/**
 * Sirve el MP4 (H.264/AAC) convertido para previsualización en el navegador.
 * Soporta `Range` para que el reproductor pueda buscar dentro del video.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fileStreamResponse } from "@/lib/http-range";
import { isTargetError, resolveMediaTarget } from "@/lib/media-target";
import { previewFilePath, previewKeyFor } from "@/lib/media-transcode";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return new Response("No autenticado", { status: 401 });

  const url = new URL(req.url);
  const target = await resolveMediaTarget(url.searchParams, session.user as any);
  if (isTargetError(target)) return new Response(target.error, { status: target.status });

  const stat = fs.statSync(target.abs);
  const key = previewKeyFor(target.identity, stat.size, stat.mtimeMs);
  const previewPath = previewFilePath(key);
  if (!previewPath) {
    return NextResponse.json({ error: "La previsualización aún no está lista" }, { status: 409 });
  }

  const nameRaw = url.searchParams.get("name") || path.basename(target.name);
  const base = nameRaw.replace(/\.[^.]+$/, "").replace(/[^\w.\- ]+/g, "_").slice(0, 100);

  return fileStreamResponse(previewPath, {
    contentType: "video/mp4",
    filename: `${base || "video"}_web.mp4`,
    disposition: url.searchParams.get("dl") === "1" ? "attachment" : "inline",
    cacheControl: "private, max-age=3600",
    rangeHeader: req.headers.get("range"),
  });
}
