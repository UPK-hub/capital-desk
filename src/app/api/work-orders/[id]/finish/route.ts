export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { saveUpload } from "@/lib/uploads";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { CASE_TYPE_REGISTRY } from "@/lib/case-type-registry";
import {
  CaseEventType,
  CaseStatus,
  CaseType,
  MediaKind,
  NotificationType,
  Prisma,
  Role,
  StsTicketEventType,
  StsTicketStatus,
  WorkOrderStatus,
} from "@prisma/client";
import { notifyTenantUsers } from "@/lib/notifications";
import { nextNumbers } from "@/lib/tenant-sequence";

function formatInternalTime(d?: Date | null) {
  if (!d) return null;
  return new Intl.DateTimeFormat("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Bogota",
  }).format(d);
}



export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;
  const role = (session.user as any).role as Role;

  const form = await req.formData();
  const notes = String(form.get("notes") ?? "").trim();
  const files: File[] = [];
  const singlePhoto = form.get("photo");
  if (singlePhoto instanceof File && singlePhoto.size > 0) files.push(singlePhoto);
  for (const item of form.getAll("evidences")) {
    if (item instanceof File && item.size > 0) files.push(item);
  }
  const createPreventive = String(form.get("createPreventive") ?? "").toLowerCase() === "true";
  const createCorrective = String(form.get("createCorrective") ?? "").toLowerCase() === "true";
  const correctiveEquipmentIdsRaw = String(form.get("correctiveEquipmentIds") ?? "").trim();
  const correctiveEquipmentIds = correctiveEquipmentIdsRaw
    ? (JSON.parse(correctiveEquipmentIdsRaw) as string[]).map((id) => String(id))
    : [];

  if (!notes) return NextResponse.json({ error: "La nota de finalización es requerida" }, { status: 400 });
  if (!files.length) {
    return NextResponse.json({ error: "Debes adjuntar al menos una evidencia de finalización" }, { status: 400 });
  }

  const wo = await prisma.workOrder.findFirst({
    where: { id: ctx.params.id, tenantId },
    include: {
      case: {
        include: {
          bus: true,
          caseEquipments: true,
          events: {
            where: { type: CaseEventType.CREATED },
            orderBy: { createdAt: "asc" },
            take: 1,
          },
        },
      },
      correctiveReport: true,
      preventiveReport: true,
      renewalTechReport: true,
      interventionReceipt: true,
    },
  });
  if (!wo) return NextResponse.json({ error: "OT no encontrada" }, { status: 404 });

  if (role !== Role.ADMIN && wo.assignedToId !== userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const cfg = CASE_TYPE_REGISTRY[wo.case.type];

  // Validación de formularios requeridos para finalizar
  if (cfg?.finishRequiresForm) {
    if (cfg.formKind === "CORRECTIVE" && !wo.correctiveReport) {
      return NextResponse.json({ error: "Debes completar el Formato Correctivo antes de finalizar." }, { status: 400 });
    }
    if (cfg.formKind === "PREVENTIVE" && !wo.preventiveReport) {
      return NextResponse.json({ error: "Debes completar el Formato Preventivo antes de finalizar." }, { status: 400 });
    }
    if (cfg.formKind === "RENEWAL" && !(wo as any).renewalTechReport) {
      return NextResponse.json(
        { error: "Debes completar el Formato Renovación Tecnológica antes de finalizar." },
        { status: 400 }
      );
    }
  }

  if (wo.case.type === CaseType.CORRECTIVO && !createPreventive) {
    const lastPrev = await prisma.workOrder.findFirst({
      where: {
        tenantId,
        finishedAt: { not: null },
        case: { busId: wo.case.busId, type: CaseType.PREVENTIVO },
      },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true },
    });

    if (lastPrev?.finishedAt) {
      const diffMs = Date.now() - lastPrev.finishedAt.getTime();
      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (days >= 21) {
        return NextResponse.json(
          {
            error: "Han pasado 21 días o más desde el último preventivo.",
            needsPreventive: true,
            daysSinceLastPreventive: days,
          },
          { status: 409 }
        );
      }
    }
  }

  const relPaths: string[] = [];
  for (const file of files) {
    const relPath = await saveUpload(file, `work-orders/${wo.id}/finish`);
    relPaths.push(relPath);
  }
  const tmMinutes = cfg?.tmDurationMinutes ?? 60;
  const tmEndedAt = new Date();
  const tmStartedAt = new Date(tmEndedAt.getTime() - tmMinutes * 60 * 1000);
  const pendingValidationStatus = "EN_VALIDACION" as any;
  const needsCoordinatorValidation =
    wo.case.type === CaseType.CORRECTIVO || wo.case.type === CaseType.PREVENTIVO;
  const createdMeta = (wo.case.events?.[0]?.meta ?? null) as Record<string, any> | null;
  const splitGroupKey = typeof createdMeta?.splitGroupKey === "string" ? createdMeta.splitGroupKey : null;

  await prisma.$transaction(async (tx) => {
    let siblingCaseIds: string[] = [];
    if (splitGroupKey) {
      const siblingCreatedEvents = await tx.caseEvent.findMany({
        where: {
          type: CaseEventType.CREATED,
          meta: { path: ["splitGroupKey"], equals: splitGroupKey },
        },
        select: { caseId: true },
      });
      siblingCaseIds = siblingCreatedEvents.map((e) => e.caseId);
    } else if (wo.case.busEquipmentId && (wo.case.type === CaseType.CORRECTIVO || wo.case.type === CaseType.PREVENTIVO)) {
      // Compatibilidad con casos viejos sin splitGroupKey: usa huella conservadora del lote.
      const from = new Date(wo.case.createdAt.getTime() - 60 * 1000);
      const to = new Date(wo.case.createdAt.getTime() + 60 * 1000);
      const fallbackCases = await tx.case.findMany({
        where: {
          tenantId,
          busId: wo.case.busId,
          type: wo.case.type,
          title: wo.case.title,
          description: wo.case.description,
          createdAt: { gte: from, lte: to },
        },
        select: { id: true },
      });
      siblingCaseIds = fallbackCases.map((c) => c.id);
    }
    if (!siblingCaseIds.length) siblingCaseIds = [wo.caseId];

    const step = await tx.workOrderStep.create({
      data: { workOrderId: wo.id, stepType: "FIN", notes },
    });

    await tx.workOrderMedia.createMany({
      data: relPaths.map((filePath) => ({
        workOrderStepId: step.id,
        kind: MediaKind.FOTO_FIN,
        filePath,
      })),
    });

    await tx.workOrder.update({
      where: { id: wo.id },
      data: {
        status: needsCoordinatorValidation ? pendingValidationStatus : WorkOrderStatus.FINALIZADA,
        finishedAt: tmEndedAt,
      },
    });

    if (!needsCoordinatorValidation) {
      await tx.case.updateMany({
        where: {
          id: { in: siblingCaseIds },
          status: { notIn: [CaseStatus.RESUELTO, CaseStatus.CERRADO] },
        },
        data: { status: CaseStatus.CERRADO },
      });
    }

    await tx.workOrder.updateMany({
      where: {
        tenantId,
        caseId: { in: siblingCaseIds },
        status: needsCoordinatorValidation ? { not: pendingValidationStatus } : { not: WorkOrderStatus.FINALIZADA },
      },
      data: {
        status: needsCoordinatorValidation ? pendingValidationStatus : WorkOrderStatus.FINALIZADA,
        finishedAt: tmEndedAt,
      },
    });

    await tx.caseEvent.createMany({
      data: siblingCaseIds.map((caseId) => ({
        caseId,
        type: CaseEventType.STATUS_CHANGE,
        message: needsCoordinatorValidation
          ? "OT cerrada, pendiente validación de acta por coordinador"
          : "OT finalizada y caso cerrado",
        meta: { workOrderId: wo.id, by: userId, closedByCascade: caseId !== wo.caseId },
      })),
    });

    if (!needsCoordinatorValidation) {
      const now = new Date();
      const stsTickets = await tx.stsTicket.findMany({
        where: { tenantId, caseId: { in: siblingCaseIds } },
        select: {
          id: true,
          caseId: true,
          status: true,
          firstResponseAt: true,
          resolvedAt: true,
          closedAt: true,
        },
      });

      for (const ticket of stsTickets) {
        if (ticket.status === StsTicketStatus.CLOSED) continue;

        await tx.stsTicket.update({
          where: { id: ticket.id },
          data: {
            status: StsTicketStatus.CLOSED,
            firstResponseAt: ticket.firstResponseAt ?? now,
            resolvedAt: ticket.resolvedAt ?? now,
            closedAt: ticket.closedAt ?? now,
          },
        });

        await tx.stsTicketEvent.create({
          data: {
            ticketId: ticket.id,
            type: StsTicketEventType.STATUS_CHANGE,
            status: StsTicketStatus.CLOSED,
            message: "Ticket cerrado automáticamente al finalizar OT.",
            meta: { by: userId, workOrderId: wo.id },
            createdById: userId,
          },
        });

        if (ticket.caseId) {
          await tx.caseEvent.create({
            data: {
              caseId: ticket.caseId,
              type: CaseEventType.COMMENT,
              message: "Ticket STS cerrado automáticamente al finalizar OT.",
              meta: { ticketId: ticket.id, by: userId, workOrderId: wo.id },
            },
          });
        }
      }
    }

    const equipmentIds = wo.case.caseEquipments?.length
      ? wo.case.caseEquipments.map((e) => e.busEquipmentId)
      : wo.case.busEquipmentId
      ? [wo.case.busEquipmentId]
      : [];

    if (!equipmentIds.length) {
      await tx.busLifecycleEvent.create({
        data: {
          busId: wo.case.busId,
          caseId: wo.caseId,
          workOrderId: wo.id,
          eventType: "WO_FINISHED",
          summary: "OT finalizada con evidencia",
        },
      });
    } else {
      for (const eqId of equipmentIds) {
        await tx.busLifecycleEvent.create({
          data: {
            busId: wo.case.busId,
            busEquipmentId: eqId,
            caseId: wo.caseId,
            workOrderId: wo.id,
            eventType: "WO_FINISHED",
            summary: "OT finalizada con evidencia",
          },
        });
      }
    }

    if (wo.case.type === CaseType.CORRECTIVO && createPreventive) {
      const nums = await nextNumbers(tx as any, tenantId, { case: true, workOrder: true });
      const prevCase = await tx.case.create({
        data: {
          tenantId,
          caseNo: nums.caseNo!,
          type: CaseType.PREVENTIVO,
          status: CaseStatus.NUEVO,
          priority: 3,
          title: `Mantenimiento preventivo - ${wo.case.bus.code}`,
          description: `Preventivo generado desde cierre correctivo (${wo.case.id}).`,
          busId: wo.case.busId,
        },
      });

      await tx.workOrder.create({
        data: { tenantId, workOrderNo: nums.workOrderNo!, caseId: prevCase.id },
      });
    }

    if (wo.case.type === CaseType.RENOVACION_TECNOLOGICA) {
      const autoPreventiveAt = new Date(tmEndedAt.getTime() + 21 * 24 * 60 * 60 * 1000);
      await tx.caseEvent.create({
        data: {
          caseId: wo.caseId,
          type: CaseEventType.COMMENT,
          message: "Preventivo automático programado para día 21 post renovación.",
          meta: { sourceWorkOrderId: wo.id, autoPreventiveAt: autoPreventiveAt.toISOString() },
        },
      });
    }

    if (!needsCoordinatorValidation && !wo.interventionReceipt) {
      const reportTicket =
        wo.case.type === CaseType.PREVENTIVO
          ? wo.preventiveReport?.ticketNumber
          : wo.case.type === CaseType.RENOVACION_TECNOLOGICA
          ? (wo as any).renewalTechReport?.ticketNumber
          : wo.correctiveReport?.ticketNumber;
      const normalizedReportTicket = String(reportTicket ?? "").trim();
      let ticketNo: string;
      if (normalizedReportTicket.length > 0) {
        ticketNo = normalizedReportTicket.toUpperCase().startsWith("UPK-")
          ? normalizedReportTicket
          : `UPK-${normalizedReportTicket}`;
      } else {
        const nums = await nextNumbers(tx as any, tenantId, { ticket: true });
        ticketNo = `UPK-${String(nums.ticketNo ?? 0).padStart(3, "0")}`;
      }

      // Evitar colisión por ticketNo duplicado
      const exists = await tx.interventionReceipt.findFirst({
        where: { tenantId, ticketNo },
        select: { id: true },
      });
      if (exists) {
        const nums = await nextNumbers(tx as any, tenantId, { ticket: true });
        ticketNo = `UPK-${String(nums.ticketNo ?? 0).padStart(3, "0")}`;
      }
      const internalStart = formatInternalTime(wo.startedAt);
      const internalEnd = formatInternalTime(tmEndedAt);

      for (let attempt = 0; attempt < 10; attempt += 1) {
        try {
          await tx.interventionReceipt.create({
            data: {
              tenantId,
              workOrderId: wo.id,
              caseId: wo.caseId,
              ticketNo,
              tmStartedAt,
              tmEndedAt,
              internalStart: internalStart ?? null,
              internalEnd: internalEnd ?? null,
            },
          });
          break;
        } catch (e) {
          const known = e as Prisma.PrismaClientKnownRequestError;
          const isTicketCollision =
            known?.code === "P2002" &&
            Array.isArray((known.meta as any)?.target) &&
            ((known.meta as any).target as string[]).includes("ticketNo");
          if (!isTicketCollision || attempt >= 9) throw e;
          const nums = await nextNumbers(tx as any, tenantId, { ticket: true });
          ticketNo = `UPK-${String(nums.ticketNo ?? 0).padStart(3, "0")}`;
        }
      }
    }

    if (wo.case.type === CaseType.PREVENTIVO && createCorrective && correctiveEquipmentIds.length) {
      for (const equipmentId of correctiveEquipmentIds) {
        const nums = await nextNumbers(tx as any, tenantId, { case: true, workOrder: true });
        const corrCase = await tx.case.create({
          data: {
            tenantId,
            caseNo: nums.caseNo!,
            type: CaseType.CORRECTIVO,
            status: CaseStatus.NUEVO,
            priority: 3,
            title: `Correctivo generado - ${wo.case.bus.code}`,
            description: `Correctivo generado desde preventivo (${wo.case.id}).`,
            busId: wo.case.busId,
            busEquipmentId: equipmentId,
          },
        });

        await tx.caseEquipment.create({
          data: { caseId: corrCase.id, busEquipmentId: equipmentId },
        });

        await tx.workOrder.create({
          data: { tenantId, workOrderNo: nums.workOrderNo!, caseId: corrCase.id },
        });
      }
    }
  });

  await notifyTenantUsers({
    tenantId,
    roles: [Role.ADMIN, Role.BACKOFFICE],
    type: NotificationType.WO_FINISHED,
    title: needsCoordinatorValidation ? "OT en validación de acta" : "OT finalizada",
    body: `OT: ${wo.id} | Bus: ${wo.case.bus.code}`,
    meta: { workOrderId: wo.id, caseId: wo.caseId },
  });

  return NextResponse.json({ ok: true });
}
