export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id as string;
  const tenantId = (session.user as any).tenantId as string;

  const url = new URL(req.url);
  const take = Math.min(Number(url.searchParams.get("take") ?? 20), 50);

  // Lista (últimas N)
  const items = await prisma.notification.findMany({
    where: { tenantId, userId },
    orderBy: { createdAt: "desc" },
    take,
  });

  // Contador no leídas
  const unreadCount = await prisma.notification.count({
    where: { tenantId, userId, readAt: null },
  });

  return NextResponse.json({ items, unreadCount });
}
