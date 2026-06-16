export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, VideoRequestEventType } from "@prisma/client";
import { buildVideoRequestCaseScope, isBackofficeRestricted, isVideosOnlyBackoffice } from "@/lib/access-control";

/**
 * Borrado (lógico) de un adjunto de una solicitud de video.
 * - Solo lo puede eliminar quien lo subió (uploadedById === usuario actual),
 *   o un ADMIN (que puede eliminar cualquiera).
 * - "Lógico": marca active = false. El archivo se conserva y queda registro
 *   en el historial (VideoRequestEvent). Reversible.
 */
export async function DELETE(_req: NextRequest, ctx: { params: { id: string; attachmentId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as Role;
  if (![Role.ADMIN, Role.BACKOFFICE, Role.TECHNICIAN].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const capabilities = (session.user as any).capabilities as string[] | undefined;
  if (role === Role.BACKOFFICE && (isBackofficeRestricted(role, capabilities) || isVideosOnlyBackoffice(role, capabilities))) {
    return NextResponse.json({ error: "No tienes permisos para eliminar archivos." }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const actorUserId = (session.user as any).id as string;
  const caseScope = buildVideoRequestCaseScope({ role, capabilities, userId: actorUserId });
  const requestId = String(ctx.params.id);
  const attachmentId = String(ctx.params.attachmentId);

  // La solicitud debe pertenecer al tenant y estar dentro del alcance del usuario.
  const request = await prisma.videoDownloadRequest.findFirst({
    where: { id: requestId, case: { tenantId, ...caseScope } },
    select: { id: true },
  });
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const attachment = await prisma.videoAttachment.findFirst({
    where: { id: attachmentId, requestId },
  });
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Idempotente: si ya estaba eliminado, no hay nada que hacer.
  if (!attachment.active) return NextResponse.json({ ok: true, alreadyDeleted: true });

  // Restricción: solo el dueño del archivo o un ADMIN.
  const isOwner = !!attachment.uploadedById && attachment.uploadedById === actorUserId;
  if (role !== Role.ADMIN && !isOwner) {
    return NextResponse.json({ error: "Solo puedes eliminar archivos que tú subiste." }, { status: 403 });
  }

  await prisma.videoAttachment.update({
    where: { id: attachment.id },
    data: { active: false },
  });

  await prisma.videoRequestEvent.create({
    data: {
      requestId,
      type: VideoRequestEventType.COMMENT,
      message: `Adjunto eliminado: ${attachment.originalName ?? attachment.kind}`,
      meta: {
        attachmentId: attachment.id,
        filePath: attachment.filePath,
        softDelete: true,
        by: actorUserId,
      },
      actorUserId,
    },
  });

  return NextResponse.json({ ok: true });
}
