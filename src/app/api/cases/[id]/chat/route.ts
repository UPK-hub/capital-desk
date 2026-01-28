export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

async function canAccessCaseChat(tenantId: string, userId: string, role: Role, caseId: string) {
  const c = await prisma.case.findFirst({
    where: { id: caseId, tenantId },
    include: { workOrder: { select: { assignedToId: true } } },
  });
  if (!c) return { ok: false, status: 404 };

  if (role === Role.TECHNICIAN) {
    if (c.workOrder?.assignedToId !== userId) return { ok: false, status: 403 };
  }

  if ([Role.ADMIN, Role.BACKOFFICE, Role.PLANNER, Role.SUPERVISOR, Role.HELPDESK].includes(role)) {
    return { ok: true, status: 200 };
  }

  if (role === Role.TECHNICIAN) return { ok: true, status: 200 };

  return { ok: false, status: 403 };
}

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;
  const role = session.user.role as Role;
  const caseId = String(ctx.params.id);

  const access = await canAccessCaseChat(tenantId, userId, role, caseId);
  if (!access.ok) return NextResponse.json({ error: "No autorizado" }, { status: access.status });

  const sinceParam = req.nextUrl.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : null;

  const items = await prisma.caseChatMessage.findMany({
    where: {
      tenantId,
      caseId,
      ...(since ? { createdAt: { gt: since } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 200,
    include: { sender: { select: { id: true, name: true, role: true } } },
  });

  return NextResponse.json({ items });
}

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;
  const role = session.user.role as Role;
  const caseId = String(ctx.params.id);

  const access = await canAccessCaseChat(tenantId, userId, role, caseId);
  if (!access.ok) return NextResponse.json({ error: "No autorizado" }, { status: access.status });

  const body = await req.json().catch(() => ({}));
  const message = String(body?.message ?? "").trim();
  if (!message) return NextResponse.json({ error: "Mensaje requerido" }, { status: 400 });

  const saved = await prisma.caseChatMessage.create({
    data: {
      tenantId,
      caseId,
      senderId: userId,
      message,
    },
    include: { sender: { select: { id: true, name: true, role: true } } },
  });

  return NextResponse.json({ ok: true, item: saved });
}
