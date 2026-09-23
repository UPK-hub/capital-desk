/**
 * Estado y disparo de la previsualización de video.
 *
 *   GET  /api/media/preview?path=<ruta>  |  ?clip=<id>   -> diagnóstico + estado
 *   POST /api/media/preview?path=<ruta>  |  ?clip=<id>   -> inicia la conversión
 *
 * La conversión corre en segundo plano; el cliente consulta el GET cada pocos
 * segundos para mostrar el avance y cambiar al archivo convertido al terminar.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import fs from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isTargetError, resolveMediaTarget } from "@/lib/media-target";
import {
  ensurePreview,
  isNativePlayable,
  previewKeyFor,
  previewStatus,
  probeFile,
  toolsAvailable,
} from "@/lib/media-transcode";

async function buildInfo(req: NextRequest, { start }: { start: boolean }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const target = await resolveMediaTarget(url.searchParams, session.user as any);
  if (isTargetError(target)) {
    return NextResponse.json({ error: target.error }, { status: target.status });
  }

  const stat = fs.statSync(target.abs);
  const key = previewKeyFor(target.identity, stat.size, stat.mtimeMs);
  const tools = await toolsAvailable();
  const probe = tools ? await probeFile(target.abs, key) : null;
  const nativePlayable = isNativePlayable(target.name, probe);

  if (start && nativePlayable !== true && tools) {
    await ensurePreview(target.identity, target.abs, stat.size, stat.mtimeMs);
  }

  const status = previewStatus(key);
  const query = url.searchParams.get("clip")
    ? `clip=${encodeURIComponent(String(url.searchParams.get("clip")))}`
    : `path=${encodeURIComponent(String(url.searchParams.get("path")))}`;

  return NextResponse.json({
    ok: true,
    tools,
    nativePlayable,
    sizeBytes: stat.size,
    probe: probe
      ? {
          videoCodec: probe.videoCodec,
          audioCodec: probe.audioCodec,
          pixelFormat: probe.pixelFormat,
          durationSeconds: probe.durationSeconds,
          width: probe.width,
          height: probe.height,
        }
      : null,
    preview: {
      state: status.state,
      progress: status.progress,
      error: status.error,
      sizeBytes: status.bytes,
      url: status.state === "ready" ? `/api/media/preview/file?${query}` : null,
    },
  });
}

export async function GET(req: NextRequest) {
  return buildInfo(req, { start: false });
}

export async function POST(req: NextRequest) {
  return buildInfo(req, { start: true });
}
