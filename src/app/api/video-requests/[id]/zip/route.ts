/**
 * Descarga en un solo ZIP todos los videos de una solicitud.
 *
 *   GET /api/video-requests/<id>/zip                 -> todos, en carpetas por cámara
 *   GET /api/video-requests/<id>/zip?camera=BV3-2    -> solo los de esa cámara
 *
 * El ZIP se arma en streaming (sin comprimir, los videos ya lo están), así que
 * la descarga empieza de inmediato y el servidor no carga los archivos en
 * memoria aunque sean varios GB.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { buildVideoRequestCaseScope } from "@/lib/access-control";
import { getUploadsRoot, normalizeUploadRelPath, resolveUploadPath } from "@/lib/uploads";
import { createZipStream, dedupeZipNames, safeZipName, type ZipEntry } from "@/lib/zip-stream";

function namePart(value: string) {
  return (
    String(value ?? "")
      .trim()
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "X"
  );
}

function fileExt(name: string) {
  const m = /\.[a-z0-9]{1,8}$/i.exec(name || "");
  return m ? m[0] : "";
}

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = (session.user as any).role as Role;
  if (![Role.ADMIN, Role.BACKOFFICE, Role.TECHNICIAN].includes(role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const capabilities = (session.user as any).capabilities as string[] | undefined;
  const userId = (session.user as any).id as string;
  const caseScope = await buildVideoRequestCaseScope({ tenantId, role, capabilities, userId });
  const requestId = String(ctx.params.id);

  const request = await prisma.videoDownloadRequest.findFirst({
    where: { id: requestId, case: { tenantId, ...caseScope } },
    include: { case: { select: { caseNo: true, bus: { select: { code: true } } } } },
  });
  if (!request) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const cameraFilter = (new URL(req.url).searchParams.get("camera") ?? "").trim() || null;

  const attachments = await prisma.videoAttachment.findMany({
    where: { requestId, ...(cameraFilter ? { camera: cameraFilter } : {}) },
    orderBy: [{ camera: "asc" }, { createdAt: "asc" }],
    select: { id: true, camera: true, filePath: true, originalName: true, createdAt: true },
  });

  if (!attachments.length) {
    return NextResponse.json({ error: "Esta solicitud no tiene videos para descargar." }, { status: 404 });
  }

  const busCode = request.case?.bus?.code ?? "BUS";
  const caseNo = request.case?.caseNo != null ? String(request.case.caseNo) : "";
  const uploadsRoot = path.resolve(getUploadsRoot());

  // Resolver rutas reales y descartar lo que ya no esté en disco.
  const found: Array<{ abs: string; size: number; mtime: Date; label: string }> = [];
  const missing: string[] = [];
  const perCamera = new Map<string, number>();

  for (const att of attachments) {
    const rel = normalizeUploadRelPath(att.filePath);
    let abs = "";
    try {
      abs = resolveUploadPath(rel);
    } catch {
      missing.push(att.originalName ?? att.filePath);
      continue;
    }
    if (abs !== uploadsRoot && !abs.startsWith(uploadsRoot + path.sep)) {
      missing.push(att.originalName ?? att.filePath);
      continue;
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(abs);
    } catch {
      missing.push(att.originalName ?? att.filePath);
      continue;
    }

    const camera = att.camera?.trim() || null;
    const ext = fileExt(att.originalName ?? rel) || ".mp4";
    const idx = camera ? perCamera.get(camera) ?? 0 : 0;
    if (camera) perCamera.set(camera, idx + 1);

    // Nombre legible: Bus_Cámara_CASO-N.mp4; sin cámara se conserva el original.
    const fileName = camera
      ? `${namePart(busCode)}_${namePart(camera)}_CASO-${namePart(caseNo)}${idx > 0 ? `_${idx + 1}` : ""}${ext}`
      : att.originalName || path.basename(rel);

    // Si se descarga todo, se agrupa en una carpeta por cámara dentro del ZIP.
    const label =
      !cameraFilter && camera
        ? `${safeZipName(camera)}/${safeZipName(fileName)}`
        : safeZipName(fileName || "video");

    found.push({ abs, size: stat.size, mtime: stat.mtime, label });
  }

  if (!found.length) {
    return NextResponse.json(
      { error: "Los archivos de esta solicitud ya no están disponibles en el servidor." },
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

  const zipBase = cameraFilter
    ? `${namePart(busCode)}_${namePart(cameraFilter)}_CASO-${namePart(caseNo)}`
    : `${namePart(busCode)}_CASO-${namePart(caseNo)}_videos`;

  const stream = createZipStream(entries);
  const headers: Record<string, string> = {
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${zipBase}.zip"`,
    "Cache-Control": "no-store",
    "X-Zip-Files": String(entries.length),
  };
  if (missing.length) headers["X-Zip-Missing"] = String(missing.length);

  // @ts-expect-error Node stream -> Web Response (runtime nodejs)
  return new Response(stream, { status: 200, headers });
}
