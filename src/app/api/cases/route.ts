// src/app/api/cases/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CaseEventType, CaseStatus, NotificationType, Role, StsTicketChannel, StsTicketSeverity, VideoRequestEventType } from "@prisma/client";
import { CASE_TYPE_REGISTRY } from "@/lib/case-type-registry";
import { VideoDownloadRequestSchema } from "@/lib/validators/video";
import { notifyTenantUsers } from "@/lib/notifications";
import { nextNumbers } from "@/lib/tenant-sequence";
import { sendMail } from "@/lib/mailer";
import { buildVideoEmail } from "@/lib/video-emails";

function normalizePriority(input: any): number | undefined {
  if (input === null || input === undefined || input === "") return undefined;
  const n = typeof input === "number" ? input : Number(String(input));
  if (Number.isFinite(n)) return Math.max(1, Math.min(5, Math.trunc(n)));

  const s = String(input).toUpperCase();
  if (s === "ALTA") return 2;
  if (s === "MEDIA") return 3;
  if (s === "BAJA") return 4;
  return undefined;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;

  const body = await req.json().catch(() => ({}));

  const type = body.type as keyof typeof CASE_TYPE_REGISTRY;
  const cfg = CASE_TYPE_REGISTRY[type];
  if (!cfg) return NextResponse.json({ error: "Tipo de caso inválido" }, { status: 400 });

  const busId = String(body.busId ?? "").trim();
  if (!busId) return NextResponse.json({ error: "Selecciona un bus" }, { status: 400 });

  const rawEquipmentIds = Array.isArray(body.busEquipmentIds)
    ? body.busEquipmentIds
    : body.busEquipmentId
      ? [body.busEquipmentId]
      : [];
  const busEquipmentIds = rawEquipmentIds.map((id: any) => String(id)).filter(Boolean);
  const busEquipmentId = busEquipmentIds[0] ?? null;
  if (cfg.requiresEquipment && !busEquipmentIds.length) {
    return NextResponse.json({ error: "Equipo del bus requerido para este tipo de caso" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();
  if (title.length < 3) return NextResponse.json({ error: "Título muy corto" }, { status: 400 });
  if (description.length < 5) return NextResponse.json({ error: "Descripción muy corta" }, { status: 400 });

  const priority = normalizePriority(body.priority);
  const stsSeverity = cfg.stsComponentCode ? (body.stsSeverity as StsTicketSeverity) : null;
  if (cfg.stsComponentCode && (!stsSeverity || !Object.values(StsTicketSeverity).includes(stsSeverity))) {
    return NextResponse.json({ error: "Severidad STS requerida" }, { status: 400 });
  }

  // 1) Asegurar inline form
  if (cfg.hasInlineCreateForm && !body.videoDownloadRequest) {
    return NextResponse.json({ error: "Debes completar el formulario de video." }, { status: 400 });
  }

  // Validar + normalizar (fechas incluidas) con Zod
  const parsedVideo = cfg.hasInlineCreateForm
    ? VideoDownloadRequestSchema.safeParse(body.videoDownloadRequest)
    : null;

  if (cfg.hasInlineCreateForm && !parsedVideo?.success) {
    return NextResponse.json(
      { error: parsedVideo!.error.issues[0]?.message ?? "Formulario de video inválido" },
      { status: 400 }
    );
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const nums = await nextNumbers(tx as any, tenantId, {
        case: true,
        workOrder: cfg.requiresWorkOrder,
      });

      const c = await tx.case.create({
        data: {
          tenantId,
          caseNo: nums.caseNo!,
          type: cfg.type,
          status: CaseStatus.NUEVO,
          priority: priority ?? 3,
          title,
          description,
          busId,
          busEquipmentId,
        },
      });

      if (busEquipmentIds.length) {
        await tx.caseEquipment.createMany({
          data: busEquipmentIds.map((id) => ({ caseId: c.id, busEquipmentId: id })),
          skipDuplicates: true,
        });
      }

      await tx.caseEvent.create({
        data: { caseId: c.id, type: CaseEventType.CREATED, message: "Caso creado", meta: { userId } },
      });

      if (cfg.requiresWorkOrder) {
        await tx.workOrder.create({
          data: { tenantId, workOrderNo: nums.workOrderNo!, caseId: c.id },
        });

        if (!cfg.stsComponentCode) {
          await tx.case.update({ where: { id: c.id }, data: { status: CaseStatus.OT_ASIGNADA } });
        }

        await tx.caseEvent.create({
          data: { caseId: c.id, type: CaseEventType.STATUS_CHANGE, message: "OT creada automáticamente", meta: { userId } },
        });
      }

      let videoRequestId: string | null = null;
      let stsTicketId: string | null = null;

      if (cfg.stsComponentCode) {
        const comp = await tx.stsComponent.findFirst({
          where: { tenantId, code: cfg.stsComponentCode },
        });
        if (!comp) throw new Error("Componente STS no configurado");

        const ticket = await tx.stsTicket.create({
          data: {
            tenantId,
            caseId: c.id,
            componentId: comp.id,
            severity: stsSeverity as StsTicketSeverity,
            status: "OPEN",
            channel: StsTicketChannel.OTHER,
            description: c.description,
            openedAt: new Date(),
          },
        });
        stsTicketId = ticket.id;

        await tx.stsTicketEvent.create({
          data: {
            ticketId: ticket.id,
            type: "STATUS_CHANGE",
            status: "OPEN",
            message: "Ticket creado desde caso",
            createdById: userId,
          },
        });

        await tx.caseEvent.create({
          data: {
            caseId: c.id,
            type: CaseEventType.COMMENT,
            message: `Ticket STS creado (${cfg.stsComponentCode})`,
            meta: { userId, stsTicketId: ticket.id },
          },
        });
      }
      if (cfg.hasInlineCreateForm) {
        const v = parsedVideo!.data as any;

        const req = await tx.videoDownloadRequest.create({
          data: {
            caseId: c.id,
            origin: v.origin,
            requestType: v.requestType || null,

            tmsaRadicado: v.radicadoTMSA || null,
            tmsaFiledAt: v.radicadoTMSADate ?? null,
            concessionaireFiledAt: v.radicadoConcesionarioDate ?? null,

            requesterName: v.requesterName || null,
            requesterId: v.requesterDocument || null,
            requesterRole: v.requesterRole || null,
            requesterPhone: v.requesterPhone || null,
            requesterEmail: v.requesterEmail || null,
            requesterEmails: v.requesterEmails?.length ? v.requesterEmails : null,

            vehicleId: v.vehicleId || null,

            eventStart: v.eventStartAt ?? null,
            eventEnd: v.eventEndAt ?? null,

            camerasRequested: v.cameras || null,
            deliveryMethod: v.deliveryMethod || null,

            descriptionNovedad: v.descriptionNovedad || null,
            finSolicitud: v.finSolicitud?.length ? v.finSolicitud : null,
          },
        });
        videoRequestId = req.id;

        await tx.caseEvent.create({
          data: { caseId: c.id, type: CaseEventType.COMMENT, message: "Formulario video guardado", meta: { userId } },
        });

        await tx.videoRequestEvent.create({
          data: {
            requestId: req.id,
            type: VideoRequestEventType.STATUS_CHANGE,
            message: "Estado inicial EN_ESPERA",
            meta: { by: userId },
            actorUserId: userId,
          },
        });
      }

      return { case: c, videoRequestId, stsTicketId };
    });

    await notifyTenantUsers({
      tenantId,
      roles: [Role.ADMIN, Role.BACKOFFICE],
      type: NotificationType.CASE_CREATED,
      title: `Nuevo caso: ${created.case.title}`,
      body: `Tipo: ${created.case.type} | Estado: ${created.case.status}`,
      meta: { caseId: created.case.id },
    });
    if (created.videoRequestId) {
      const req = await prisma.videoDownloadRequest.findFirst({
        where: { id: created.videoRequestId },
        include: { case: { include: { bus: true } } },
      });

      if (req) {
        const emails = Array.isArray(req.requesterEmails) ? req.requesterEmails : [];
        const allEmails = Array.from(new Set([...emails, req.requesterEmail].filter(Boolean))) as string[];
        const bodyLines = [
          `ID caso: ${req.case.caseNo ?? req.caseId}`,
          `Bus: ${req.case.bus.code}${req.case.bus.plate ? ` (${req.case.bus.plate})` : ""}`,
          req.vehicleId ? `Vehiculo: ${req.vehicleId}` : "",
          req.descriptionNovedad ? `Descripcion: ${req.descriptionNovedad}` : "",
          req.finSolicitud ? `Fin solicitud: ${(req.finSolicitud as any[]).join(", ")}` : "",
        ].filter(Boolean) as string[];

        if (allEmails.length && !req.notifPendingSentAt) {
          const email = buildVideoEmail({
            title: `Solicitud recibida - ${req.case.caseNo ?? req.caseId}`,
            bodyLines: [...bodyLines, "Su solicitud fue recibida y esta en espera."],
          });

          for (const to of allEmails) {
            await sendMail({ to, subject: email.subject, html: email.html, text: email.text });
          }

          await prisma.videoDownloadRequest.update({
            where: { id: req.id },
            data: { notifPendingSentAt: new Date() },
          });

          await prisma.videoRequestEvent.create({
            data: {
              requestId: req.id,
              type: VideoRequestEventType.EMAIL_SENT,
              message: "Correo enviado: EN_ESPERA",
              meta: { to: allEmails },
              actorUserId: userId,
            },
          });
        }

        await notifyTenantUsers({
          tenantId,
          roles: [Role.ADMIN, Role.BACKOFFICE],
          type: NotificationType.VIDEO_REQUEST_CREATED,
          title: `Nuevo caso video - ${req.case.caseNo ?? req.caseId}`,
          body: `Bus: ${req.case.bus.code}${req.case.bus.plate ? ` (${req.case.bus.plate})` : ""}`,
          href: `/video-requests/${req.id}`,
          meta: { requestId: req.id, caseId: req.caseId },
        });
      }
    }

    return NextResponse.json(created.case);
  } catch (e: any) {
    return NextResponse.json(
      { error: "No se pudo crear el caso", detail: e?.message ?? String(e) },
      { status: 400 }
    );
  }
}
