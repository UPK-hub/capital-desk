/**
 * Edición de la fecha de realización de un caso.
 *
 *   PATCH /api/cases/<id>/performed-at   { "date": "2026-08-31" }  // o null para volver al valor por defecto
 *
 * La puede ajustar cualquier usuario con acceso al caso (incluidos los
 * técnicos), porque es quien estuvo en el bus el que sabe qué día se hizo el
 * trabajo. Cada cambio queda registrado en la actividad del caso con el nombre
 * de quien lo hizo, la fecha anterior y la nueva.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CaseEventType, Role } from "@prisma/client";
import { buildCaseAccessWhere } from "@/lib/access-control";
import { casePerformedAt, parsePerformedDateInput, performedDateInputValue } from "@/lib/cases/performed-at";

function fmt(d: Date) {
  return performedDateInputValue(d).split("-").reverse().join("/");
}

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = (session.user as any).role as Role;
  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;
  const capabilities = (session.user as any).capabilities as string[] | undefined;

  const current = await prisma.case.findFirst({
    where: {
      ...(await buildCaseAccessWhere({ caseId: ctx.params.id, tenantId, role, capabilities, userId })),
      // El técnico solo puede tocar los casos que tiene asignados.
      ...(role === Role.TECHNICIAN ? { assignedToId: userId } : {}),
    },
    select: { id: true, createdAt: true, performedAt: true },
  });
  if (!current) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const body = await req.json().catch(() => ({} as any));
  const raw = body?.date;

  let performedAt: Date | null = null;
  if (raw !== null && raw !== "" && raw !== undefined) {
    performedAt = parsePerformedDateInput(String(raw));
    if (!performedAt) {
      return NextResponse.json({ error: "Fecha inválida. Usa el formato dd/mm/aaaa." }, { status: 400 });
    }
    // Un trabajo no puede haberse realizado en el futuro.
    if (performedAt.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      return NextResponse.json({ error: "La fecha de realización no puede ser futura." }, { status: 400 });
    }
  }

  const antes = casePerformedAt(current);

  const updated = await prisma.case.update({
    where: { id: current.id },
    data: { performedAt },
    select: { id: true, createdAt: true, performedAt: true },
  });

  const despues = casePerformedAt(updated);
  let autor: { name: string | null } | null = null;

  if (antes.getTime() !== despues.getTime()) {
    autor = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    const quien = autor?.name?.trim() || "un usuario";
    await prisma.caseEvent.create({
      data: {
        caseId: current.id,
        type: CaseEventType.COMMENT,
        message: performedAt
          ? `Fecha de realización ajustada de ${fmt(antes)} a ${fmt(despues)} por ${quien}.`
          : `Fecha de realización restablecida a la de creación (${fmt(despues)}) por ${quien}.`,
        meta: {
          kind: "PERFORMED_AT",
          by: userId,
          byName: quien,
          from: antes.toISOString(),
          to: updated.performedAt?.toISOString() ?? null,
        },
      },
    });
  }

  return NextResponse.json({
    ok: true,
    performedAt: updated.performedAt?.toISOString() ?? null,
    effectiveDate: performedDateInputValue(despues),
    isDefault: !updated.performedAt,
    lastChange:
      antes.getTime() !== despues.getTime()
        ? { by: autor?.name ?? null, at: new Date().toISOString() }
        : undefined,
  });
}
