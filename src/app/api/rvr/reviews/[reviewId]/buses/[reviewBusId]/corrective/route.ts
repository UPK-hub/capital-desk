export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CaseEventType, CaseStatus, CaseType, Role, WorkOrderStatus } from "@prisma/client";
import { CAPABILITIES } from "@/lib/capabilities";
import { normalizeRvrChecklist } from "@/lib/rvr";
import { nextNumbers } from "@/lib/tenant-sequence";

function isRvrAllowed(role: Role, capabilities: string[] | undefined) {
  if (role === Role.ADMIN || role === Role.SUPERVISOR) return true;
  if (role === Role.BACKOFFICE) {
    return !capabilities?.includes(CAPABILITIES.VIDEOS_ONLY);
  }
  return false;
}

function formatReviewDate(value: Date) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeZone: "America/Bogota",
  }).format(value);
}

export async function POST(
  _req: Request,
  ctx: { params: { reviewId: string; reviewBusId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as Role;
  const capabilities = (session.user as any).capabilities as string[] | undefined;
  if (!isRvrAllowed(role, capabilities)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const actorId = (session.user as any).id as string;
  const reviewId = String(ctx.params.reviewId ?? "").trim();
  const reviewBusId = String(ctx.params.reviewBusId ?? "").trim();
  if (!reviewId || !reviewBusId) {
    return NextResponse.json({ error: "Parámetros inválidos." }, { status: 400 });
  }

  const reviewBus = await prisma.remoteVisualReviewBus.findFirst({
    where: {
      id: reviewBusId,
      reviewId,
      review: { tenantId },
    },
    include: {
      review: {
        select: {
          id: true,
          reviewDate: true,
          scheduleWindow: true,
        },
      },
      bus: {
        select: {
          id: true,
          code: true,
          plate: true,
          equipments: {
            where: { active: true },
            select: {
              id: true,
              equipmentType: { select: { name: true } },
              location: true,
            },
          },
        },
      },
    },
  });

  if (!reviewBus) {
    return NextResponse.json({ error: "Registro RVR por bus no encontrado." }, { status: 404 });
  }

  if (!reviewBus.requiresCorrective) {
    return NextResponse.json(
      { error: "Marca primero que el bus requiere correctivo para generar el caso." },
      { status: 400 }
    );
  }

  if (reviewBus.correctiveCaseId) {
    return NextResponse.json({
      ok: true,
      alreadyCreated: true,
      caseId: reviewBus.correctiveCaseId,
      caseNo: reviewBus.correctiveCaseNo,
      workOrderId: reviewBus.correctiveWorkOrderId,
      workOrderNo: reviewBus.correctiveWorkOrderNo,
      href: reviewBus.correctiveCaseId ? `/cases/${reviewBus.correctiveCaseId}` : null,
    });
  }

  const nvrEquipment = reviewBus.bus.equipments.find((equipment) => {
    const typeName = String(equipment.equipmentType?.name ?? "").toUpperCase();
    const location = String(equipment.location ?? "").toUpperCase();
    return typeName.includes("NVR") || location.includes("NVR");
  });

  const checklist = normalizeRvrChecklist(reviewBus.checklist);
  const failedRows = checklist.filter((row) => row.complies === "N");
  const failedCameras = failedRows.map((row) => row.camera);
  const failedCameraText = failedCameras.length
    ? failedCameras.join(", ")
    : "Sin detalle específico";
  const failedDetailLines = failedRows.map((row) => {
    const code = String(row.observationCode ?? "").trim().toUpperCase();
    const observation = String(row.observation ?? "").trim();
    if (code && observation) return `- ${row.camera} [${code}]: ${observation}`;
    if (code) return `- ${row.camera} [${code}]`;
    if (observation) return `- ${row.camera}: ${observation}`;
    return `- ${row.camera}`;
  });

  const findings = String(reviewBus.relevantFindings ?? "").trim();
  const ticketUpk = String(reviewBus.ticketUpk ?? "").trim();
  const descriptionLines = [
    `Correctivo generado desde Revisión Visual Remota (RVR) del ${formatReviewDate(reviewBus.review.reviewDate)}.`,
    `Bus: ${reviewBus.bus.code}${reviewBus.bus.plate ? ` (${reviewBus.bus.plate})` : ""}.`,
    `Cámaras con hallazgo: ${failedCameraText}.`,
    failedDetailLines.length ? "Detalle de observaciones RVR:" : null,
    ...failedDetailLines,
    findings ? `Hallazgos: ${findings}` : null,
    ticketUpk ? `Ticket UPK: ${ticketUpk}` : null,
  ].filter(Boolean);

  const created = await prisma.$transaction(async (tx) => {
    const numbers = await nextNumbers(tx as any, tenantId, { case: true, workOrder: true });
    if (!numbers.caseNo || !numbers.workOrderNo) {
      throw new Error("No fue posible reservar consecutivos para caso/OT.");
    }

    const createdCase = await tx.case.create({
      data: {
        tenantId,
        caseNo: numbers.caseNo,
        type: CaseType.CORRECTIVO,
        status: CaseStatus.OT_ASIGNADA,
        priority: 2,
        title: `Correctivo por RVR - ${reviewBus.bus.code}`,
        description: descriptionLines.join("\n"),
        busId: reviewBus.bus.id,
        busEquipmentId: nvrEquipment?.id ?? null,
      },
    });

    if (nvrEquipment?.id) {
      await tx.caseEquipment.create({
        data: {
          caseId: createdCase.id,
          busEquipmentId: nvrEquipment.id,
        },
      });
    }

    const workOrder = await tx.workOrder.create({
      data: {
        tenantId,
        workOrderNo: numbers.workOrderNo,
        caseId: createdCase.id,
        status: WorkOrderStatus.EN_VALIDACION,
      },
    });

    await tx.caseEvent.createMany({
      data: [
        {
          caseId: createdCase.id,
          type: CaseEventType.CREATED,
          message: "Caso correctivo generado desde revisión visual remota.",
          meta: {
            by: actorId,
            source: "RVR",
            reviewId: reviewBus.review.id,
            reviewBusId: reviewBus.id,
          },
        },
        {
          caseId: createdCase.id,
          type: CaseEventType.STATUS_CHANGE,
          message: "OT creada en estado por validar coordinador.",
          meta: { by: actorId, workOrderId: workOrder.id },
        },
      ],
    });

    await tx.remoteVisualReviewBus.update({
      where: { id: reviewBus.id },
      data: {
        correctiveCaseId: createdCase.id,
        correctiveCaseNo: createdCase.caseNo,
        correctiveWorkOrderId: workOrder.id,
        correctiveWorkOrderNo: workOrder.workOrderNo,
      },
    });

    return { createdCase, workOrder };
  });

  return NextResponse.json({
    ok: true,
    caseId: created.createdCase.id,
    caseNo: created.createdCase.caseNo,
    workOrderId: created.workOrder.id,
    workOrderNo: created.workOrder.workOrderNo,
    href: `/cases/${created.createdCase.id}`,
  });
}
