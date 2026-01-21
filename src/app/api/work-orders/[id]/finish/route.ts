import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { saveUpload } from "@/lib/uploads";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { CASE_TYPE_REGISTRY } from "@/lib/case-type-registry";
import {
  CaseEventType,
  CaseStatus,
  MediaKind,
  NotificationType,
  Role,
  WorkOrderStatus,
} from "@prisma/client";
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

  if (!notes) return NextResponse.json({ error: "La nota de finalización es requerida" }, { status: 400 });
  if (!file) return NextResponse.json({ error: "La foto de finalización es requerida" }, { status: 400 });

  const wo = await prisma.workOrder.findFirst({
    where: { id: ctx.params.id, tenantId },
    include: { case: { include: { bus: true } }, correctiveReport: true, preventiveReport: true },
  });
  if (!wo) return NextResponse.json({ error: "OT no encontrada" }, { status: 404 });

  if (role !== Role.ADMIN && wo.assignedToId !== userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const cfg = CASE_TYPE_REGISTRY[wo.case.type];

  // Validación de formularios requeridos para finalizar
  if (cfg?.finishRequiresForm) {
    if (cfg.formKind === "CORRECTIVE" && !wo.correctiveReport) {
      return NextResponse.json({ error: "Debes completar el Formato Correctivo antes de finalizar." }, { status: 400 });
    }
    if (cfg.formKind === "PREVENTIVE" && !wo.preventiveReport) {
      return NextResponse.json({ error: "Debes completar el Formato Preventivo antes de finalizar." }, { status: 400 });
    }
  }

  const relPath = await saveUpload(file, `work-orders/${wo.id}/finish`);

  await prisma.$transaction(async (tx) => {
    const step = await tx.workOrderStep.create({
      data: { workOrderId: wo.id, stepType: "FIN", notes },
    });

    await tx.workOrderMedia.create({
      data: { workOrderStepId: step.id, kind: MediaKind.FOTO_FIN, filePath: relPath },
    });

    await tx.workOrder.update({
      where: { id: wo.id },
      data: { status: WorkOrderStatus.FINALIZADA, finishedAt: new Date() },
    });

    await tx.case.update({
      where: { id: wo.caseId },
      data: { status: CaseStatus.RESUELTO },
    });

    await tx.caseEvent.create({
      data: {
        caseId: wo.caseId,
        type: CaseEventType.STATUS_CHANGE,
        message: "OT finalizada",
        meta: { workOrderId: wo.id, by: userId },
      },
    });

    await tx.busLifecycleEvent.create({
      data: {
        busId: wo.case.busId,
        caseId: wo.caseId,
        workOrderId: wo.id,
        eventType: "WO_FINISHED",
        summary: "OT finalizada con evidencia",
      },
    });
  });

  await notifyTenantUsers({
    tenantId,
    roles: [Role.ADMIN, Role.BACKOFFICE],
    type: NotificationType.WO_FINISHED,
    title: "OT finalizada",
    body: `OT: ${wo.id} | Bus: ${wo.case.bus.code}`,
    meta: { workOrderId: wo.id, caseId: wo.caseId },
  });

  return NextResponse.json({ ok: true });
}
