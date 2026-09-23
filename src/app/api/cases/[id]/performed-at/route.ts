/**
 * Edición de la fecha de realización de un caso.
 *
 *   PATCH /api/cases/<id>/performed-at   { "date": "2026-08-31" }  // o null para volver al valor por defecto
 *
 * Solo administración y backoffice. Queda registrado en la actividad del caso.
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
  if (role !== Role.ADMIN && role !== Role.BACKOFFICE) {
    return NextResponse.json({ error: "Solo administración y backoffice pueden cambiar esta fecha." }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;
  const capabilities = (session.user as any).capabilities as string[] | undefined;

  const current = await prisma.case.findFirst({
    where: await buildCaseAccessWhere({ caseId: ctx.params.id, tenantId, role, capabilities, userId }),
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
  if (antes.getTime() !== despues.getTime()) {
    await prisma.caseEvent.create({
      data: {
        caseId: current.id,
        type: CaseEventType.COMMENT,
        message: performedAt
          ? `Fecha de realización ajustada a ${fmt(despues)} (antes ${fmt(antes)}).`
          : `Fecha de realización restablecida a la de creación (${fmt(despues)}).`,
        meta: { performedAt: performedAt?.toISOString() ?? null, actorUserId: userId },
      },
    });
  }

  return NextResponse.json({
    ok: true,
    performedAt: updated.performedAt?.toISOString() ?? null,
    effectiveDate: performedDateInputValue(despues),
    isDefault: !updated.performedAt,
  });
}
