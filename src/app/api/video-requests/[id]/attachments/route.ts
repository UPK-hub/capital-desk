export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveUpload } from "@/lib/uploads";
import { Role, VideoAttachmentKind, VideoDownloadStatus, VideoRequestEventType } from "@prisma/client";

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as Role;
  if (![Role.ADMIN, Role.BACKOFFICE, Role.TECHNICIAN].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const actorUserId = (session.user as any).id as string;
  const requestId = String(ctx.params.id);

  const request = await prisma.videoDownloadRequest.findFirst({
    where: { id: requestId, case: { tenantId } },
  });
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const kind = String(form.get("kind") ?? "VIDEO") as VideoAttachmentKind;

  if (!file) return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });

  if (kind === VideoAttachmentKind.VIDEO && request.downloadStatus !== VideoDownloadStatus.DESCARGA_REALIZADA) {
    return NextResponse.json({ error: "Solo puedes adjuntar video si la descarga fue realizada." }, { status: 400 });
  }

  const relPath = await saveUpload(file, `video-requests/${requestId}`);

  const created = await prisma.videoAttachment.create({
    data: {
      requestId,
      kind,
      filePath: relPath,
      originalName: file.name || null,
      size: file.size || null,
      mimeType: file.type || null,
      uploadedById: actorUserId,
    },
  });

  await prisma.videoRequestEvent.create({
    data: {
      requestId,
      type: VideoRequestEventType.FILE_UPLOADED,
      message: `Archivo cargado (${kind})`,
      meta: { attachmentId: created.id, filePath: created.filePath },
      actorUserId,
    },
  });

  return NextResponse.json({ ok: true, attachment: created });
}
