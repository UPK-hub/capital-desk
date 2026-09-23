/**
 * Descarga en un solo ZIP todos los clips de un evento de botón de pánico
 * (hasta 26 archivos: 13 cámaras x tramo previo y posterior).
 *
 *   GET /api/panic-events/<id>/zip
 *
 * Los clips viven en los volúmenes CBSTS1/CBSTS2, nunca se exponen por ruta
 * pública. El ZIP se arma en streaming, sin comprimir y sin cargar los
 * archivos en memoria.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewPanic } from "@/lib/panic/access";
import { resolveStoredClipPath } from "@/lib/panic/storage";
import { createZipStream, dedupeZipNames, safeZipName, type ZipEntry } from "@/lib/zip-stream";

function namePart(value: string) {
  return (
    String(value ?? "")
      .trim()
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "X"
  );
}

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!canViewPanic(session.user as any)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const event = await prisma.panicEvent.findFirst({
    where: { id: String(ctx.params.id), tenantId },
    include: {
      bus: { select: { code: true } },
      clips: { orderBy: [{ cameraKey: "asc" }, { segment: "asc" }, { receivedAt: "asc" }] },
    },
  });
  if (!event) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (!event.clips.length) {
    return NextResponse.json({ error: "Este evento no tiene clips para descargar." }, { status: 404 });
  }

  const found: Array<{ abs: string; size: number; mtime: Date; label: string }> = [];

  for (const clip of event.clips) {
    const abs = resolveStoredClipPath(clip.storage, clip.filePath);
    if (!abs) continue;
    let stat: fs.Stats;
    try {
      stat = fs.statSync(abs);
    } catch {
      continue;
    }
    const camera = clip.cameraKey?.trim() || "sin-camara";
    const fileName = clip.filename || path.basename(clip.filePath);
    found.push({
      abs,
      size: stat.size,
      mtime: stat.mtime,
      label: `${safeZipName(camera)}/${safeZipName(fileName)}`,
    });
  }

  if (!found.length) {
    return NextResponse.json(
      { error: "Los archivos de este evento ya no están disponibles en el almacenamiento." },
      { status: 404 }
    );
  }

  const names = dedupeZipNames(found.map((f) => f.label));
  const entries: ZipEntry[] = found.map((f, i) => ({
    name: names[i],
    absPath: f.abs,
    size: f.size,
    mtime: f.mtime,
  }));

  const busCode = event.bus?.code ?? event.busCode ?? event.vehicleId ?? "BUS";
  const fecha = (event.eventAt ?? event.receivedAt ?? new Date()).toISOString().slice(0, 10);
  const zipBase = `Panico_${namePart(String(busCode))}_${namePart(fecha)}`;

  const stream = createZipStream(entries);
  // @ts-expect-error Node stream -> Web Response (runtime nodejs)
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipBase}.zip"`,
      "Cache-Control": "no-store",
      "X-Zip-Files": String(entries.length),
    },
  });
}
