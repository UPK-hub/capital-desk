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
  Role,
  WorkOrderStatus,
} from "@prisma/client";
import { notifyTenantUsers } from "@/lib/notifications";
import { nextNumbers } from "@/lib/tenant-sequence";



export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;
  const role = (session.user as any).role as Role;

  const form = await req.formData();
  const notes = String(form.get("notes") ?? "").trim();
  const file = form.get("photo") as File | null;
  const createPreventive = String(form.get("createPreventive") ?? "").toLowerCase() === "true";
  const createCorrective = String(form.get("createCorrective") ?? "").toLowerCase() === "true";
  const correctiveEquipmentIdsRaw = String(form.get("correctiveEquipmentIds") ?? "").trim();
  const correctiveEquipmentIds = correctiveEquipmentIdsRaw
    ? (JSON.parse(correctiveEquipmentIdsRaw) as string[]).map((id) => String(id))
    : [];

  if (!notes) return NextResponse.json({ error: "La nota de finalización es requerida" }, { status: 400 });
  if (!file) return NextResponse.json({ error: "La foto de finalización es requerida" }, { status: 400 });

  const wo = await prisma.workOrder.findFirst({
    where: { id: ctx.params.id, tenantId },
    include: {
      case: {
        include: {
          bus: true,
          caseEquipments: true,
        },
      },
      correctiveReport: true,
      preventiveReport: true,
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

  const relPath = await saveUpload(file, `work-orders/${wo.id}/finish`);
  const tmMinutes = cfg?.tmDurationMinutes ?? 60;
  const tmEndedAt = new Date();
  const tmStartedAt = new Date(tmEndedAt.getTime() - tmMinutes * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    const step = await tx.workOrderStep.create({
      data: { workOrderId: wo.id, stepType: "FIN", notes },
    });

    await tx.workOrderMedia.create({
      data: { workOrderStepId: step.id, kind: MediaKind.FOTO_FIN, filePath: relPath },
    });

    await tx.workOrder.update({
      where: { id: wo.id },
      data: { status: WorkOrderStatus.FINALIZADA, finishedAt: tmEndedAt },
    });

    await tx.case.update({
      where: { id: wo.caseId },
      data: { status: CaseStatus.RESUELTO },
    });

    await tx.caseEvent.create({
      data: {
        caseId: wo.caseId,
        type: CaseEventType.STATUS_CHANGE,
        message: "OT finalizada",
        meta: { workOrderId: wo.id, by: userId },
      },
    });

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

    if (!wo.interventionReceipt) {
      const reportTicket =
        wo.case.type === CaseType.PREVENTIVO ? wo.preventiveReport?.ticketNumber : wo.correctiveReport?.ticketNumber;
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
      const internalStart =
        wo.case.type === CaseType.PREVENTIVO ? wo.preventiveReport?.timeStart : wo.correctiveReport?.timeStart;
      const internalEnd =
        wo.case.type === CaseType.PREVENTIVO ? wo.preventiveReport?.timeEnd : wo.correctiveReport?.timeEnd;

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
    title: "OT finalizada",
    body: `OT: ${wo.id} | Bus: ${wo.case.bus.code}`,
    meta: { workOrderId: wo.id, caseId: wo.caseId },
  });

  return NextResponse.json({ ok: true });
}
