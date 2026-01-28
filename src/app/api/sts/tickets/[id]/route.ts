export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, StsTicketStatus } from "@prisma/client";
import { canStsRead, canStsWrite } from "@/lib/sts/access";
import { calcSlaResult, slaProgress } from "@/lib/sts/sla";
import { mapTicketStatusToCaseStatus } from "@/lib/sts/case-status";
import { recomputeStsKpisForTenant } from "@/lib/sts/kpi-recompute";
import { z } from "zod";

const patchSchema = z.object({
  status: z.nativeEnum(StsTicketStatus).optional(),
  assignedToId: z.string().optional().nullable(),
});

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = session.user.role as Role;
  const caps = (session.user as any).capabilities as string[] | undefined;
  if (!canStsRead(role, caps)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const tenantId = (session.user as any).tenantId as string;
  const id = String(ctx.params.id);

  const ticket = await prisma.stsTicket.findFirst({
    where: { id, tenantId },
    include: {
      component: true,
      assignedTo: { select: { id: true, name: true, email: true } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!ticket) return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });

  const policy = await prisma.stsSlaPolicy.findFirst({
    where: { tenantId, componentId: ticket.componentId, severity: ticket.severity },
  });
  const maintenanceWindows = await prisma.stsMaintenanceWindow.findMany({
    where: {
      tenantId,
      OR: [{ componentId: ticket.componentId }, { componentId: null }],
    },
    select: { startAt: true, endAt: true },
  });

  const sla = calcSlaResult({
    openedAt: ticket.openedAt,
    firstResponseAt: ticket.firstResponseAt,
    resolvedAt: ticket.resolvedAt,
    closedAt: ticket.closedAt,
    events: ticket.events,
    policy,
    maintenanceWindows,
  });

  const now = new Date();
  const responseProgress =
    policy && !ticket.firstResponseAt ? slaProgress(now, ticket.openedAt, policy.responseMinutes) : null;
  const resolutionProgress =
    policy && !ticket.closedAt ? slaProgress(now, ticket.openedAt, policy.resolutionMinutes) : null;

  return NextResponse.json({
    ticket,
    sla: { ...sla, responseProgress, resolutionProgress },
  });
}

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = session.user.role as Role;
  const caps = (session.user as any).capabilities as string[] | undefined;
  if (!canStsWrite(role, caps)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const tenantId = (session.user as any).tenantId as string;
  const actorId = (session.user as any).id as string;
  const id = String(ctx.params.id);

  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validacion fallida", issues: parsed.error.issues }, { status: 400 });
  }

  const ticket = await prisma.stsTicket.findFirst({
    where: { id, tenantId },
    include: { events: true },
  });
  if (!ticket) return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });

  const updates: any = {};
  const events: any[] = [];
  const statusChanged = parsed.data.status && parsed.data.status !== ticket.status;

  if (statusChanged) {
    updates.status = parsed.data.status;
    if (parsed.data.status === "RESOLVED" && !ticket.resolvedAt) updates.resolvedAt = new Date();
    if (parsed.data.status === "CLOSED") {
      updates.closedAt = new Date();
      if (!ticket.resolvedAt) updates.resolvedAt = new Date();
    }
    events.push({
      ticketId: ticket.id,
      type: "STATUS_CHANGE",
      status: parsed.data.status,
      message: `Estado cambiado a ${parsed.data.status}`,
      createdById: actorId,
    });
  }

  if (parsed.data.assignedToId !== undefined && parsed.data.assignedToId !== ticket.assignedToId) {
    updates.assignedToId = parsed.data.assignedToId;
    events.push({
      ticketId: ticket.id,
      type: "ASSIGN",
      message: parsed.data.assignedToId ? "Ticket asignado" : "Asignacion removida",
      createdById: actorId,
      meta: { assignedToId: parsed.data.assignedToId ?? null },
    });
  }

  const policy = await prisma.stsSlaPolicy.findFirst({
    where: { tenantId, componentId: ticket.componentId, severity: ticket.severity },
  });
  const maintenanceWindows = await prisma.stsMaintenanceWindow.findMany({
    where: {
      tenantId,
      OR: [{ componentId: ticket.componentId }, { componentId: null }],
    },
    select: { startAt: true, endAt: true },
  });

  const calcEvents = [
    ...ticket.events,
    ...events
      .filter((e) => e.type === "STATUS_CHANGE" && e.status)
      .map((e) => ({ ...e, createdAt: new Date() })),
  ];

  const result = calcSlaResult({
    openedAt: ticket.openedAt,
    firstResponseAt: ticket.firstResponseAt,
    resolvedAt: updates.resolvedAt ?? ticket.resolvedAt,
    closedAt: updates.closedAt ?? ticket.closedAt,
    events: calcEvents as any,
    policy,
    maintenanceWindows,
  });

  updates.breachResponse = result.breachResponse;
  updates.breachResolution = result.breachResolution;

  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.stsTicket.update({
      where: { id: ticket.id },
      data: updates,
    });

    if (events.length) {
      await tx.stsTicketEvent.createMany({ data: events });
    }

    if (ticket.caseId && statusChanged) {
      await tx.case.update({
        where: { id: ticket.caseId },
        data: { status: mapTicketStatusToCaseStatus(saved.status) },
      });
      await tx.caseEvent.create({
        data: {
          caseId: ticket.caseId,
          type: "STATUS_CHANGE",
          message: `Caso actualizado por ticket STS (${saved.status})`,
          meta: { ticketId: ticket.id, by: actorId, status: saved.status },
        },
      });
    }

    await tx.stsAuditLog.create({
      data: {
        tenantId,
        actorId,
        action: "sts.ticket.update",
        entityType: "StsTicket",
        entityId: ticket.id,
        meta: updates,
      },
    });

    return saved;
  });

  const shouldRecompute = statusChanged && (updates.closedAt || parsed.data.status === "CLOSED");
  if (shouldRecompute) {
    await recomputeStsKpisForTenant(tenantId);
  }

  return NextResponse.json({ ok: true, ticket: updated });
}
