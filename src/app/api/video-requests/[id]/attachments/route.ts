export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveUpload } from "@/lib/uploads";
import { Role, VideoAttachmentKind, VideoRequestEventType } from "@prisma/client";
import { buildVideoRequestCaseScope, isBackofficeRestricted, isVideosOnlyBackoffice } from "@/lib/access-control";

function fileExt(name: string) {
  const m = /\.[a-z0-9]{1,8}$/i.exec(name || "");
  return m ? m[0] : "";
}
function namePart(value: string) {
  return (
    String(value ?? "")
      .trim()
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "X"
  );
}

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as Role;
  if (![Role.ADMIN, Role.BACKOFFICE, Role.TECHNICIAN].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const capabilities = (session.user as any).capabilities as string[] | undefined;
  if (role === Role.BACKOFFICE && (isBackofficeRestricted(role, capabilities) || isVideosOnlyBackoffice(role, capabilities))) {
    return NextResponse.json({ error: "No tienes permisos para cargar archivos." }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const actorUserId = (session.user as any).id as string;
  const caseScope = buildVideoRequestCaseScope({ role, capabilities, userId: actorUserId });
  const requestId = String(ctx.params.id);

  const request = await prisma.videoDownloadRequest.findFirst({
    where: { id: requestId, case: { tenantId, ...caseScope } },
    include: { case: { select: { caseNo: true, bus: { select: { code: true } } } } },
  });
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const kind = String(form.get("kind") ?? "VIDEO") as VideoAttachmentKind;
  const cameraRaw = form.get("camera");
  const camera = cameraRaw ? String(cameraRaw).trim() || null : null;

  if (!file) return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });

  // Nombre automático del video: Bus_Cámara_CASO-N° (con índice si hay varios en la misma cámara).
  let displayName = file.name || null;
  if (camera) {
    const busCode = request.case?.bus?.code ?? "BUS";
    const caseNo = request.case?.caseNo != null ? String(request.case.caseNo) : "";
    const ext = fileExt(file.name || "");
    const existing = await prisma.videoAttachment.count({ where: { requestId, camera } });
    const base = `${namePart(busCode)}_${namePart(camera)}_CASO-${namePart(caseNo)}`;
    displayName = existing > 0 ? `${base}_${existing + 1}${ext}` : `${base}${ext}`;
  }

  const relPath = await saveUpload(file, `video-requests/${requestId}`);

  const created = await prisma.videoAttachment.create({
    data: {
      requestId,
      kind,
      camera,
      filePath: relPath,
      originalName: displayName,
      size: file.size || null,
      mimeType: file.type || null,
      uploadedById: actorUserId,
    },
  });

  await prisma.videoRequestEvent.create({
    data: {
      requestId,
      type: VideoRequestEventType.FILE_UPLOADED,
      message: camera ? `Archivo cargado (${kind} · ${camera})` : `Archivo cargado (${kind})`,
      meta: { attachmentId: created.id, filePath: created.filePath, camera },
      actorUserId,
    },
  });

  return NextResponse.json({ ok: true, attachment: created });
}
