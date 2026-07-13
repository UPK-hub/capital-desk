export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  NotificationType,
  Role,
  VideoCaseStatus,
  VideoDownloadStatus,
  VideoRequestEventType,
} from "@prisma/client";
import { buildVideoRequestCaseScope, isBackofficeRestricted, isVideosOnlyBackoffice } from "@/lib/access-control";
import { isCapitalUserEmail } from "@/lib/users";
import { notifyTenantUsers } from "@/lib/notifications";
import { sendMail } from "@/lib/mailer";
import { buildVideoEmail } from "@/lib/video-emails";
import { notifyVideoRequestClosed } from "@/lib/telegram-notify";
import crypto from "node:crypto";

function uniqEmails(list: string[]) {
  return Array.from(new Set(list.map((e) => e.trim()).filter(Boolean)));
}

function getClientEmails(v: any): string[] {
  const fromArray = Array.isArray(v.requesterEmails) ? v.requesterEmails : [];
  const fromSingle = v.requesterEmail ? [v.requesterEmail] : [];
  return uniqEmails([...fromArray, ...fromSingle]);
}

async function logEvent(params: {
  requestId: string;
  type: VideoRequestEventType;
  message?: string | null;
  meta?: any;
  actorUserId?: string | null;
}) {
  await prisma.videoRequestEvent.create({
    data: {
      requestId: params.requestId,
      type: params.type,
      message: params.message ?? null,
      meta: params.meta ?? null,
      actorUserId: params.actorUserId ?? null,
    },
  });
}

export async function GET(_: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = (session.user as any).role as Role;
  if (![Role.ADMIN, Role.BACKOFFICE, Role.TECHNICIAN, Role.SUPERVISOR].includes(role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const capabilities = (session.user as any).capabilities as string[] | undefined;
  const userId = String((session.user as any).id ?? "");
  const caseScope = await buildVideoRequestCaseScope({ tenantId, role, capabilities, userId });
  const requestId = String(ctx.params.id);

  const item = await prisma.videoDownloadRequest.findFirst({
    where: { id: requestId, case: { tenantId, ...caseScope } },
    include: {
      case: { select: { id: true, caseNo: true, title: true, bus: { select: { code: true, plate: true } } } },
      assignedTo: { select: { id: true, name: true, email: true } },
      attachments: { where: { active: true }, orderBy: { createdAt: "desc" } },
      events: { orderBy: { createdAt: "desc" }, take: 200 },
    },
  });

  if (!item) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PUT(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = (session.user as any).role as Role;
  if (![Role.ADMIN, Role.BACKOFFICE, Role.TECHNICIAN].includes(role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const capabilities = (session.user as any).capabilities as string[] | undefined;
  const restrictedBackoffice = isBackofficeRestricted(role, capabilities);
  const videosOnlyBackoffice = isVideosOnlyBackoffice(role, capabilities);
  if (role === Role.BACKOFFICE && (restrictedBackoffice || videosOnlyBackoffice)) {
    return NextResponse.json({ error: "No tienes permisos para gestionar esta solicitud." }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const actorUserId = (session.user as any).id as string;
  const requestId = String(ctx.params.id);
  const caseScope = await buildVideoRequestCaseScope({ tenantId, role, capabilities, userId: actorUserId });

  const body = await req.json().catch(() => ({}));

  const current = await prisma.videoDownloadRequest.findFirst({
    where: { id: requestId, case: { tenantId, ...caseScope } },
    include: {
      case: { include: { bus: true } },
      attachments: true,
    },
  });
  if (!current) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const nextStatus = body.status as VideoCaseStatus | undefined;
  const nextDownloadStatus = body.downloadStatus as VideoDownloadStatus | undefined;
  const observationsTechnician = typeof body.observationsTechnician === "string" ? body.observationsTechnician : undefined;
  const assignedToId = body.assignedToId ? String(body.assignedToId) : undefined;

  // Si se asigna un responsable, validar que sea técnico o usuario de Capital.
  if (assignedToId) {
    const assignee = await prisma.user.findFirst({
      where: { id: assignedToId, tenantId, active: true },
      select: { id: true, role: true, email: true },
    });
    if (!assignee) {
      return NextResponse.json({ error: "Usuario inválido o inactivo" }, { status: 400 });
    }
    if (assignee.role !== Role.TECHNICIAN && !isCapitalUserEmail(assignee.email)) {
      return NextResponse.json(
        { error: "El responsable debe ser un técnico o un usuario de Capital." },
        { status: 400 }
      );
    }
  }

  const updates: any = {};
  if (nextStatus) updates.status = nextStatus;
  if (nextDownloadStatus) updates.downloadStatus = nextDownloadStatus;
  if (observationsTechnician !== undefined) updates.observationsTechnician = observationsTechnician;
  if (assignedToId !== undefined) updates.assignedToId = assignedToId || null;

  const updated = await prisma.videoDownloadRequest.update({
    where: { id: requestId },
    data: updates,
  });

  // Registrar cambio de responsable en el historial.
  if (assignedToId !== undefined && (current.assignedToId ?? null) !== (assignedToId || null)) {
    let assigneeLabel = "Sin asignar";
    if (assignedToId) {
      const assignee = await prisma.user.findFirst({
        where: { id: assignedToId, tenantId },
        select: { name: true, email: true },
      });
      if (assignee) {
        assigneeLabel = `${assignee.name}${assignee.email ? ` (${assignee.email})` : ""}`;
      }
    }
    await logEvent({
      requestId,
      type: VideoRequestEventType.COMMENT,
      message: `Responsable asignado: ${assigneeLabel}`,
      meta: { kind: "ASSIGN", from: current.assignedToId ?? null, to: assignedToId || null },
      actorUserId,
    });
  }

  const becameCompleted =
    nextStatus === VideoCaseStatus.COMPLETADO && current.status !== VideoCaseStatus.COMPLETADO;
  const becameDownloaded =
    nextDownloadStatus === VideoDownloadStatus.DESCARGA_REALIZADA &&
    current.downloadStatus !== VideoDownloadStatus.DESCARGA_REALIZADA;
  const caseAlreadyDone =
    current.case.status === "RESUELTO" || current.case.status === "CERRADO";
  if ((becameCompleted || becameDownloaded) && !caseAlreadyDone) {
    await prisma.case.update({
      where: { id: current.caseId },
      data: { status: "CERRADO" },
    });
    await prisma.caseEvent.create({
      data: {
        caseId: current.caseId,
        type: "STATUS_CHANGE",
        message: "Caso cerrado automáticamente al completar la descarga de video",
        meta: { by: actorUserId },
      },
    });
    // Aviso al grupo de novedades: la descarga de video se cerró.
    await notifyVideoRequestClosed(current.caseId);
  }

  if (nextStatus && nextStatus !== current.status) {
    await logEvent({
      requestId,
      type: VideoRequestEventType.STATUS_CHANGE,
      message: `Estado actualizado a ${nextStatus}`,
      meta: { from: current.status, to: nextStatus },
      actorUserId,
    });
  }

  if (nextDownloadStatus && nextDownloadStatus !== current.downloadStatus) {
    await logEvent({
      requestId,
      type: VideoRequestEventType.DOWNLOAD_STATUS_CHANGE,
      message: `Estado de descarga actualizado a ${nextDownloadStatus}`,
      meta: { from: current.downloadStatus, to: nextDownloadStatus },
      actorUserId,
    });
  }

  const clientEmails = getClientEmails(updated).filter((e) => e.trim().length > 0);
  const baseLines = [
    `ID caso: ${current.case.caseNo ?? current.caseId}`,
    `Bus: ${current.case.bus.code}${current.case.bus.plate ? ` (${current.case.bus.plate})` : ""}`,
    current.vehicleId ? `Vehiculo: ${current.vehicleId}` : "",
    current.descriptionNovedad ? `Descripcion: ${current.descriptionNovedad}` : "",
  ].filter(Boolean) as string[];

  if (nextStatus === VideoCaseStatus.EN_CURSO && !current.notifInProgressSentAt && clientEmails.length) {
    const email = buildVideoEmail({
      title: `Caso en curso - ${current.case.caseNo ?? current.caseId}`,
      bodyLines: [...baseLines, "Su solicitud esta en curso."],
    });

    await Promise.allSettled(
      clientEmails.map(async (to) => {
        try {
          await sendMail({ to, subject: email.subject, html: email.html, text: email.text });
        } catch (err) {
          console.error("VIDEO_EMAIL_SEND_FAILED", { to, err });
        }
      })
    );

    await prisma.videoDownloadRequest.update({
      where: { id: requestId },
      data: { notifInProgressSentAt: new Date() },
    });

    await logEvent({
      requestId,
      type: VideoRequestEventType.EMAIL_SENT,
      message: "Correo enviado: EN_CURSO",
      meta: { to: clientEmails },
      actorUserId,
    });
  }

  if (nextDownloadStatus === VideoDownloadStatus.DESCARGA_FALLIDA && !current.notifFailedSentAt) {
    // Notificación interna acotada: SOLO al responsable asignado, si existe.
    // Si no hay responsable, no se notifica internamente (sin blast).
    const responsibleId = updated.assignedToId ?? null;
    if (responsibleId) {
      await notifyTenantUsers({
        tenantId,
        userIds: [responsibleId],
        type: NotificationType.VIDEO_REQUEST_FAILED,
        title: `Descarga fallida - ${current.case.caseNo ?? current.caseId}`,
        body: [
          `Bus: ${current.case.bus.code}${current.case.bus.plate ? ` (${current.case.bus.plate})` : ""}`,
          observationsTechnician ? `Obs: ${observationsTechnician}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        href: `/video-requests/${requestId}`,
        meta: { requestId },
      });

      await logEvent({
        requestId,
        type: VideoRequestEventType.EMAIL_SENT,
        message: "Correo interno enviado: DESCARGA_FALLIDA",
        meta: { toUserId: responsibleId },
        actorUserId,
      });
    }

    await prisma.videoDownloadRequest.update({
      where: { id: requestId },
      data: { notifFailedSentAt: new Date() },
    });
  }

  if (nextStatus === VideoCaseStatus.COMPLETADO && !current.notifDeliverySentAt) {
    const videoFile = current.attachments.find((a) => a.kind === "VIDEO" && a.active);
    if (!videoFile) {
      return NextResponse.json({ error: "No hay video adjunto para completar." }, { status: 400 });
    }

    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 72);

    await prisma.videoDownloadToken.create({
      data: {
        token,
        attachmentId: videoFile.id,
        expiresAt,
      },
    });

    const baseUrl = process.env.NEXTAUTH_URL || req.headers.get("origin") || "";
    const downloadUrl = `${baseUrl}/api/video-download/${token}`;

    let sentClient = false;
    if (clientEmails.length) {
      const email = buildVideoEmail({
        title: `Entrega de video - ${current.case.caseNo ?? current.caseId}`,
        bodyLines: [
          ...baseLines,
          `Estado descarga: ${updated.downloadStatus}`,
          observationsTechnician ? `Obs: ${observationsTechnician}` : "",
        ],
        downloadUrl,
      });

      await Promise.allSettled(
        clientEmails.map(async (to) => {
          try {
            await sendMail({ to, subject: email.subject, html: email.html, text: email.text });
          } catch (err) {
            console.error("VIDEO_EMAIL_SEND_FAILED", { to, err });
          }
        })
      );

      await prisma.videoDownloadRequest.update({
        where: { id: requestId },
        data: { notifDeliverySentAt: new Date() },
      });

      await logEvent({
        requestId,
        type: VideoRequestEventType.EMAIL_SENT,
        message: "Correo enviado: ENTREGA_CLIENTE",
        meta: { to: clientEmails },
        actorUserId,
      });
      sentClient = true;
    }
    if (sentClient) {
      // Notificación interna acotada: SOLO al responsable asignado, si existe.
      // Si no hay responsable, se omite la interna (sin blast).
      const responsibleId = updated.assignedToId ?? null;
      if (responsibleId) {
        await notifyTenantUsers({
          tenantId,
          userIds: [responsibleId],
          type: NotificationType.VIDEO_REQUEST_INTERNAL_DELIVERED,
          title: `Entrega exitosa - ${current.case.caseNo ?? current.caseId}`,
          body: `Caso completado con video`,
          href: `/video-requests/${requestId}`,
          meta: { requestId },
        });
      }

      await prisma.videoDownloadRequest.update({
        where: { id: requestId },
        data: { notifInternalDeliverySentAt: new Date() },
      });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  // Acción destructiva: solo ADMIN.
  const role = (session.user as any).role as Role;
  if (role !== Role.ADMIN) {
    return NextResponse.json({ error: "Solo un administrador puede eliminar solicitudes." }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const requestId = String(ctx.params.id);

  const request = await prisma.videoDownloadRequest.findFirst({
    where: { id: requestId, case: { tenantId } },
    select: { caseId: true },
  });
  if (!request) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  try {
    // Borrar el caso elimina en cascada la solicitud, sus adjuntos, tokens e historial.
    await prisma.case.delete({ where: { id: request.caseId } });
  } catch (err) {
    console.error("VIDEO_REQUEST_DELETE_FAILED", err);
    return NextResponse.json(
      { error: "No se pudo eliminar: la solicitud tiene registros vinculados (p. ej. una OT)." },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true });
}
