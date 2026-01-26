export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, StsTicketChannel, StsTicketSeverity } from "@prisma/client";
import { canStsRead, canStsWrite } from "@/lib/sts/access";
import { rateLimit } from "@/lib/sts/rate-limit";
import { z } from "zod";

const createSchema = z.object({
  componentId: z.string().min(1),
  severity: z.nativeEnum(StsTicketSeverity),
  channel: z.nativeEnum(StsTicketChannel),
  description: z.string().trim().min(5),
  assignedToId: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = session.user.role as Role;
  const caps = (session.user as any).capabilities as string[] | undefined;
  if (!canStsRead(role, caps)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const tenantId = (session.user as any).tenantId as string;
  const severity = req.nextUrl.searchParams.get("severity");
  const status = req.nextUrl.searchParams.get("status");
  const componentId = req.nextUrl.searchParams.get("componentId");
  const breach = req.nextUrl.searchParams.get("breach");

  const items = await prisma.stsTicket.findMany({
    where: {
      tenantId,
      ...(severity ? { severity: severity as StsTicketSeverity } : {}),
      ...(status ? { status: status as any } : {}),
      ...(componentId ? { componentId } : {}),
      ...(breach === "response" ? { breachResponse: true } : {}),
      ...(breach === "resolution" ? { breachResolution: true } : {}),
    },
    include: {
      component: { select: { id: true, name: true, code: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
    },
    orderBy: { openedAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = session.user.role as Role;
  const caps = (session.user as any).capabilities as string[] | undefined;
  if (!canStsWrite(role, caps)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const tenantId = (session.user as any).tenantId as string;
  const actorId = (session.user as any).id as string;
  const limit = rateLimit(`sts.ticket.create:${actorId}`, 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Rate limit excedido" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validacion fallida", issues: parsed.error.issues }, { status: 400 });
  }

  const ticket = await prisma.$transaction(async (tx) => {
    const created = await tx.stsTicket.create({
      data: {
        tenantId,
        componentId: parsed.data.componentId,
        severity: parsed.data.severity,
        channel: parsed.data.channel,
        description: parsed.data.description,
        openedAt: new Date(),
        assignedToId: parsed.data.assignedToId ?? null,
      },
    });

    await tx.stsTicketEvent.create({
      data: {
        ticketId: created.id,
        type: "STATUS_CHANGE",
        status: "OPEN",
        message: "Ticket creado",
        createdById: actorId,
      },
    });

    await tx.stsAuditLog.create({
      data: {
        tenantId,
        actorId,
        action: "sts.ticket.create",
        entityType: "StsTicket",
        entityId: created.id,
        meta: { severity: created.severity, componentId: created.componentId },
      },
    });

    return created;
  });

  return NextResponse.json({ ok: true, ticket }, { status: 201 });
}
