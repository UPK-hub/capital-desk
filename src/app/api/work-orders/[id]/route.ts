export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(_: Request, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tenantId = (session.user as any).tenantId as string;

  const wo = await prisma.workOrder.findFirst({
    where: { id: ctx.params.id, tenantId },
    include: {
      assignedTo: true,
      case: { include: { bus: true, busEquipment: { include: { equipmentType: true } } } },
      steps: { include: { media: true }, orderBy: { createdAt: "asc" } },
      correctiveReport: true,
      preventiveReport: true,
      renewalTechReport: true,
    },
  });

  if (!wo) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ workOrder: wo });
}
