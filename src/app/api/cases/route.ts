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
import { ensureTenantSequence } from "@/lib/tenant-sequence";
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
  const renewalEquipmentIds =
    cfg.type === "RENOVACION_TECNOLOGICA"
      ? (
          await prisma.busEquipment.findMany({
            where: { busId, active: true },
            select: { id: true },
          })
        ).map((e) => e.id)
      : [];
  const effectiveEquipmentIds =
    cfg.type === "RENOVACION_TECNOLOGICA" ? renewalEquipmentIds : busEquipmentIds;
  const busEquipmentId =
    cfg.type === "RENOVACION_TECNOLOGICA" ? null : effectiveEquipmentIds[0] ?? null;
  if (cfg.requiresEquipment && !effectiveEquipmentIds.length) {
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
    const splitByEquipment = cfg.type === "CORRECTIVO" && effectiveEquipmentIds.length > 1;
    const targets = splitByEquipment ? effectiveEquipmentIds : [busEquipmentId];
    const splitGroupKey = splitByEquipment
      ? `split-${tenantId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      : null;

    // Reservar consecutivos en transacción corta para evitar locks largos en el flujo principal
    const reserved = await prisma.$transaction(
      async (tx) => {
      await ensureTenantSequence(tx as any, tenantId);
      await tx.$queryRaw`SELECT "tenantId" FROM "TenantSequence" WHERE "tenantId" = ${tenantId} FOR UPDATE`;

      let seq = await tx.tenantSequence.findUnique({
        where: { tenantId },
        select: { nextCaseNo: true, nextWorkOrderNo: true },
      });
      if (!seq) throw new Error("TenantSequence missing after upsert");

      const maxCase = await tx.case.aggregate({ where: { tenantId }, _max: { caseNo: true } });
      const maxCaseNo = maxCase._max.caseNo ?? 0;
      if (seq.nextCaseNo <= maxCaseNo) {
        await tx.tenantSequence.update({
          where: { tenantId },
          data: { nextCaseNo: maxCaseNo + 1 },
        });
        seq = { ...seq, nextCaseNo: maxCaseNo + 1 };
      }

      if (cfg.requiresWorkOrder) {
        const maxWo = await tx.workOrder.aggregate({ where: { tenantId }, _max: { workOrderNo: true } });
        const maxWoNo = maxWo._max.workOrderNo ?? 0;
        if (seq.nextWorkOrderNo <= maxWoNo) {
          await tx.tenantSequence.update({
            where: { tenantId },
            data: { nextWorkOrderNo: maxWoNo + 1 },
          });
          seq = { ...seq, nextWorkOrderNo: maxWoNo + 1 };
        }
      }

      const caseNos = Array.from({ length: targets.length }, (_, i) => seq!.nextCaseNo + i);
      const workOrderNos = cfg.requiresWorkOrder
        ? Array.from({ length: targets.length }, (_, i) => seq!.nextWorkOrderNo + i)
        : [];

      await tx.tenantSequence.update({
        where: { tenantId },
        data: {
          nextCaseNo: { increment: targets.length },
          ...(cfg.requiresWorkOrder ? { nextWorkOrderNo: { increment: targets.length } } : {}),
        },
      });

      return { caseNos, workOrderNos };
      },
      { maxWait: 10000, timeout: 20000 }
    );

    const created = await prisma.$transaction(
      async (tx) => {
      const createdCases: any[] = [];
      const createdStsCases: Array<{ caseId: string; description: string }> = [];

      for (let i = 0; i < targets.length; i += 1) {
        const eqId = targets[i];
        const nums = {
          caseNo: reserved.caseNos[i],
          workOrderNo: cfg.requiresWorkOrder ? reserved.workOrderNos[i] : undefined,
        };

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
            // Preventivo debe ser un caso de bus (equipos vinculados por caseEquipment).
            busEquipmentId: cfg.type === "PREVENTIVO" ? null : eqId ?? null,
          },
        });

        if (splitByEquipment) {
          if (eqId) {
            await tx.caseEquipment.create({
              data: { caseId: c.id, busEquipmentId: eqId },
            });
          }
        } else if (effectiveEquipmentIds.length) {
          await tx.caseEquipment.createMany({
            data: effectiveEquipmentIds.map((id) => ({ caseId: c.id, busEquipmentId: id })),
            skipDuplicates: true,
          });
        }

        await tx.caseEvent.create({
          data: {
            caseId: c.id,
            type: CaseEventType.CREATED,
            message: "Caso creado",
            meta: splitGroupKey ? { userId, splitGroupKey } : { userId },
          },
        });

        if (cfg.requiresWorkOrder) {
          await tx.workOrder.create({
            data: { tenantId, workOrderNo: nums.workOrderNo!, caseId: c.id },
          });

          if (!cfg.stsComponentCode) {
            await tx.case.update({ where: { id: c.id }, data: { status: CaseStatus.OT_ASIGNADA } });
          }

          await tx.caseEvent.create({
            data: {
              caseId: c.id,
              type: CaseEventType.STATUS_CHANGE,
              message: "OT creada automáticamente",
              meta: { userId },
            },
          });
        }

        if (cfg.stsComponentCode) {
          createdStsCases.push({ caseId: c.id, description: c.description });
        }

        createdCases.push(c);
      }

      return { case: createdCases[0], createdCount: createdCases.length, createdStsCases };
      },
      { maxWait: 10000, timeout: 20000 }
    );

    await notifyTenantUsers({
      tenantId,
      roles: [Role.ADMIN, Role.BACKOFFICE],
      type: NotificationType.CASE_CREATED,
      title: `Nuevo caso: ${created.case.title}`,
      body: `Tipo: ${created.case.type} | Estado: ${created.case.status}`,
      meta: { caseId: created.case.id },
    });
    let createdVideoRequestId: string | null = null;
    if (cfg.hasInlineCreateForm) {
      const v = parsedVideo!.data as any;
      const targetCase = created.case;

      const req = await prisma.videoDownloadRequest.create({
        data: {
          caseId: targetCase.id,
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
      createdVideoRequestId = req.id;

      await prisma.caseEvent.create({
        data: { caseId: targetCase.id, type: CaseEventType.COMMENT, message: "Formulario video guardado", meta: { userId } },
      });

      await prisma.videoRequestEvent.create({
        data: {
          requestId: req.id,
          type: VideoRequestEventType.STATUS_CHANGE,
          message: "Estado inicial EN_ESPERA",
          meta: { by: userId },
          actorUserId: userId,
        },
      });
    }

    if (createdVideoRequestId) {
      const req = await prisma.videoDownloadRequest.findFirst({
        where: { id: createdVideoRequestId },
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

    // Crear tickets STS fuera de la transacción para evitar cierre del tx
    if (cfg.stsComponentCode && created.createdStsCases?.length) {
      const comp = await prisma.stsComponent.findFirst({
        where: { tenantId, code: cfg.stsComponentCode },
      });
      if (!comp) {
        return NextResponse.json(
          { error: "Componente STS no configurado" },
          { status: 400 }
        );
      }

      for (const item of created.createdStsCases) {
        const ticket = await prisma.stsTicket.create({
          data: {
            tenantId,
            caseId: item.caseId,
            componentId: comp.id,
            severity: stsSeverity as StsTicketSeverity,
            status: "OPEN",
            channel: StsTicketChannel.OTHER,
            description: item.description,
            openedAt: new Date(),
          },
        });

        await prisma.stsTicketEvent.create({
          data: {
            ticketId: ticket.id,
            type: "STATUS_CHANGE",
            status: "OPEN",
            message: "Ticket creado desde caso",
            createdById: userId,
          },
        });

        await prisma.caseEvent.create({
          data: {
            caseId: item.caseId,
            type: CaseEventType.COMMENT,
            message: `Ticket STS creado (${cfg.stsComponentCode})`,
            meta: { userId, stsTicketId: ticket.id },
          },
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
