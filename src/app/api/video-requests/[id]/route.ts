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
import { notifyTenantUsers } from "@/lib/notifications";
import { sendMail } from "@/lib/mailer";
import { buildVideoEmail } from "@/lib/video-emails";
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
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as Role;
  if (![Role.ADMIN, Role.BACKOFFICE, Role.TECHNICIAN].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const requestId = String(ctx.params.id);

  const item = await prisma.videoDownloadRequest.findFirst({
    where: { id: requestId, case: { tenantId } },
    include: {
      case: { select: { id: true, caseNo: true, title: true, bus: { select: { code: true, plate: true } } } },
      assignedTo: { select: { id: true, name: true, email: true } },
      attachments: { orderBy: { createdAt: "desc" } },
      events: { orderBy: { createdAt: "desc" }, take: 200 },
    },
  });

  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PUT(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as Role;
  if (![Role.ADMIN, Role.BACKOFFICE, Role.TECHNICIAN].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const actorUserId = (session.user as any).id as string;
  const requestId = String(ctx.params.id);

  const body = await req.json().catch(() => ({}));

  const current = await prisma.videoDownloadRequest.findFirst({
    where: { id: requestId, case: { tenantId } },
    include: {
      case: { include: { bus: true } },
      attachments: true,
    },
  });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const nextStatus = body.status as VideoCaseStatus | undefined;
  const nextDownloadStatus = body.downloadStatus as VideoDownloadStatus | undefined;
  const observationsTechnician = typeof body.observationsTechnician === "string" ? body.observationsTechnician : undefined;
  const assignedToId = body.assignedToId ? String(body.assignedToId) : undefined;

  const updates: any = {};
  if (nextStatus) updates.status = nextStatus;
  if (nextDownloadStatus) updates.downloadStatus = nextDownloadStatus;
  if (observationsTechnician !== undefined) updates.observationsTechnician = observationsTechnician;
  if (assignedToId !== undefined) updates.assignedToId = assignedToId || null;

  const updated = await prisma.videoDownloadRequest.update({
    where: { id: requestId },
    data: updates,
  });

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

    for (const to of clientEmails) {
      try {
        await sendMail({ to, subject: email.subject, html: email.html, text: email.text });
      } catch (err) {
        console.error("VIDEO_EMAIL_SEND_FAILED", { to, err });
      }
    }

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
    await notifyTenantUsers({
      tenantId,
      roles: [Role.ADMIN, Role.BACKOFFICE],
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

    await prisma.videoDownloadRequest.update({
      where: { id: requestId },
      data: { notifFailedSentAt: new Date() },
    });

    await logEvent({
      requestId,
      type: VideoRequestEventType.EMAIL_SENT,
      message: "Correo interno enviado: DESCARGA_FALLIDA",
      meta: { toRoles: [Role.ADMIN, Role.BACKOFFICE] },
      actorUserId,
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

      for (const to of clientEmails) {
        try {
          await sendMail({ to, subject: email.subject, html: email.html, text: email.text });
        } catch (err) {
          console.error("VIDEO_EMAIL_SEND_FAILED", { to, err });
        }
      }

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
      await notifyTenantUsers({
        tenantId,
        roles: [Role.ADMIN, Role.BACKOFFICE],
        type: NotificationType.VIDEO_REQUEST_INTERNAL_DELIVERED,
        title: `Entrega exitosa - ${current.case.caseNo ?? current.caseId}`,
        body: `Caso completado con video`,
        href: `/video-requests/${requestId}`,
        meta: { requestId },
      });

      await prisma.videoDownloadRequest.update({
        where: { id: requestId },
        data: { notifInternalDeliverySentAt: new Date() },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
