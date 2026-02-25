export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  CaseEventType,
  CaseStatus,
  CaseType,
  Role,
  StsTicketEventType,
  StsTicketSeverity,
  StsTicketStatus,
  WorkOrderStatus,
} from "@prisma/client";
import { CAPABILITIES } from "@/lib/capabilities";
import { buildCaseAccessWhere } from "@/lib/access-control";
import { saveUpload } from "@/lib/uploads";

type PriorityOption = "BAJA" | "MEDIA" | "ALTA";

type NovedadState = {
  batchRef?: string | null;
  sourceCaseNo?: number | null;
  catalogCode?: string | null;
  affectedEquipment?: string | null;
  priority?: PriorityOption | null;
  reportedNovelty?: string | null;
  reportedDescription?: string | null;
  observations?: string | null;
  evidence?: {
    filePath: string;
    fileName: string;
    mimeType?: string | null;
    size?: number | null;
  } | null;
};

function extractLatestNovedadState(events: Array<{ meta: unknown }>): NovedadState | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const meta = (events[i].meta ?? {}) as any;
    if (meta?.noveltyState && typeof meta.noveltyState === "object") {
      return meta.noveltyState as NovedadState;
    }
  }
  return null;
}

function normalizeText(input: unknown) {
  return String(input ?? "").trim();
}

function normalizeBool(input: unknown): boolean {
  if (typeof input === "boolean") return input;
  if (typeof input === "number") return input === 1;
  const value = String(input ?? "")
    .trim()
    .toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "si";
}

function normalizePriority(input: unknown): PriorityOption | null {
  const value = String(input ?? "")
    .trim()
    .toUpperCase();
  if (value === "ALTA" || value === "MEDIA" || value === "BAJA") return value as PriorityOption;
  return null;
}

function priorityToNumber(priority: PriorityOption): number {
  if (priority === "ALTA") return 2;
  if (priority === "BAJA") return 4;
  return 3;
}

function priorityToSeverity(priority: PriorityOption): StsTicketSeverity {
  if (priority === "ALTA") return StsTicketSeverity.HIGH;
  if (priority === "BAJA") return StsTicketSeverity.LOW;
  return StsTicketSeverity.MEDIUM;
}

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = (session.user as any).role as Role;
  const capabilities = (session.user as any).capabilities as string[] | undefined;
  const isVideosOnly =
    role === Role.BACKOFFICE && capabilities?.includes(CAPABILITIES.VIDEOS_ONLY);
  if (
    isVideosOnly ||
    role !== Role.ADMIN &&
    role !== Role.BACKOFFICE &&
    role !== Role.PLANNER &&
    role !== Role.SUPERVISOR
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;

  const found = await prisma.case.findFirst({
    where: buildCaseAccessWhere({
      caseId: String(ctx.params.id),
      tenantId,
      role,
      capabilities,
      userId,
    }),
    include: {
      bus: { select: { code: true } },
      events: { orderBy: { createdAt: "asc" }, select: { id: true, meta: true } },
    },
  });
  if (!found) return NextResponse.json({ error: "Caso no encontrado" }, { status: 404 });
  if (found.type !== CaseType.NOVEDAD && found.type !== CaseType.CORRECTIVO) {
    return NextResponse.json(
      { error: "Solo NOVEDAD/CORRECTIVO permiten edición de novedad." },
      { status: 400 }
    );
  }

  const contentType = req.headers.get("content-type") ?? "";
  let payload: any = {};
  let evidenceFile: File | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    payload = {
      catalogCode: form.get("catalogCode"),
      affectedEquipment: form.get("affectedEquipment"),
      priority: form.get("priority"),
      reportedNovelty: form.get("reportedNovelty"),
      observations: form.get("observations"),
      batchRef: form.get("batchRef"),
      activateCorrectiveOt: form.get("activateCorrectiveOt"),
    };
    const maybeFile = form.get("evidence");
    if (maybeFile instanceof File && maybeFile.size > 0) {
      evidenceFile = maybeFile;
    }
  } else {
    payload = await req.json().catch(() => ({}));
  }

  const previousState = extractLatestNovedadState(found.events);

  const hasAffectedEquipment = payload?.affectedEquipment !== undefined && payload?.affectedEquipment !== null;
  const hasPriority = payload?.priority !== undefined && payload?.priority !== null;
  const hasReportedNovelty = payload?.reportedNovelty !== undefined && payload?.reportedNovelty !== null;
  const hasObservations = payload?.observations !== undefined && payload?.observations !== null;

  const catalogCode = normalizeText(payload?.catalogCode);
  const affectedEquipment = hasAffectedEquipment
    ? normalizeText(payload?.affectedEquipment)
    : normalizeText(previousState?.affectedEquipment);
  const reportedNovelty = hasReportedNovelty
    ? normalizeText(payload?.reportedNovelty)
    : normalizeText(previousState?.reportedNovelty);
  const observations = hasObservations
    ? normalizeText(payload?.observations)
    : normalizeText(previousState?.observations);
  const priorityOption = hasPriority
    ? normalizePriority(payload?.priority)
    : normalizePriority(previousState?.priority ?? "");
  const nextPriorityNumber = priorityOption ? priorityToNumber(priorityOption) : found.priority;
  const forcedBatchRef = normalizeText(payload?.batchRef);
  const activateCorrectiveOt = normalizeBool(payload?.activateCorrectiveOt);

  if (affectedEquipment.length < 2) {
    return NextResponse.json({ error: "Equipo afectado inválido." }, { status: 400 });
  }
  if (reportedNovelty.length < 3) {
    return NextResponse.json({ error: "Novedad reportada inválida." }, { status: 400 });
  }

  const batchRef =
    forcedBatchRef ||
    previousState?.batchRef ||
    `NVD-${String(found.caseNo ?? 0).padStart(4, "0")}`;
  const sourceCaseNo = previousState?.sourceCaseNo ?? null;

  let evidence = previousState?.evidence ?? null;
  if (evidenceFile) {
    const filePath = await saveUpload(evidenceFile, `novedades/updates/${found.id}`, {
      fileNamePrefix: found.bus.code,
    });
    evidence = {
      filePath,
      fileName: evidenceFile.name || "evidencia",
      mimeType: evidenceFile.type || "application/octet-stream",
      size: evidenceFile.size,
    };
  }

  const nextState: NovedadState = {
    batchRef,
    sourceCaseNo,
    catalogCode: catalogCode || previousState?.catalogCode || null,
    affectedEquipment,
    priority: priorityOption || null,
    reportedNovelty,
    observations: observations || null,
    evidence,
  };

  const nextTitle =
    found.type === CaseType.NOVEDAD
      ? `Novedad ${found.bus.code} - ${reportedNovelty}`
      : sourceCaseNo
      ? `Correctivo generado por novedad CASO-${sourceCaseNo} (${found.bus.code})`
      : `Correctivo generado por novedad (${found.bus.code})`;

  const nextDescription = [
    catalogCode || previousState?.catalogCode
      ? `Código novedad: ${catalogCode || previousState?.catalogCode}`
      : null,
    `Equipo afectado: ${affectedEquipment}`,
    priorityOption ? `Prioridad: ${priorityOption}` : null,
    `Novedad reportada: ${reportedNovelty}`,
    observations ? `Observaciones: ${observations}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  let activatedCorrectiveCaseId: string | null = null;
  let activatedWorkOrderId: string | null = null;

  try {
    await prisma.$transaction(async (tx) => {
    await tx.case.update({
      where: { id: found.id },
      data: { title: nextTitle, description: nextDescription, priority: nextPriorityNumber },
    });

    const updatedTicket = await tx.stsTicket.updateMany({
      where: { tenantId, caseId: found.id },
      data: {
        description: nextDescription,
        ...(priorityOption ? { severity: priorityToSeverity(priorityOption) } : {}),
      },
    });

    await tx.caseEvent.create({
      data: {
        caseId: found.id,
        type: CaseEventType.COMMENT,
        message: "Novedad editada. Cambios registrados en trazabilidad.",
        meta: {
          editedBy: userId,
          noveltyState: nextState,
          noveltyStateBefore: previousState,
          noveltyStateAfter: nextState,
        },
      },
    });

    if (updatedTicket.count > 0) {
      await tx.caseEvent.create({
        data: {
          caseId: found.id,
          type: CaseEventType.COMMENT,
          message: "Descripción del ticket STS sincronizada con la novedad editada.",
          meta: { editedBy: userId, batchRef },
        },
      });
    }

    if (evidenceFile) {
      await tx.caseEvent.create({
        data: {
          caseId: found.id,
          type: CaseEventType.COMMENT,
          message: "Nueva evidencia de novedad cargada.",
          meta: { editedBy: userId, batchRef, evidence },
        },
      });
    }

    if (activateCorrectiveOt) {
      const corrective =
        found.type === CaseType.CORRECTIVO
          ? await tx.case.findFirst({
              where: { id: found.id, tenantId, type: CaseType.CORRECTIVO },
              include: { workOrder: true, stsTicket: true },
            })
          : await tx.case.findFirst({
              where: {
                tenantId,
                type: CaseType.CORRECTIVO,
                events: {
                  some: {
                    meta: { path: ["sourceCaseId"], equals: found.id },
                  },
                },
              },
              orderBy: { createdAt: "desc" },
              include: { workOrder: true, stsTicket: true },
            });

      if (!corrective?.workOrder) {
        throw new Error("No hay un correctivo asociado para activar OT.");
      }

      if (corrective.workOrder.status === WorkOrderStatus.FINALIZADA) {
        throw new Error("La OT correctiva ya está finalizada.");
      }

      const nextWoStatus =
        corrective.workOrder.status === WorkOrderStatus.EN_VALIDACION
          ? WorkOrderStatus.CREADA
          : corrective.workOrder.status;

      await tx.workOrder.update({
        where: { id: corrective.workOrder.id },
        data: { status: nextWoStatus },
      });

      await tx.case.update({
        where: { id: corrective.id },
        data: {
          ...(priorityOption ? { priority: nextPriorityNumber } : {}),
          status:
            corrective.status === CaseStatus.CERRADO || corrective.status === CaseStatus.RESUELTO
              ? corrective.status
              : CaseStatus.OT_ASIGNADA,
        },
      });

      if (corrective.stsTicket && corrective.stsTicket.status === StsTicketStatus.OPEN) {
        await tx.stsTicket.update({
          where: { id: corrective.stsTicket.id },
          data: {
            status: StsTicketStatus.IN_PROGRESS,
            firstResponseAt: corrective.stsTicket.firstResponseAt ?? new Date(),
            ...(priorityOption ? { severity: priorityToSeverity(priorityOption) } : {}),
          },
        });
        await tx.stsTicketEvent.create({
          data: {
            ticketId: corrective.stsTicket.id,
            type: StsTicketEventType.STATUS_CHANGE,
            status: StsTicketStatus.IN_PROGRESS,
            message: "Ticket activado automáticamente desde reclasificación de novedad.",
            meta: { by: userId, sourceCaseId: found.id, batchRef },
            createdById: userId,
          },
        });
      } else if (corrective.stsTicket && priorityOption) {
        await tx.stsTicket.update({
          where: { id: corrective.stsTicket.id },
          data: { severity: priorityToSeverity(priorityOption) },
        });
      }

      await tx.caseEvent.create({
        data: {
          caseId: corrective.id,
          type: CaseEventType.STATUS_CHANGE,
          message: "OT correctiva activada desde reclasificación de novedad.",
          meta: {
            by: userId,
            sourceCaseId: found.id,
            sourceCaseNo: found.caseNo,
            batchRef,
            activatedCorrectiveOt: true,
            workOrderId: corrective.workOrder.id,
          },
        },
      });

      if (corrective.id !== found.id) {
        await tx.caseEvent.create({
          data: {
            caseId: found.id,
            type: CaseEventType.COMMENT,
            message: "Se activó la OT correctiva asociada a esta novedad.",
            meta: {
              by: userId,
              batchRef,
              correctiveCaseId: corrective.id,
              workOrderId: corrective.workOrder.id,
            },
          },
        });
      }

      activatedCorrectiveCaseId = corrective.id;
      activatedWorkOrderId = corrective.workOrder.id;
    }
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "No se pudo actualizar la novedad." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    caseId: found.id,
    batchRef,
    noveltyState: nextState,
    activatedCorrectiveCaseId,
    activatedWorkOrderId,
  });
}
