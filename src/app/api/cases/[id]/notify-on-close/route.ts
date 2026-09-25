/**
 * Contacto del cliente al que se le avisa el cierre de una novedad.
 *
 *   PATCH /api/cases/<id>/notify-on-close   { "userId": "<id>" }   // o null para quitarlo
 *
 * Queda registrado en la actividad del caso con el nombre de quien lo cambió.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CaseEventType, CaseType, Role } from "@prisma/client";
import { buildCaseAccessWhere } from "@/lib/access-control";

const ROLES_PERMITIDOS: Role[] = [Role.ADMIN, Role.BACKOFFICE, Role.SUPERVISOR, Role.HELPDESK];

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = (session.user as any).role as Role;
  if (!ROLES_PERMITIDOS.includes(role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;
  const capabilities = (session.user as any).capabilities as string[] | undefined;

  const found = await prisma.case.findFirst({
    where: {
      ...(await buildCaseAccessWhere({ caseId: ctx.params.id, tenantId, role, capabilities, userId })),
      type: CaseType.NOVEDAD,
    },
    select: { id: true, notifyOnCloseUserId: true },
  });
  if (!found) return NextResponse.json({ error: "Novedad no encontrada" }, { status: 404 });

  const body = await req.json().catch(() => ({} as any));
  const destinoRaw = body?.userId === null ? null : String(body?.userId ?? "").trim();

  let destino: { id: string; name: string } | null = null;
  if (destinoRaw) {
    const u = await prisma.user.findFirst({
      where: { id: destinoRaw, tenantId, active: true },
      select: { id: true, name: true },
    });
    if (!u) return NextResponse.json({ error: "El contacto no existe o está inactivo." }, { status: 400 });
    destino = u;
  }

  if ((found.notifyOnCloseUserId ?? null) === (destino?.id ?? null)) {
    return NextResponse.json({ ok: true, unchanged: true, notifyOnCloseUserId: destino?.id ?? null });
  }

  await prisma.case.update({
    where: { id: found.id },
    data: { notifyOnCloseUserId: destino?.id ?? null },
  });

  const autor = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  const quien = autor?.name?.trim() || "un usuario";
  await prisma.caseEvent.create({
    data: {
      caseId: found.id,
      type: CaseEventType.COMMENT,
      message: destino
        ? `Aviso de cierre dirigido a ${destino.name} (contacto del cliente), por ${quien}.`
        : `Se quitó el aviso de cierre al cliente, por ${quien}.`,
      meta: { kind: "NOTIFY_ON_CLOSE", by: userId, byName: quien, notifyOnCloseUserId: destino?.id ?? null },
    },
  });

  return NextResponse.json({
    ok: true,
    notifyOnCloseUserId: destino?.id ?? null,
    notifyOnCloseName: destino?.name ?? null,
  });
}
