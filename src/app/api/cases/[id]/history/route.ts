export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as Role;
  if (role !== Role.ADMIN && role !== Role.BACKOFFICE) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const id = String(ctx.params.id);

  const c = await prisma.case.findFirst({
    where: { id, tenantId },
    select: { id: true, busId: true, busEquipmentId: true },
  });
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [events, lifecycle] = await Promise.all([
    prisma.caseEvent.findMany({
      where: { caseId: id },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.busLifecycleEvent.findMany({
      where: {
        busId: c.busId,
        OR: [
          { caseId: id },
          c.busEquipmentId ? { busEquipmentId: c.busEquipmentId } : undefined,
        ].filter(Boolean) as any,
      },
      orderBy: { occurredAt: "desc" },
      take: 200,
    }),
  ]);

  return NextResponse.json({ events, lifecycle });
}
