export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;
  const role = (session.user as any).role as Role;

  if (![Role.TECHNICIAN, Role.ADMIN].includes(role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const open = await prisma.technicianShiftLog.findFirst({
    where: { tenantId, userId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });

  if (!open) {
    return NextResponse.json({ error: "No hay un turno abierto." }, { status: 409 });
  }

  const updated = await prisma.technicianShiftLog.update({
    where: { id: open.id },
    data: { endedAt: new Date() },
  });

  return NextResponse.json({ ok: true, shift: updated });
}
