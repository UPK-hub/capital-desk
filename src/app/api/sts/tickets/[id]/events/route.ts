export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { canStsWrite } from "@/lib/sts/access";
import { calcSlaResult } from "@/lib/sts/sla";
import { rateLimit } from "@/lib/sts/rate-limit";
import { z } from "zod";

const createSchema = z.object({
  message: z.string().trim().min(1),
  isResponse: z.boolean().optional(),
});

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = session.user.role as Role;
  const caps = (session.user as any).capabilities as string[] | undefined;
  if (!canStsWrite(role, caps)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const tenantId = (session.user as any).tenantId as string;
  const actorId = (session.user as any).id as string;
  const limit = rateLimit(`sts.ticket.comment:${actorId}`, 60, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Rate limit excedido" }, { status: 429 });
  }
  const id = String(ctx.params.id);

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validacion fallida", issues: parsed.error.issues }, { status: 400 });
  }

  const ticket = await prisma.stsTicket.findFirst({
    where: { id, tenantId },
    include: { events: true },
  });
  if (!ticket) return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });

  const updates: any = {};
  if (parsed.data.isResponse && !ticket.firstResponseAt) {
    updates.firstResponseAt = new Date();
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

  const result = calcSlaResult({
    openedAt: ticket.openedAt,
    firstResponseAt: updates.firstResponseAt ?? ticket.firstResponseAt,
    resolvedAt: ticket.resolvedAt,
    closedAt: ticket.closedAt,
    events: ticket.events,
    policy,
    maintenanceWindows,
  });

  updates.breachResponse = result.breachResponse;
  updates.breachResolution = result.breachResolution;

  await prisma.$transaction(async (tx) => {
    await tx.stsTicketEvent.create({
      data: {
        ticketId: ticket.id,
        type: "COMMENT",
        message: parsed.data.message,
        createdById: actorId,
        meta: { isResponse: parsed.data.isResponse ?? false },
      },
    });

    if (Object.keys(updates).length) {
      await tx.stsTicket.update({ where: { id: ticket.id }, data: updates });
    }

    await tx.stsAuditLog.create({
      data: {
        tenantId,
        actorId,
        action: "sts.ticket.comment",
        entityType: "StsTicket",
        entityId: ticket.id,
        meta: { isResponse: parsed.data.isResponse ?? false },
      },
    });
  });

  return NextResponse.json({ ok: true });
}
