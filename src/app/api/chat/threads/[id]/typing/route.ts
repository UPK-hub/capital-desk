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

const typingState = new Map<string, Map<string, { name: string; at: number }>>();

function touchTyping(threadId: string, userId: string, name: string) {
  const map = typingState.get(threadId) ?? new Map();
  map.set(userId, { name, at: Date.now() });
  typingState.set(threadId, map);
}

function snapshotTyping(threadId: string) {
  const map = typingState.get(threadId);
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
  const threadId = String(ctx.params.id);

  const ok = await canAccessThread(tenantId, userId, threadId);
  if (!ok) return new Response("No autorizado", { status: 403 });

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? session.user.name ?? "Usuario");
  touchTyping(threadId, userId, name);

  return new Response(null, { status: 204 });
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
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`retry: 2000\n\n`));
      while (true) {
        if (req.signal.aborted) break;
        const active = snapshotTyping(threadId).filter((u) => u.userId !== userId);
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
