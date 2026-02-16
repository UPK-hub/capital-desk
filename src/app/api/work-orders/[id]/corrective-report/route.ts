// src/app/api/work-orders/[id]/corrective-report/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveUpload } from "@/lib/uploads";
import {
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

function parseDateOrNull(v: any): Date | null {
  const s = String(v ?? "").trim();
  if (!s) return null;

  // parse normal (ISO / RFC)
  const d1 = new Date(s);
  if (!Number.isNaN(d1.getTime())) return d1;

  // fallback dd/mm/yyyy (si llega así)
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);
    const d2 = new Date(Date.UTC(yyyy, mm - 1, dd));
    return Number.isNaN(d2.getTime()) ? null : d2;
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
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;
  const role = (session.user as any).role as Role;

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const photo = form.get("photo") as File | null;
    const photoKind = String(form.get("photoKind") ?? "").trim();
    if (!photo) return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
    if (!["current", "new"].includes(photoKind)) {
      return NextResponse.json({ error: "photoKind inválido" }, { status: 400 });
    }

    const wo = await prisma.workOrder.findFirst({
      where: { id: ctx.params.id, tenantId },
      include: { correctiveReport: true },
    });
    if (!wo) return NextResponse.json({ error: "OT no encontrada" }, { status: 404 });
    if (role !== Role.ADMIN && wo.assignedToId !== userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const relPath = await saveUpload(photo, `work-orders/${wo.id}/corrective-report`);
    await prisma.correctiveReport.upsert({
      where: { workOrderId: wo.id },
      create: {
        workOrderId: wo.id,
        ...(photoKind === "current" ? { photoSerialCurrent: relPath } : { photoSerialNew: relPath }),
      },
      update: photoKind === "current" ? { photoSerialCurrent: relPath } : { photoSerialNew: relPath },
    });

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

  };

  const saved = await prisma.$transaction(async (tx) => {
    const report = await tx.correctiveReport.upsert({
      where: { workOrderId: wo.id },
      create: { workOrderId: wo.id, ...payload },
      update: payload,
    });

    if (payload.procedureType === ProcedureType.CAMBIO_COMPONENTE && wo.case.busEquipmentId) {
      await tx.busEquipment.update({
        where: { id: wo.case.busEquipmentId },
        data: {
          brand: payload.newBrand ?? undefined,
          model: payload.newModel ?? undefined,
          serial: payload.newSerial ?? undefined,
        },
      });
    }

    await tx.caseEvent.create({
      data: {
        caseId: wo.caseId,
        type: CaseEventType.COMMENT,
        message: "Formato Correctivo guardado",
        meta: { workOrderId: wo.id, by: userId },
      },
    });

    return report;
  });

  await notifyTenantUsers({
    tenantId,
    roles: [Role.ADMIN, Role.BACKOFFICE],
    type: NotificationType.FORM_SAVED,
    title: "Formato Correctivo guardado",
    body: `OT-${String(wo.workOrderNo).padStart(3, "0")} | Bus: ${wo.case.bus.code}`,
    href: `/work-orders/${wo.id}`,
    meta: { workOrderId: wo.id, caseId: wo.caseId, form: "CORRECTIVE" },
  });

  return NextResponse.json({ ok: true, report: saved });
}
