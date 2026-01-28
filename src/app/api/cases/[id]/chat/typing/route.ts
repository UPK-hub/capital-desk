export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
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

const typingState = new Map<string, Map<string, { name: string; at: number }>>();

function touchTyping(caseId: string, userId: string, name: string) {
  const map = typingState.get(caseId) ?? new Map();
  map.set(userId, { name, at: Date.now() });
  typingState.set(caseId, map);
}

function snapshotTyping(caseId: string) {
  const map = typingState.get(caseId);
  if (!map) return [] as Array<{ userId: string; name: string }>;
  const now = Date.now();
  const active: Array<{ userId: string; name: string }> = [];
  for (const [userId, entry] of map.entries()) {
    if (now - entry.at < 4500) {
      active.push({ userId, name: entry.name });
    }
  }
  return active;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return new Response("No autenticado", { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;
  const role = session.user.role as Role;
  const caseId = String(ctx.params.id);

  const access = await canAccessCaseChat(tenantId, userId, role, caseId);
  if (!access.ok) return new Response("No autorizado", { status: access.status });

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? session.user.name ?? "Usuario");
  touchTyping(caseId, userId, name);

  return new Response(null, { status: 204 });
}

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return new Response("No autenticado", { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;
  const role = session.user.role as Role;
  const caseId = String(ctx.params.id);

  const access = await canAccessCaseChat(tenantId, userId, role, caseId);
  if (!access.ok) return new Response("No autorizado", { status: access.status });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`retry: 2000\n\n`));
      while (true) {
        if (req.signal.aborted) break;
        const active = snapshotTyping(caseId).filter((u) => u.userId !== userId);
        const payload = JSON.stringify(active);
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        await sleep(1500);
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
