// src/app/api/work-orders/[id]/preventive-report/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, NotificationType, CaseEventType } from "@prisma/client";
import { z } from "zod";
import { notifyTenantUsers } from "@/lib/notifications";



// Guardado tipo borrador (ticket no obligatorio aquí)
const schema = z.object({
  ticketNumber: z.string().trim().optional().nullable(),
  workOrderNumber: z.string().trim().optional().nullable(),

  biarticuladoNo: z.string().trim().optional().nullable(),
  productionSp: z.string().trim().optional().nullable(),
  mileage: z.string().trim().optional().nullable(),
  plate: z.string().trim().optional().nullable(),

  scheduledAt: z.string().optional().nullable(),
  executedAt: z.string().optional().nullable(),
  rescheduledAt: z.string().optional().nullable(),

  devicesInstalled: z.any().optional().nullable(),
  activities: z.any().optional().nullable(),

  voltageNvrFromCard: z.string().trim().optional().nullable(),
  voltageCollectorFromCard: z.string().trim().optional().nullable(),
  voltageBatteriesMasterOff: z.string().trim().optional().nullable(),
  voltageCardMasterOn: z.string().trim().optional().nullable(),
  voltageCardMasterOff: z.string().trim().optional().nullable(),
  voltageSwitch: z.string().trim().optional().nullable(),
  voltageCardBusOpen: z.string().trim().optional().nullable(),
  commCableState: z.string().trim().optional().nullable(),

  observations: z.string().trim().optional().nullable(),
  timeStart: z.string().trim().optional().nullable(),
  timeEnd: z.string().trim().optional().nullable(),
  responsibleSkg: z.string().trim().optional().nullable(),
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

  // IMPORTANTE: incluye case.bus para usarlo abajo (en notificación)
  const wo = await prisma.workOrder.findFirst({
    where: { id: params.id, tenantId },
    include: { case: { include: { bus: true } } },
  });
  if (!wo) return NextResponse.json({ error: "WorkOrder not found" }, { status: 404 });
  if (wo.case.type !== "PREVENTIVO") return NextResponse.json({ error: "No es PREVENTIVO" }, { status: 400 });

  const v = parsed.data;

  // Autollenado “sistema”
  const biarticuladoNo = emptyToNull(v.biarticuladoNo) ?? wo.case.bus.code;
  const plate = emptyToNull(v.plate) ?? wo.case.bus.plate ?? null;

  const normalized = {
    ticketNumber: emptyToNull(v.ticketNumber),
    workOrderNumber: emptyToNull(v.workOrderNumber),

    biarticuladoNo,
    productionSp: emptyToNull(v.productionSp),
    mileage: emptyToNull(v.mileage),
    plate,

    scheduledAt: toDate(v.scheduledAt),
    executedAt: toDate(v.executedAt),
    rescheduledAt: toDate(v.rescheduledAt),

    devicesInstalled: v.devicesInstalled ?? null,
    activities: v.activities ?? null,

    voltageNvrFromCard: emptyToNull(v.voltageNvrFromCard),
    voltageCollectorFromCard: emptyToNull(v.voltageCollectorFromCard),
    voltageBatteriesMasterOff: emptyToNull(v.voltageBatteriesMasterOff),
    voltageCardMasterOn: emptyToNull(v.voltageCardMasterOn),
    voltageCardMasterOff: emptyToNull(v.voltageCardMasterOff),
    voltageSwitch: emptyToNull(v.voltageSwitch),
    voltageCardBusOpen: emptyToNull(v.voltageCardBusOpen),
    commCableState: emptyToNull(v.commCableState),

    observations: emptyToNull(v.observations),
    timeStart: emptyToNull(v.timeStart),
    timeEnd: emptyToNull(v.timeEnd),
    responsibleSkg: emptyToNull(v.responsibleSkg),
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
