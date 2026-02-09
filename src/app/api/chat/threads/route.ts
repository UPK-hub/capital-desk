export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;

  const threads = await prisma.directChatThread.findMany({
    where: { tenantId, participants: { some: { userId } } },
    orderBy: { updatedAt: "desc" },
    include: {
      participants: { include: { user: { select: { id: true, name: true, role: true } } } },
      messages: {
        take: 1,
        orderBy: { createdAt: "desc" },
        include: { sender: { select: { id: true, name: true, role: true } } },
      },
    },
  });

  const items = await Promise.all(
    threads.map(async (thread) => {
      const lastMessage = thread.messages[0] ?? null;
      const myParticipant = thread.participants.find((p) => p.userId === userId);
      const lastReadAt = myParticipant?.lastReadAt ?? null;
      const unreadCount = await prisma.directChatMessage.count({
        where: {
          threadId: thread.id,
          senderId: { not: userId },
          createdAt: lastReadAt ? { gt: lastReadAt } : undefined,
        },
      });

      return {
        id: thread.id,
        participants: thread.participants.map((p) => p.user),
        lastMessage: lastMessage
          ? {
              id: lastMessage.id,
              message: lastMessage.message,
              createdAt: lastMessage.createdAt,
              sender: lastMessage.sender,
            }
          : null,
        unreadCount,
        updatedAt: thread.updatedAt,
      };
    }),
  );

  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;
  const body = await req.json().catch(() => ({}));
  const targetId = String(body?.userId ?? "");
  if (!targetId) return NextResponse.json({ error: "Usuario requerido" }, { status: 400 });

  const target = await prisma.user.findFirst({
    where: { id: targetId, tenantId, active: true },
    select: { id: true },
  });
  if (!target) return NextResponse.json({ error: "Usuario inválido" }, { status: 404 });

  const existing = await prisma.directChatThread.findFirst({
    where: {
      tenantId,
      participants: { some: { userId } },
      AND: [{ participants: { some: { userId: targetId } } }],
    },
    include: { participants: true },
    orderBy: { updatedAt: "desc" },
  });

  if (existing && existing.participants.length === 2) {
    return NextResponse.json({ item: { id: existing.id } });
  }

  const created = await prisma.directChatThread.create({
    data: {
      tenantId,
      createdById: userId,
      participants: {
        create: [{ userId }, { userId: targetId }],
      },
    },
  });

  return NextResponse.json({ item: { id: created.id } });
}
