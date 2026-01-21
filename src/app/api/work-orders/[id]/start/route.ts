import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveUpload } from "@/lib/uploads";
import { CaseEventType, CaseStatus, MediaKind, NotificationType, Role, WorkOrderStatus } from "@prisma/client";
import { notifyTenantUsers } from "@/lib/notifications";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;
  const role = (session.user as any).role as Role;

  const form = await req.formData();
  const notes = String(form.get("notes") ?? "").trim();
  const file = form.get("photo") as File | null;

  if (!notes) return NextResponse.json({ error: "La nota de inicio es requerida" }, { status: 400 });
  if (!file) return NextResponse.json({ error: "La foto de inicio es requerida" }, { status: 400 });

  const wo = await prisma.workOrder.findFirst({
    where: { id: ctx.params.id, tenantId },
    include: { case: { include: { bus: true } } },
  });
  if (!wo) return NextResponse.json({ error: "OT no encontrada" }, { status: 404 });

  // FIX: autorización correcta según schema
  if (role !== Role.ADMIN && wo.assignedToId !== userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const relPath = await saveUpload(file, `work-orders/${wo.id}/start`);

  await prisma.$transaction(async (tx) => {
    const step = await tx.workOrderStep.create({
      data: { workOrderId: wo.id, stepType: "INICIO", notes },
    });

    await tx.workOrderMedia.create({
      data: { workOrderStepId: step.id, kind: MediaKind.FOTO_INICIO, filePath: relPath },
    });

    await tx.workOrder.update({
      where: { id: wo.id },
      data: { status: WorkOrderStatus.EN_CAMPO, startedAt: wo.startedAt ?? new Date() },
    });

    await tx.case.update({
      where: { id: wo.caseId },
      data: { status: CaseStatus.EN_EJECUCION },
    });

    await tx.caseEvent.create({
      data: {
        caseId: wo.caseId,
        type: CaseEventType.STATUS_CHANGE,
        message: "OT iniciada",
        meta: { workOrderId: wo.id, by: userId },
      },
    });

    await tx.busLifecycleEvent.create({
      data: {
        busId: wo.case.busId,
        caseId: wo.caseId,
        workOrderId: wo.id,
        eventType: "WO_STARTED",
        summary: "OT iniciada con evidencia",
        occurredAt: new Date(),
      },
    });
  });

  await notifyTenantUsers({
    tenantId,
    roles: [Role.ADMIN, Role.BACKOFFICE],
    type: NotificationType.WO_STARTED,
    title: "OT iniciada",
    body: `OT: ${wo.id} | Bus: ${wo.case.bus.code}`,
    href: `/work-orders/${wo.id}`,
    meta: { workOrderId: wo.id, caseId: wo.caseId },
  });

  return NextResponse.json({ ok: true });
}
