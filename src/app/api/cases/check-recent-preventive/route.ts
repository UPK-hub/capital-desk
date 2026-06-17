export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { CaseType, Role } from "@prisma/client";

// Umbral (en días) para considerar "reciente" un preventivo del mismo bus.
const RECENT_PREVENTIVE_DAYS = 30;

const ALLOWED_ROLES: Role[] = [Role.ADMIN, Role.BACKOFFICE, Role.SUPERVISOR, Role.PLANNER];

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const role = (session.user as any).role as Role;
  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const url = new URL(req.url);
  const busId = String(url.searchParams.get("busId") ?? "").trim();
  if (!busId) {
    return NextResponse.json({ error: "busId es requerido" }, { status: 400 });
  }

  const lastPreventive = await prisma.case.findFirst({
    where: { tenantId, busId, type: CaseType.PREVENTIVO },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (!lastPreventive) {
    return NextResponse.json({ recent: false, days: null, lastDate: null });
  }

  const diffMs = Date.now() - lastPreventive.createdAt.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const recent = days < RECENT_PREVENTIVE_DAYS;

  return NextResponse.json({
    recent,
    days,
    lastDate: lastPreventive.createdAt.toISOString(),
  });
}
