export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";



export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const role = (session.user as any).role as Role;

  // Ajusta permisos si quieres
  if (![Role.ADMIN, Role.BACKOFFICE, Role.TECHNICIAN].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const caseId = String(ctx.params.id);

  const c = await prisma.case.findFirst({
    where: { id: caseId, tenantId },
    select: {
      id: true,
      caseNo: true,
      title: true,
      workOrder: { select: { id: true, workOrderNo: true } },
    },
  });
  if (!c) return NextResponse.json({ error: "Caso no encontrado" }, { status: 404 });

  const [events, busEvents, users] = await Promise.all([
    prisma.caseEvent.findMany({
      where: { caseId },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.busLifecycleEvent.findMany({
      where: { caseId },
      orderBy: { occurredAt: "desc" },
      take: 200,
    }),
    prisma.user.findMany({
      where: { tenantId },
      select: { id: true, name: true, role: true },
    }),
  ]);

  const userById = new Map(users.map((u) => [u.id, u]));

  const timeline = events.map((e) => {
    const meta = (e.meta ?? {}) as any;
    const actorId = String(meta.by ?? meta.userId ?? meta.actorUserId ?? "");
    const actor = actorId ? userById.get(actorId) : null;

    const workOrderId = String(meta.workOrderId ?? "");
    const workOrderNo =
      c.workOrder?.id === workOrderId ? c.workOrder.workOrderNo : c.workOrder?.workOrderNo ?? null;

    return {
      kind: "CASE" as const,
      id: e.id,
      at: e.createdAt,
      type: e.type,
      message: e.message ?? null,
      actor: actor ? { id: actor.id, name: actor.name, role: actor.role } : null,
      refs: {
        caseId: c.id,
        caseNo: c.caseNo,
        workOrderId: workOrderId || c.workOrder?.id || null,
        workOrderNo: workOrderNo,
      },
      meta, // se mantiene para “ver detalles técnicos”
    };
  });

  const timelineBus = busEvents.map((b) => ({
    kind: "BUS" as const,
    id: b.id,
    at: b.occurredAt,
    type: b.eventType,
    message: b.summary ?? null,
    actor: null as any, // si luego guardas actor en meta, lo puedes resolver igual
    refs: {
      caseId: c.id,
      caseNo: c.caseNo,
      workOrderId: b.workOrderId ?? null,
      workOrderNo: c.workOrder?.id === b.workOrderId ? c.workOrder.workOrderNo : null,
    },
    meta: null as any,
  }));

  // mezcla y ordena
  const merged = [...timeline, ...timelineBus].sort((a, b) => +new Date(b.at) - +new Date(a.at));

  return NextResponse.json({
    case: {
      id: c.id,
      caseNo: c.caseNo,
      title: c.title,
      workOrderId: c.workOrder?.id ?? null,
      workOrderNo: c.workOrder?.workOrderNo ?? null,
    },
    items: merged,
  });
}
