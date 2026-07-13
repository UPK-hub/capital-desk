// src/app/api/work-orders/[id]/corrective-report/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateUploadsByPrefix, saveUpload } from "@/lib/uploads";
import {
  Prisma,
  Role,
  CaseEventType,
  NotificationType,
  ProcedureType,
  FailureType,
  DeviceLocation,
} from "@prisma/client";
import { notifyTenantUsers } from "@/lib/notifications";
import { findInventoryModelBySerial } from "@/lib/inventory-catalog";



function emptyToNull(v: any): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function normalizeSerialKey(v?: string | null) {
  return String(v ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function parseDateOrNull(v: any): Date | null {
  const s = String(v ?? "").trim();
  if (!s) return null;

  // Rechaza fechas fuera de un rango razonable (evita typos tipo año 0203 o 9999).
  const inRange = (d: Date) => {
    const y = d.getUTCFullYear();
    return y >= 2000 && y <= 2100;
  };

  // parse normal (ISO / RFC)
  const d1 = new Date(s);
  if (!Number.isNaN(d1.getTime())) return inRange(d1) ? d1 : null;

  // fallback dd/mm/yyyy (si llega así)
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);
    // Valida día/mes/año antes de construir la fecha (evita "99/99/9999").
    if (dd < 1 || dd > 31 || mm < 1 || mm > 12 || yyyy < 2000 || yyyy > 2100) return null;
    const d2 = new Date(Date.UTC(yyyy, mm - 1, dd));
    if (Number.isNaN(d2.getTime())) return null;
    // Detecta desbordes tipo 31/02 (JS lo convertiría a marzo).
    if (d2.getUTCDate() !== dd || d2.getUTCMonth() !== mm - 1) return null;
    return d2;
  }

  return null;
}

function toBool(v: any): boolean {
  if (v === null || v === undefined || v === "") return false;
  if (typeof v === "boolean") return v;
  const s = String(v).toLowerCase().trim();
  if (["true", "1", "on", "yes", "si", "sí"].includes(s)) return true;
  return false;
}

function cleanTemplateValue(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

function sanitizeTemplateData(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const keys = [
    "reportDateTime",
    "reportChannel",
    "reportedBy",
    "reportContact",
    "productionSp",
    "busType",
    "yardLocation",
    "routeService",
    "interventionDateTime",
    "interventionShift",
    "affectedSystem",
    "componentName",
    "symptomNovelty",
    "operationImpact",
    "briefDescription",
    "quickCheckResult",
    "nextActionResponsible",
    "requiresNightIntervention",
    "nightBusStatus",
    "quickChecklistSummary",
    "quickEvidenceSummary",
    "diagnosticStartAt",
    "diagnosticEndAt",
    "supportTechnician",
    "rootCause",
    "materialsUsed",
    "evidenceTicketRef",
    "evidenceBeforeAfter",
    "evidenceLogs",
    "evidenceOther",
    "evidenceBeforeAfterFile",
    "evidenceLogsFile",
    "evidenceOtherFile",
    "finalStatus",
    "closureDateTime",
    "clientConformity",
    "receiverNameRole",
    "closureNotes",
  ] as const;

  const out: Record<string, string> = {};
  for (const key of keys) {
    const value = cleanTemplateValue(input[key]);
    if (value) out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}

function formatInternalTime(d?: Date | null): string | null {
  if (!d) return null;
  return new Intl.DateTimeFormat("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Bogota",
  }).format(d);
}

// Acepta solo enums válidos. Si viene basura -> null
function parseEnumOrNull<T extends Record<string, string>>(enumObj: T, v: any): T[keyof T] | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const values = new Set(Object.values(enumObj));
  return values.has(s as any) ? (s as any) : null;
}

// Si envían "Other", forzamos enum OTRO
function normalizeEnumWithOther<T extends string>(
  enumValue: T | null,
  otherText: any,
  OTRO: T
): { value: T | null; other: string | null } {
  const other = emptyToNull(otherText);
  if (other) return { value: OTRO, other };
  return { value: enumValue, other: null };
}


export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;
  const role = (session.user as any).role as Role;

  const wo = await prisma.workOrder.findFirst({
    where: { id: ctx.params.id, tenantId },
    include: {
      case: { include: { bus: true, busEquipment: { include: { equipmentType: true } } } },
      correctiveReport: true,
    },
  });
  if (!wo) return NextResponse.json({ error: "OT no encontrada" }, { status: 404 });

  if (role !== Role.ADMIN && wo.assignedToId !== userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  return NextResponse.json({
    workOrderId: wo.id,
    workOrderNo: wo.workOrderNo,
    caseId: wo.caseId,
    bus: { code: wo.case.bus.code, plate: wo.case.bus.plate },
    equipment: wo.case.busEquipment
      ? {
          id: wo.case.busEquipment.id,
          type: wo.case.busEquipment.equipmentType.name,
          serial: wo.case.busEquipment.serial,
          location: wo.case.busEquipment.location,
          brand: wo.case.busEquipment.brand,
          model: wo.case.busEquipment.model,
        }
      : null,
    report: wo.correctiveReport,
  });
}

export async function PUT(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;
  const role = (session.user as any).role as Role;
  const isDraft = req.nextUrl.searchParams.get("draft") === "1";

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const photo = form.get("photo") as File | null;
    const photoKind = String(form.get("photoKind") ?? "").trim();
    if (!photo) return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
    if (
      ![
        "current",
        "new",
        "bodywork",
        "evidence_before_after",
        "evidence_logs",
        "evidence_other",
      ].includes(photoKind)
    ) {
      return NextResponse.json({ error: "photoKind inválido" }, { status: 400 });
    }

    const wo = await prisma.workOrder.findFirst({
      where: { id: ctx.params.id, tenantId },
      include: { correctiveReport: true, case: { select: { bus: { select: { code: true } } } } },
    });
    if (!wo) return NextResponse.json({ error: "OT no encontrada" }, { status: 404 });
    if (role !== Role.ADMIN && wo.assignedToId !== userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const relPath = await saveUpload(photo, `work-orders/${wo.id}/corrective-report`, {
      fileNamePrefix: wo.case.bus.code,
    });
    if (photoKind === "current" || photoKind === "new" || photoKind === "bodywork") {
      const photoField =
        photoKind === "current"
          ? "photoSerialCurrent"
          : photoKind === "new"
            ? "photoSerialNew"
            : "photoBodyworkDismount";
      const createData: any = {
        workOrderId: wo.id,
        [photoField]: relPath,
      };
      const updateData: any = { [photoField]: relPath };
      await prisma.correctiveReport.upsert({
        where: { workOrderId: wo.id },
        create: createData,
        update: updateData,
      });
    } else {
      const templateDataKey =
        photoKind === "evidence_before_after"
          ? "evidenceBeforeAfterFile"
          : photoKind === "evidence_logs"
            ? "evidenceLogsFile"
            : "evidenceOtherFile";
      const currentTemplateData =
        wo.correctiveReport?.templateData &&
        typeof wo.correctiveReport.templateData === "object" &&
        !Array.isArray(wo.correctiveReport.templateData)
          ? (wo.correctiveReport.templateData as Record<string, unknown>)
          : {};
      const mergedTemplateData = {
        ...currentTemplateData,
        [templateDataKey]: relPath,
      } as Prisma.InputJsonValue;
      await prisma.correctiveReport.upsert({
        where: { workOrderId: wo.id },
        create: { workOrderId: wo.id, templateData: mergedTemplateData },
        update: { templateData: mergedTemplateData },
      });
    }

    await invalidateUploadsByPrefix(`work-orders/${wo.id}/generated`);

    return NextResponse.json({ ok: true });
  }

  const body = await req.json().catch(() => ({}));

  const wo = await prisma.workOrder.findFirst({
    where: { id: ctx.params.id, tenantId },
    include: {
      case: { include: { bus: true, busEquipment: { include: { equipmentType: true } } } },
      correctiveReport: true,
    },
  });
  if (!wo) return NextResponse.json({ error: "OT no encontrada" }, { status: 404 });

  if (role !== Role.ADMIN && wo.assignedToId !== userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  // Autofill base
  const busCode = emptyToNull(body.busCode) ?? wo.case.bus.code;
  const plate = emptyToNull(body.plate) ?? wo.case.bus.plate ?? null;

  const equipmentTypeName = wo.case.busEquipment?.equipmentType?.name ?? null;
  const eqSerial = wo.case.busEquipment?.serial ?? null;

  // Enums
  const procedureTypeRaw = parseEnumOrNull(ProcedureType, body.procedureType);
  const failureTypeRaw = parseEnumOrNull(FailureType, body.failureType);
  const locationRaw = parseEnumOrNull(DeviceLocation, body.location);

  const { value: procedureType, other: procedureOther } = normalizeEnumWithOther(
    procedureTypeRaw,
    body.procedureOther,
    ProcedureType.OTRO
  );

  const { value: failureType, other: failureOther } = normalizeEnumWithOther(
    failureTypeRaw,
    body.failureOther,
    FailureType.OTRO
  );

  // Location: si hay locationOther => OTRO
  const locationOther = emptyToNull(body.locationOther);
  const location: DeviceLocation | null = locationOther ? DeviceLocation.OTRO : (locationRaw as any);
  const bodyworkDismountRequested = toBool(body.bodyworkDismountRequested);
  const bodyworkDismountNotes = bodyworkDismountRequested
    ? emptyToNull(body.bodyworkDismountNotes)
    : null;
  const templateData = sanitizeTemplateData(body.templateData);
  const templateDataInput = templateData ? (templateData as Prisma.InputJsonValue) : Prisma.JsonNull;
  if (!isDraft && bodyworkDismountRequested && !bodyworkDismountNotes) {
    return NextResponse.json(
      { error: "Debes describir el desmonte cuando hay solicitud de carrocería." },
      { status: 400 }
    );
  }

  // Aliases por si el front manda nombres distintos
  const diagnosisIn = body.diagnosisOther ?? body.diagnosis ?? body.diagnostic ?? body.diagnostico ?? body["diagnóstico"];
  const solutionIn = body.solutionOther ?? body.solution ?? body.solucion ?? body["solución"];

  const serialBase = emptyToNull(body.serial) ?? eqSerial;
  const serialNuevo = emptyToNull(body.newSerial);
  const inventoryModelBase = await findInventoryModelBySerial(tenantId, serialBase);
  const inventoryModelNew = await findInventoryModelBySerial(tenantId, serialNuevo);

  // IMPORTANTE: NO usar `satisfies` aquí (rompe por Decimal|Null en TS)
  const payload = {
    ticketNumber: emptyToNull(body.ticketNumber),
    workOrderNumber: emptyToNull(body.workOrderNumber),

    busCode,
    plate,
    deviceType: emptyToNull(body.deviceType) ?? equipmentTypeName,
    brand: emptyToNull(body.brand),
    model: emptyToNull(body.model) ?? inventoryModelBase,
    serial: serialBase,

    procedureType,
    procedureOther,

    location,
    locationOther: locationOther ?? null,

    dateDismount: parseDateOrNull(body.dateDismount),
    dateDelivered: parseDateOrNull(body.dateDelivered),

    bodyworkDismountRequested,
    bodyworkDismountNotes,

    accessoriesSupplied: toBool(body.accessoriesSupplied),
    accessoriesWhich: emptyToNull(body.accessoriesWhich),

    physicalState: emptyToNull(body.physicalState),
    diagnosis: emptyToNull(diagnosisIn),

    failureType,
    failureOther,

    solution: emptyToNull(solutionIn),
    manufacturerEta: emptyToNull(body.manufacturerEta),

    timeStart: formatInternalTime(wo.startedAt),
    timeEnd: formatInternalTime(wo.finishedAt),

    installDate: parseDateOrNull(body.installDate),
    newBrand: emptyToNull(body.newBrand),
    newModel: emptyToNull(body.newModel) ?? inventoryModelNew,
    newSerial: serialNuevo,
    templateData: templateDataInput,

  };

  const saved = await prisma.$transaction(async (tx) => {
    const report = await tx.correctiveReport.upsert({
      where: { workOrderId: wo.id },
      create: { workOrderId: wo.id, ...payload },
      update: payload,
    });

    if (!isDraft && payload.procedureType === ProcedureType.CAMBIO_COMPONENTE && wo.case.busEquipmentId) {
      const currentEquipment = await tx.busEquipment.findUnique({
        where: { id: wo.case.busEquipmentId },
        select: {
          id: true,
          serial: true,
          equipmentType: { select: { name: true } },
        },
      });

      await tx.busEquipment.update({
        where: { id: wo.case.busEquipmentId },
        data: {
          brand: payload.newBrand ?? undefined,
          model: payload.newModel ?? undefined,
          serial: payload.newSerial ?? undefined,
        },
      });

      if (
        currentEquipment &&
        payload.newSerial &&
        normalizeSerialKey(payload.newSerial) !== normalizeSerialKey(currentEquipment.serial)
      ) {
        await tx.busLifecycleEvent.create({
          data: {
            busId: wo.case.busId,
            busEquipmentId: currentEquipment.id,
            caseId: wo.caseId,
            workOrderId: wo.id,
            eventType: "SERIAL_CHANGED",
            summary: `${currentEquipment.equipmentType.name}: ${
              currentEquipment.serial ?? "Sin serial"
            } -> ${payload.newSerial}`,
          },
        });
      }
    }

    if (!isDraft) {
      await tx.caseEvent.create({
        data: {
          caseId: wo.caseId,
          type: CaseEventType.COMMENT,
          message: "Formato Correctivo guardado",
          meta: { workOrderId: wo.id, by: userId },
        },
      });
    }

    return report;
  });

  await invalidateUploadsByPrefix(`work-orders/${wo.id}/generated`);

  if (!isDraft) {
    await notifyTenantUsers({
      tenantId,
      roles: [Role.ADMIN, Role.BACKOFFICE],
      type: NotificationType.FORM_SAVED,
      title: "Formato Correctivo guardado",
      body: `OT-${String(wo.workOrderNo).padStart(3, "0")} | Bus: ${wo.case.bus.code}`,
      href: `/work-orders/${wo.id}`,
      meta: { workOrderId: wo.id, caseId: wo.caseId, form: "CORRECTIVE" },
    });
  }

  return NextResponse.json({ ok: true, draft: isDraft, report: saved });
}
