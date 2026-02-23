export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveUpload } from "@/lib/uploads";
import { CaseEventType, CaseStatus, CaseType, MediaKind, NotificationType, Role, WorkOrderStatus } from "@prisma/client";
import { notifyTenantUsers } from "@/lib/notifications";


type QuickVerificationChecklistItem = {
  id: string;
  label: string;
  done: boolean;
};

type QuickVerificationEvidenceItem = {
  key: string;
  label: string;
  required: boolean;
};

type QuickVerificationPayload = {
  result: "CONFIRMADA" | "DESCARTADA" | "REQUIERE_REVISION";
  notes: string;
  suggestedAction?: string | null;
  catalogCode?: string | null;
  affectedEquipment?: string | null;
  reportedNovelty?: string | null;
  checklist: QuickVerificationChecklistItem[];
  evidenceItems: QuickVerificationEvidenceItem[];
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function extractLatestNovedadState(events: Array<{ meta: unknown }>) {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const state = (events[i].meta as any)?.noveltyState;
    if (state && typeof state === "object") {
      return {
        catalogCode: normalizeText(state.catalogCode),
        affectedEquipment: normalizeText(state.affectedEquipment),
        reportedNovelty: normalizeText(state.reportedNovelty),
      };
    }
  }
  return null;
}

function extractSourceCaseId(events: Array<{ meta: unknown }>) {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const sourceCaseId = normalizeText((events[i].meta as any)?.sourceCaseId);
    if (sourceCaseId) return sourceCaseId;
  }
  return null;
}

function parseQuickVerification(raw: string): QuickVerificationPayload | null {
  if (!raw.trim()) return null;
  let parsed: any = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const result = normalizeText(parsed?.result) as QuickVerificationPayload["result"];
  const notes = normalizeText(parsed?.notes);
  const suggestedAction = normalizeText(parsed?.suggestedAction);
  const catalogCode = normalizeText(parsed?.catalogCode);
  const affectedEquipment = normalizeText(parsed?.affectedEquipment);
  const reportedNovelty = normalizeText(parsed?.reportedNovelty);
  const checklistRaw = Array.isArray(parsed?.checklist) ? parsed.checklist : [];
  const evidenceItemsRaw = Array.isArray(parsed?.evidenceItems) ? parsed.evidenceItems : [];

  if (!["CONFIRMADA", "DESCARTADA", "REQUIERE_REVISION"].includes(result)) return null;
  if (notes.length < 5) return null;

  const checklist: QuickVerificationChecklistItem[] = [];
  for (let i = 0; i < checklistRaw.length; i += 1) {
    const item = checklistRaw[i];
    const label = normalizeText(item?.label);
    if (!label) continue;
    const id = normalizeText(item?.id) || `step-${i + 1}`;
    checklist.push({
      id,
      label,
      done: Boolean(item?.done),
    });
  }

  const evidenceItems: QuickVerificationEvidenceItem[] = [];
  for (let i = 0; i < evidenceItemsRaw.length; i += 1) {
    const item = evidenceItemsRaw[i];
    const label = normalizeText(item?.label);
    if (!label) continue;
    const key = normalizeText(item?.key) || `evidence-${i + 1}`;
    evidenceItems.push({
      key,
      label,
      required: Boolean(item?.required),
    });
  }

  return {
    result,
    notes,
    suggestedAction: suggestedAction || null,
    catalogCode: catalogCode || null,
    affectedEquipment: affectedEquipment || null,
    reportedNovelty: reportedNovelty || null,
    checklist,
    evidenceItems,
  };
}


export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;
  const role = (session.user as any).role as Role;

  const form = await req.formData();
  const notes = String(form.get("notes") ?? "").trim();
  const file = form.get("photo") as File | null;
  const quickVerificationRaw = normalizeText(form.get("quickVerification"));
  const quickVerification = parseQuickVerification(quickVerificationRaw);
  const quickEvidenceFiles = new Map<string, File>();
  for (const [field, value] of form.entries()) {
    if (!field.startsWith("quickEvidence:")) continue;
    if (!(value instanceof File) || value.size <= 0) continue;
    const key = normalizeText(field.slice("quickEvidence:".length));
    if (!key) continue;
    quickEvidenceFiles.set(key, value);
  }

  if (!notes) return NextResponse.json({ error: "La nota de inicio es requerida" }, { status: 400 });
  if (!file) return NextResponse.json({ error: "La foto de inicio es requerida" }, { status: 400 });

  const wo = await prisma.workOrder.findFirst({
    where: { id: ctx.params.id, tenantId },
    include: {
      case: {
        include: {
          bus: true,
          events: { orderBy: { createdAt: "asc" }, select: { meta: true }, take: 120 },
        },
      },
    },
  });
  if (!wo) return NextResponse.json({ error: "OT no encontrada" }, { status: 404 });

  // FIX: autorización correcta según schema
  if (role !== Role.ADMIN && wo.assignedToId !== userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const noveltyState =
    wo.case.type === CaseType.CORRECTIVO ? extractLatestNovedadState(wo.case.events) : null;
  const requiresQuickVerification = Boolean(
    wo.case.type === CaseType.CORRECTIVO && noveltyState
  );
  const sourceNovedadCaseId =
    wo.case.type === CaseType.CORRECTIVO ? extractSourceCaseId(wo.case.events) : null;

  if (quickVerificationRaw && !quickVerification) {
    return NextResponse.json(
      { error: "El pre-formulario de verificación rápida es inválido." },
      { status: 400 }
    );
  }

  if (quickVerification && quickVerification.checklist.some((item) => !item.done)) {
    return NextResponse.json(
      {
        error:
          "Debes completar todos los pasos del pre-formulario de verificación rápida.",
      },
      { status: 400 }
    );
  }

  if (quickVerification) {
    const missingEvidence = quickVerification.evidenceItems.filter(
      (item) => item.required && !quickEvidenceFiles.has(item.key)
    );
    if (missingEvidence.length > 0) {
      return NextResponse.json(
        {
          error:
            "Falta evidencia obligatoria del pre-formulario de verificación rápida.",
          missingEvidence: missingEvidence.map((item) => item.label),
        },
        { status: 400 }
      );
    }
  }

  const sourceNovedadCase = sourceNovedadCaseId
    ? await prisma.case.findFirst({
        where: { id: sourceNovedadCaseId, tenantId, type: CaseType.NOVEDAD },
        select: { id: true, caseNo: true },
      })
    : null;

  const relPath = await saveUpload(file, `work-orders/${wo.id}/start`);
  const quickEvidence = [] as Array<{
    key: string;
    label: string;
    required: boolean;
    filePath: string;
    fileName: string;
    mimeType: string;
    size: number;
  }>;
  if (quickVerification) {
    for (const item of quickVerification.evidenceItems) {
      const evidenceFile = quickEvidenceFiles.get(item.key);
      if (!evidenceFile) continue;
      const evidencePath = await saveUpload(
        evidenceFile,
        `work-orders/${wo.id}/start/quick-verification`
      );
      quickEvidence.push({
        key: item.key,
        label: item.label,
        required: item.required,
        filePath: evidencePath,
        fileName: evidenceFile.name || "evidencia",
        mimeType: evidenceFile.type || "application/octet-stream",
        size: evidenceFile.size,
      });
    }
  }

  await prisma.$transaction(async (tx) => {
    if (quickVerification) {
      const checklistSummary =
        quickVerification.checklist.length > 0
          ? [
              "Checklist:",
              ...quickVerification.checklist.map(
                (item) => `- [${item.done ? "x" : " "}] ${item.label}`
              ),
            ].join("\n")
          : null;
      const evidenceSummary =
        quickVerification.evidenceItems.length > 0
          ? [
              "Evidencias:",
              ...quickVerification.evidenceItems.map((item) => {
                const matched = quickEvidence.find((entry) => entry.key === item.key);
                if (!matched) return `- ${item.label}: ${item.required ? "FALTA" : "No adjunta"}`;
                return `- ${item.label}: ${matched.fileName}`;
              }),
            ].join("\n")
          : null;

      const quickSummary = [
        `Resultado: ${quickVerification.result}`,
        `Observaciones: ${quickVerification.notes}`,
        quickVerification.suggestedAction
          ? `Accion sugerida: ${quickVerification.suggestedAction}`
          : null,
        quickVerification.catalogCode ? `Codigo catalogo: ${quickVerification.catalogCode}` : null,
        quickVerification.affectedEquipment
          ? `Equipo afectado: ${quickVerification.affectedEquipment}`
          : null,
        quickVerification.reportedNovelty
          ? `Novedad reportada: ${quickVerification.reportedNovelty}`
          : null,
        checklistSummary,
        evidenceSummary,
      ]
        .filter(Boolean)
        .join("\n");

      await tx.workOrderStep.create({
        data: { workOrderId: wo.id, stepType: "VERIFICACION_RAPIDA", notes: quickSummary },
      });
    }

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
        meta: {
          workOrderId: wo.id,
          by: userId,
          quickVerification: quickVerification
            ? {
                ...quickVerification,
                required: requiresQuickVerification,
                evidence: quickEvidence,
              }
            : null,
        },
      },
    });

    if (quickVerification && sourceNovedadCase) {
      await tx.caseEvent.create({
        data: {
          caseId: sourceNovedadCase.id,
          type: CaseEventType.COMMENT,
          message: "Verificación rápida ejecutada en OT correctiva asociada.",
          meta: {
            by: userId,
            sourceCaseId: sourceNovedadCase.id,
            sourceCaseNo: sourceNovedadCase.caseNo,
            correctiveCaseId: wo.caseId,
            workOrderId: wo.id,
            quickVerification: {
              ...quickVerification,
              required: requiresQuickVerification,
              evidence: quickEvidence,
            },
          },
        },
      });
    }

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
