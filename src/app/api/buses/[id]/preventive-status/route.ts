export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CaseType, Role } from "@prisma/client";
import { preventiveStatusForBus } from "@/lib/preventive-status";

// Roles que pueden crear casos / consultar el estado de preventivo del móvil.
const ALLOWED_ROLES: Role[] = [
  Role.ADMIN,
  Role.BACKOFFICE,
  Role.SUPERVISOR,
  Role.PLANNER,
  Role.TECHNICIAN,
];

/**
 * GET /api/buses/[id]/preventive-status
 *
 * Combina fecha de renovación + último preventivo + regla expectedForBus y
 * devuelve { status: "al_dia"|"pendiente"|"no_aplica", days, lastDate, renovDate, message }.
 */
export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = (session.user as any).role as Role;
  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const busId = String(ctx.params.id ?? "").trim();
  if (!busId) return NextResponse.json({ error: "busId requerido" }, { status: 400 });

  const bus = await prisma.bus.findFirst({
    where: { id: busId, tenantId },
    select: { id: true, code: true },
  });
  if (!bus) return NextResponse.json({ error: "Bus no encontrado" }, { status: 404 });

  const lastPreventive = await prisma.case.findFirst({
    where: { tenantId, busId, type: CaseType.PREVENTIVO },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  const result = preventiveStatusForBus({
    busCode: bus.code,
    lastPreventiveAt: lastPreventive?.createdAt ?? null,
  });

  return NextResponse.json(result);
}
