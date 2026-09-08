export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Gestión (tratamiento) de un evento de botón de pánico: asignación, cambio de
// estado, observaciones y vinculación con un caso de la mesa. Toda acción queda
// registrada en la bitácora del evento (PanicEventLog).

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { PanicEventLogType, PanicEventStatus, Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManagePanic, canViewPanic } from "@/lib/panic/access";

const STATUSES = new Set(Object.values(PanicEventStatus));

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!canViewPanic(session.user as any)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (!canManagePanic(session.user as any)) {
    return NextResponse.json({ error: "Su usuario puede consultar, pero no gestionar" }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const actorUserId = (session.user as any).id as string | undefined;

  const event = await prisma.panicEvent.findFirst({
    where: { id: ctx.params.id, tenantId },
    select: { id: true, status: true, assignedToId: true },
  });
  if (!event) return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as
    | {
        status?: string;
        assignedToId?: string | null;
        resolution?: string | null;
        notes?: string | null;
        note?: string | null;
        caseId?: string | null;
      }
    | null;

  if (!body) return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });

  const data: Prisma.PanicEventUpdateInput = {};
  const logs: Prisma.PanicEventLogCreateManyInput[] = [];
  const now = new Date();

  if (typeof body.status === "string" && body.status.trim()) {
    const next = body.status.trim().toUpperCase() as PanicEventStatus;
    if (!STATUSES.has(next)) return NextResponse.json({ error: "Estado inválido" }, { status: 400 });

    if (next !== event.status) {
      data.status = next;
      if (next === PanicEventStatus.ATENDIDO || next === PanicEventStatus.DESCARTADO) {
        data.reviewedAt = now;
        if (actorUserId) data.reviewedBy = { connect: { id: actorUserId } };
      }
      logs.push({
        eventId: event.id,
        type: PanicEventLogType.CAMBIO_ESTADO,
        fromStatus: event.status,
        toStatus: next,
        message: `Estado: ${event.status} → ${next}`,
        actorUserId: actorUserId ?? null,
      });
    }
  }

  if (body.assignedToId !== undefined) {
    const nextAssignee = body.assignedToId ? String(body.assignedToId) : null;
    if (nextAssignee) {
      const user = await prisma.user.findFirst({
        where: { id: nextAssignee, tenantId, active: true },
        select: { id: true, name: true },
      });
      if (!user) return NextResponse.json({ error: "Responsable no válido" }, { status: 400 });
      data.assignedTo = { connect: { id: user.id } };
      logs.push({
        eventId: event.id,
        type: PanicEventLogType.ASIGNACION,
        message: `Responsable asignado: ${user.name}`,
        actorUserId: actorUserId ?? null,
      });
    } else {
      data.assignedTo = { disconnect: true };
      logs.push({
        eventId: event.id,
        type: PanicEventLogType.ASIGNACION,
        message: "Responsable retirado",
        actorUserId: actorUserId ?? null,
      });
    }
  }

  if (typeof body.resolution === "string") {
    data.resolution = body.resolution.trim() || null;
  }

  if (typeof body.notes === "string") {
    data.notes = body.notes.trim() || null;
  }

  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (note) {
    logs.push({
      eventId: event.id,
      type: PanicEventLogType.COMENTARIO,
      message: note.slice(0, 2000),
      actorUserId: actorUserId ?? null,
    });
  }

  if (body.caseId !== undefined) {
    const nextCase = body.caseId ? String(body.caseId) : null;
    if (nextCase) {
      const linked = await prisma.case.findFirst({
        where: { id: nextCase, tenantId },
        select: { id: true, caseNo: true, title: true },
      });
      if (!linked) return NextResponse.json({ error: "Caso no encontrado" }, { status: 400 });
      data.case = { connect: { id: linked.id } };
      logs.push({
        eventId: event.id,
        type: PanicEventLogType.CASO_VINCULADO,
        message: `Caso vinculado: #${linked.caseNo ?? linked.id} ${linked.title}`,
        actorUserId: actorUserId ?? null,
      });
    } else {
      data.case = { disconnect: true };
    }
  }

  if (!Object.keys(data).length && !logs.length) {
    return NextResponse.json({ ok: true, sinCambios: true });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = Object.keys(data).length
      ? await tx.panicEvent.update({ where: { id: event.id }, data, select: { id: true, status: true } })
      : { id: event.id, status: event.status };

    if (logs.length) await tx.panicEventLog.createMany({ data: logs });
    return result;
  });

  return NextResponse.json({ ok: true, id: updated.id, status: updated.status });
}
