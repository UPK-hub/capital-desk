export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function canAccessThread(tenantId: string, userId: string, threadId: string) {
  const participant = await prisma.directChatParticipant.findFirst({
    where: { threadId, userId, thread: { tenantId } },
    select: { id: true },
  });
  return Boolean(participant);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return new Response("No autenticado", { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;
  const threadId = String(ctx.params.id);

  const ok = await canAccessThread(tenantId, userId, threadId);
  if (!ok) return new Response("No autorizado", { status: 403 });

  const encoder = new TextEncoder();
  let since = req.nextUrl.searchParams.get("since");
  let last = since ? new Date(since) : new Date(0);

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`retry: 2000\n\n`));
      while (true) {
        if (req.signal.aborted) break;

        const items = await prisma.directChatMessage.findMany({
          where: { tenantId, threadId, createdAt: { gt: last } },
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
