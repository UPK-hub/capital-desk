import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Role } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const role = (session.user as any).role as Role;
  const userId = (session.user as any).id as string;

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "";

  const list = await prisma.workOrder.findMany({
    where: {
      tenantId,
      ...(status ? { status: status as any } : {}),
      ...(role === Role.ADMIN ? {} : { assignedToId: userId }),
    },
    include: {
      case: { include: { bus: true, busEquipment: { include: { equipmentType: true } } } },
      assignedTo: true,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ workOrders: list });
}
