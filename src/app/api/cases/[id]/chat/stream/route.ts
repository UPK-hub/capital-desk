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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  let since = req.nextUrl.searchParams.get("since");
  let last = since ? new Date(since) : new Date(0);

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`retry: 2000\n\n`));
      while (true) {
        if (req.signal.aborted) break;

        const items = await prisma.caseChatMessage.findMany({
          where: { tenantId, caseId, createdAt: { gt: last } },
          orderBy: { createdAt: "asc" },
          take: 50,
          include: { sender: { select: { id: true, name: true, role: true } } },
        });

        for (const item of items) {
          const payload = JSON.stringify(item);
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
          last = item.createdAt;
        }

        await sleep(2000);
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
