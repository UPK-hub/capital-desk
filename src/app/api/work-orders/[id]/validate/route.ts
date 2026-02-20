export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CASE_TYPE_REGISTRY } from "@/lib/case-type-registry";
import {
  CaseEventType,
  CaseStatus,
  CaseType,
  Prisma,
  Role,
  StsTicketEventType,
  StsTicketStatus,
  WorkOrderStatus,
} from "@prisma/client";
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

export async function POST(_: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;
  const role = (session.user as any).role as Role;
  if (![Role.ADMIN, Role.BACKOFFICE, Role.SUPERVISOR].includes(role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  let closeCaseAndTicket = true;
  try {
    const body = await _.json();
    if (typeof body?.closeCaseAndTicket === "boolean") {
      closeCaseAndTicket = body.closeCaseAndTicket;
    }
  } catch {
    // Sin body: mantiene comportamiento por defecto (cerrar caso + ticket)
  }

  const pendingValidationStatus = "EN_VALIDACION" as any;
  const wo = await prisma.workOrder.findFirst({
    where: { id: ctx.params.id, tenantId },
    include: {
      case: {
        include: {
          events: {
            where: { type: CaseEventType.CREATED },
            orderBy: { createdAt: "asc" },
            take: 1,
          },
        },
      },
      interventionReceipt: true,
    },
  });
  if (!wo) return NextResponse.json({ error: "OT no encontrada" }, { status: 404 });
  if (wo.case.type !== CaseType.CORRECTIVO && wo.case.type !== CaseType.PREVENTIVO) {
    return NextResponse.json({ error: "Solo aplica a OT preventiva/correctiva" }, { status: 400 });
  }
  if (wo.status !== pendingValidationStatus) {
    return NextResponse.json({ error: "La OT no está en validación" }, { status: 409 });
  }

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
    } else if (wo.case.busEquipmentId) {
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

    const siblingWos = await tx.workOrder.findMany({
      where: { tenantId, caseId: { in: siblingCaseIds } },
      include: {
        case: true,
        interventionReceipt: true,
        correctiveReport: true,
        preventiveReport: true,
      },
    });

    await tx.workOrder.updateMany({
      where: {
        id: { in: siblingWos.map((w) => w.id) },
        status: pendingValidationStatus,
      },
      data: { status: WorkOrderStatus.FINALIZADA },
    });

    await tx.case.updateMany({
      where: {
        id: { in: siblingCaseIds },
        status: { notIn: [CaseStatus.RESUELTO, CaseStatus.CERRADO] },
      },
      data: { status: closeCaseAndTicket ? CaseStatus.CERRADO : CaseStatus.RESUELTO },
    });

    await tx.caseEvent.createMany({
      data: siblingCaseIds.map((caseId) => ({
        caseId,
        type: CaseEventType.STATUS_CHANGE,
        message: closeCaseAndTicket
          ? "OT verificada por coordinador. Caso cerrado."
          : "OT verificada por coordinador. Caso resuelto.",
        meta: { validatedBy: userId, workOrderId: wo.id },
      })),
    });

    if (closeCaseAndTicket) {
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
            message: "Ticket cerrado automáticamente por validación de OT.",
            meta: { by: userId, workOrderId: wo.id },
            createdById: userId,
          },
        });

        if (ticket.caseId) {
          await tx.caseEvent.create({
            data: {
              caseId: ticket.caseId,
              type: CaseEventType.COMMENT,
              message: "Ticket STS cerrado automáticamente.",
              meta: { ticketId: ticket.id, by: userId, workOrderId: wo.id },
            },
          });
        }
      }
    }

    for (const item of siblingWos) {
      if (item.interventionReceipt) continue;

      const cfg = CASE_TYPE_REGISTRY[item.case.type];
      const tmMinutes = cfg?.tmDurationMinutes ?? 60;
      const tmEndedAt = item.finishedAt ?? new Date();
      const tmStartedAt = new Date(tmEndedAt.getTime() - tmMinutes * 60 * 1000);

      const reportTicket =
        item.case.type === CaseType.PREVENTIVO
          ? item.preventiveReport?.ticketNumber
          : item.correctiveReport?.ticketNumber;
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

      for (let i = 0; i < 5; i += 1) {
        const exists = await tx.interventionReceipt.findFirst({
          where: { tenantId, ticketNo },
          select: { id: true },
        });
        if (!exists) break;
        const nums = await nextNumbers(tx as any, tenantId, { ticket: true });
        ticketNo = `UPK-${String(nums.ticketNo ?? 0).padStart(3, "0")}`;
      }

      const internalStart = formatInternalTime(item.startedAt);
      const internalEnd = formatInternalTime(item.finishedAt ?? tmEndedAt);

      for (let attempt = 0; attempt < 10; attempt += 1) {
        try {
          await tx.interventionReceipt.create({
            data: {
              tenantId,
              workOrderId: item.id,
              caseId: item.caseId,
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
  });

  return NextResponse.json({ ok: true });
}
