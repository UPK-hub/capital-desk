export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
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

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;
  const threadId = String(ctx.params.id);

  const ok = await canAccessThread(tenantId, userId, threadId);
  if (!ok) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const items = await prisma.directChatMessage.findMany({
    where: { threadId, tenantId },
    orderBy: { createdAt: "asc" },
    include: { sender: { select: { id: true, name: true, role: true } } },
  });

  await prisma.directChatParticipant.updateMany({
    where: { threadId, userId },
    data: { lastReadAt: new Date() },
  });

  return NextResponse.json({ items });
}

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;
  const threadId = String(ctx.params.id);

  const ok = await canAccessThread(tenantId, userId, threadId);
  if (!ok) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const message = String(body?.message ?? "").trim();
  if (!message) return NextResponse.json({ error: "Mensaje requerido" }, { status: 400 });

  const created = await prisma.directChatMessage.create({
    data: {
      tenantId,
      threadId,
      senderId: userId,
      message,
    },
    include: { sender: { select: { id: true, name: true, role: true } } },
  });

  await prisma.directChatThread.update({
    where: { id: threadId },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json({ item: created });
}
