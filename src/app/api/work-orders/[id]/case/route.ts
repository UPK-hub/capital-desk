export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;
  const role = session.user.role as Role;
  const workOrderId = String(ctx.params.id);

  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, tenantId },
    select: { id: true, assignedToId: true, caseId: true },
  });
  if (!wo) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  if (role === Role.TECHNICIAN && wo.assignedToId !== userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  return NextResponse.json({ caseId: wo.caseId });
}
