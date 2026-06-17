export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { CaseEventType, Role } from "@prisma/client";

const ALLOWED_ROLES: Role[] = [Role.ADMIN, Role.BACKOFFICE];

/**
 * Devuelve la lista de usuarios que han CREADO casos en el tenant (distinct),
 * para poblar el filtro "usuario creador" de la bandeja de casos.
 *
 * El creador NO vive en Case; se guarda en el CaseEvent type=CREATED, meta.userId.
 * Leemos esos eventos (acotados al tenant vía la relación case.tenantId),
 * extraemos los userId, deduplicamos y consultamos los usuarios ACTIVOS del tenant.
 *
 * Respuesta: { items: [{ id, name }] } ordenado por nombre.
 */
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const role = (session.user as any).role as Role;
  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  // 1) Eventos CREATED del tenant -> meta.userId
  const events = await prisma.caseEvent.findMany({
    where: { type: CaseEventType.CREATED, case: { tenantId } },
    select: { meta: true },
  });

  const ids = new Set<string>();
  for (const ev of events) {
    const uid = (ev.meta as any)?.userId;
    if (typeof uid === "string" && uid.trim()) ids.add(uid.trim());
  }

  if (ids.size === 0) {
    return NextResponse.json({ items: [] });
  }

  // 2) Usuarios activos del tenant que coincidan con esos ids
  const users = await prisma.user.findMany({
    where: { tenantId, active: true, id: { in: Array.from(ids) } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ items: users });
}
