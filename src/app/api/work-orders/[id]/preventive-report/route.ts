// src/app/api/work-orders/[id]/preventive-report/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveUpload } from "@/lib/uploads";
import { Role, NotificationType, CaseEventType } from "@prisma/client";
import { z } from "zod";
import { notifyTenantUsers } from "@/lib/notifications";



// Guardado tipo borrador (ticket no obligatorio aquí)
const schema = z.object({
  ticketNumber: z.string().trim().optional().nullable(),
  workOrderNumber: z.string().trim().optional().nullable(),

  biarticuladoNo: z.string().trim().optional().nullable(),
  mileage: z.string().trim().optional().nullable(),
  plate: z.string().trim().optional().nullable(),

  scheduledAt: z.string().optional().nullable(),
  executedAt: z.string().optional().nullable(),
  rescheduledAt: z.string().optional().nullable(),

  // devicesInstalled eliminado
  activities: z.any().optional().nullable(),

  observations: z.string().trim().optional().nullable(),
  responsibleUpk: z.string().trim().optional().nullable(),
  responsibleCapitalBus: z.string().trim().optional().nullable(),
});

const toDate = (s?: string | null) => {
  const v = String(s ?? "").trim();
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const emptyToNull = (v?: string | null) => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};

function normalizePhotoPaths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((x) => String(x ?? "").trim()).filter(Boolean);
}

function normalizeActivityKey(row: any, idx: number): string {
  const key = String(row?.key ?? "").trim();
  if (key) return key;
  const label = String(row?.activity ?? "")
    .trim()
    .toLowerCase();
  if (label.includes("video inicio") || label.includes("video final")) return "nvr_video_inicio_final";
  if (label.includes("batch")) return "nvr_batch_foto";
  if (label.includes("wifi")) return "nvr_wifi_foto";
  if (label.includes("lte") || label.includes("4g") || label.includes("5g")) return "nvr_lte_foto";
  if (label.includes("tapa")) return "nvr_tapa_foto";
  if (label.includes("playback")) return "nvr_playback_foto";
  if (label.includes("conteo") && label.includes("grab")) return "nvr_conteo_dias_grabacion";
  if (label.includes("capacidad") && label.includes("disco")) return "nvr_capacidad_discos_foto";
  if (label.includes("configur")) return "nvr_config";
  if (label.includes("ping")) return "nvr_ping";
  if (label.includes("foto vms")) return "nvr_foto_vms";
  if (label.includes("habitaculo")) return "nvr_foto_habitaculo";
  if (label.includes("canbus") || label.includes("data")) return "nvr_data_canbus";
  if (label.includes("voltaje bater")) return "bateria_voltaje";
  return `actividad_${idx + 1}`;
}

function normalizeActivities(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((row, idx) => {
    const r = (row ?? {}) as any;
    return {
      ...r,
      key: normalizeActivityKey(r, idx),
      photoRequired: Boolean(r?.photoRequired),
      photoPaths: normalizePhotoPaths(r?.photoPaths),
      valueRequired: Boolean(r?.valueRequired),
    };
  });
}

const formatInternalTime = (d?: Date | null) => {
  if (!d) return null;
  return new Intl.DateTimeFormat("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Bogota",
  }).format(d);
};

const allowedGet: Role[] = [Role.ADMIN, Role.TECHNICIAN, Role.BACKOFFICE];
const allowedPut: Role[] = [Role.ADMIN, Role.TECHNICIAN];

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as Role;
  if (!allowedGet.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;

  const wo = await prisma.workOrder.findFirst({
    where: { id: params.id, tenantId },
    include: {
      preventiveReport: true,
      case: {
        include: {
          bus: true,
          busEquipment: { include: { equipmentType: true } },
          caseEquipments: { include: { busEquipment: { include: { equipmentType: true } } } },
        },
      },
    },
  });
  if (!wo) return NextResponse.json({ error: "WorkOrder not found" }, { status: 404 });
  if (wo.case.type !== "PREVENTIVO") return NextResponse.json({ error: "No es PREVENTIVO" }, { status: 400 });

  const equipmentLabel = wo.case.busEquipment
    ? `${wo.case.busEquipment.equipmentType.name}${wo.case.busEquipment.serial ? ` • ${wo.case.busEquipment.serial}` : ""}${
        wo.case.busEquipment.location ? ` • ${wo.case.busEquipment.location}` : ""
      }`
    : "";

  const selectedEquipments =
    wo.case.caseEquipments?.length > 0
      ? wo.case.caseEquipments.map((it) => it.busEquipment)
      : wo.case.busEquipment
        ? [wo.case.busEquipment]
        : [];

  return NextResponse.json({
    report: wo.preventiveReport,
    autofill: {
      biarticuladoNo: wo.case.bus.code,
      plate: wo.case.bus.plate ?? null,
      scheduledAt: wo.preventiveReport?.scheduledAt ?? wo.scheduledAt ?? null,
      rescheduledAt: wo.preventiveReport?.rescheduledAt ?? null,
      equipmentLabel,
      equipments: selectedEquipments.map((eq) => ({
        id: eq.id,
        type: eq.equipmentType.name,
        serial: eq.serial ?? null,
        location: eq.location ?? null,
      })),
    },
  });
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as Role;
  if (!allowedPut.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;

  const wo = await prisma.workOrder.findFirst({
    where: { id: params.id, tenantId },
    include: { case: { include: { bus: true } }, preventiveReport: true },
  });
  if (!wo) return NextResponse.json({ error: "WorkOrder not found" }, { status: 404 });
  if (wo.case.type !== "PREVENTIVO") return NextResponse.json({ error: "No es PREVENTIVO" }, { status: 400 });

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const photo = form.get("photo") as File | null;
    const activityKey = String(form.get("activityKey") ?? "").trim();
    if (!photo) return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
    if (!activityKey) return NextResponse.json({ error: "activityKey requerido" }, { status: 400 });

    const relPath = await saveUpload(photo, `work-orders/${wo.id}/preventive-report/${activityKey}`);
    const currentActivities = normalizeActivities(wo.preventiveReport?.activities);
    const idx = currentActivities.findIndex((x) => String(x?.key ?? "") === activityKey);
    if (idx < 0) {
      return NextResponse.json({ error: "No se encontró la actividad para asociar foto" }, { status: 400 });
    }
    const row = currentActivities[idx];
    const nextPaths = normalizePhotoPaths(row?.photoPaths);
    nextPaths.push(relPath);
    currentActivities[idx] = { ...row, photoPaths: nextPaths };

    const report = await prisma.preventiveReport.upsert({
      where: { workOrderId: wo.id },
      create: {
        workOrderId: wo.id,
        activities: currentActivities,
        timeStart: formatInternalTime(wo.startedAt),
        timeEnd: formatInternalTime(wo.finishedAt),
      },
      update: {
        activities: currentActivities,
        timeStart: formatInternalTime(wo.startedAt),
        timeEnd: formatInternalTime(wo.finishedAt),
      },
    });

    return NextResponse.json({ ok: true, report });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validación fallida",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 }
    );
  }

  const v = parsed.data;

  // Autollenado “sistema”
  const biarticuladoNo = emptyToNull(v.biarticuladoNo) ?? wo.case.bus.code;
  const plate = emptyToNull(v.plate) ?? wo.case.bus.plate ?? null;

  const normalized = {
    ticketNumber: emptyToNull(v.ticketNumber),
    workOrderNumber: emptyToNull(v.workOrderNumber),

    biarticuladoNo,
    mileage: emptyToNull(v.mileage),
    plate,

    scheduledAt: toDate(v.scheduledAt),
    executedAt: toDate(v.executedAt),
    rescheduledAt: toDate(v.rescheduledAt),

    // devicesInstalled eliminado
    activities: normalizeActivities(v.activities),

    observations: emptyToNull(v.observations),
    timeStart: formatInternalTime(wo.startedAt),
    timeEnd: formatInternalTime(wo.finishedAt),
    responsibleUpk: emptyToNull((v as any).responsibleUpk),
    responsibleCapitalBus: emptyToNull(v.responsibleCapitalBus),
  };

  const report = await prisma.preventiveReport.upsert({
    where: { workOrderId: wo.id },
    create: { workOrderId: wo.id, ...normalized },
    update: normalized,
  });

  await prisma.caseEvent.create({
    data: {
      caseId: wo.caseId,
      type: CaseEventType.COMMENT,
      message: "Formato PREVENTIVO guardado.",
      meta: { workOrderId: wo.id },
    },
  });

  await notifyTenantUsers({
    tenantId,
    roles: [Role.ADMIN, Role.BACKOFFICE],
    type: NotificationType.FORM_SAVED,
    title: "Formato preventivo guardado",
    body: `OT-${String(wo.workOrderNo).padStart(3, "0")} · Bus ${wo.case.bus.code}`,
    href: `/work-orders/${wo.id}`,
    meta: { workOrderId: wo.id, caseId: wo.caseId, kind: "PREVENTIVE" },
  });

  return NextResponse.json({ ok: true, report });
}
