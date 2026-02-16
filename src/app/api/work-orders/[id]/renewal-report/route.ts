export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveUpload } from "@/lib/uploads";
import { CaseEventType, NotificationType, Role } from "@prisma/client";
import { notifyTenantUsers } from "@/lib/notifications";
import { findInventoryModelBySerial } from "@/lib/inventory-catalog";
import { z } from "zod";

const schema = z.object({
  ticketNumber: z.string().trim().optional().nullable(),
  workOrderNumber: z.string().trim().optional().nullable(),
  busCode: z.string().trim().optional().nullable(),
  plate: z.string().trim().optional().nullable(),
  linkSmartHelios: z.string().trim().optional().nullable(),
  ipSimcard: z.string().trim().optional().nullable(),

  removedChecklist: z.any().optional().nullable(),
  newInstallation: z.any().optional().nullable(),
  finalChecklist: z.any().optional().nullable(),

  observations: z.string().trim().optional().nullable(),
});

const allowedGet: Role[] = [Role.ADMIN, Role.BACKOFFICE, Role.TECHNICIAN];
const allowedPut: Role[] = [Role.ADMIN, Role.TECHNICIAN];

function emptyToNull(v?: string | null) {
  const s = String(v ?? "").trim();
  return s ? s : null;
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

type PhotoBucket = "old" | "new" | "checklist";

function isRenewalLikeCase(type: string) {
  return type === "RENOVACION_TECNOLOGICA" || type === "MEJORA_PRODUCTO";
}

function normalizeStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map((x) => String(x ?? "").trim()).filter(Boolean);
}

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const role = (session.user as any).role as Role;
  if (!allowedGet.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const wo = await prisma.workOrder.findFirst({
    where: { id: ctx.params.id, tenantId },
    include: {
      renewalTechReport: true,
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
  if (!isRenewalLikeCase(wo.case.type)) {
    return NextResponse.json({ error: "No aplica para este tipo de caso" }, { status: 400 });
  }

  const busEquipments =
    wo.case.type === "RENOVACION_TECNOLOGICA"
      ? await prisma.busEquipment.findMany({
          where: { busId: wo.case.busId, active: true },
          orderBy: [{ equipmentType: { name: "asc" } }, { id: "asc" }],
          select: {
            id: true,
            ipAddress: true,
            brand: true,
            model: true,
            serial: true,
            equipmentType: { select: { name: true } },
          },
        })
      : (() => {
          const selected = wo.case.caseEquipments?.length
            ? wo.case.caseEquipments.map((c) => c.busEquipment)
            : wo.case.busEquipment
            ? [wo.case.busEquipment]
            : [];
          return selected.map((eq) => ({
            id: eq.id,
            ipAddress: eq.ipAddress ?? null,
            brand: eq.brand ?? null,
            model: eq.model ?? null,
            serial: eq.serial ?? null,
            equipmentType: { name: eq.equipmentType?.name ?? "" },
          }));
        })();

  const selected = wo.case.caseEquipments?.length
    ? wo.case.caseEquipments.map((c) => c.busEquipment)
    : wo.case.busEquipment
      ? [wo.case.busEquipment]
      : [];

  return NextResponse.json({
    report: wo.renewalTechReport,
    autofill: {
      busCode: wo.case.bus.code,
      plate: wo.case.bus.plate ?? null,
      linkSmartHelios: wo.case.bus.linkSmartHelios ?? null,
      ipSimcard: wo.case.bus.ipSimcard ?? null,
      caseType: wo.case.type,
      selectedEquipments: selected.map((eq) => ({
        id: eq.id,
        type: eq.equipmentType.name,
        serial: eq.serial ?? null,
      })),
      busEquipments,
    },
  });
}

export async function PUT(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;
  const role = (session.user as any).role as Role;
  if (!allowedPut.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const wo = await prisma.workOrder.findFirst({
    where: { id: ctx.params.id, tenantId },
    include: {
      case: { include: { bus: true } },
      renewalTechReport: true,
    },
  });
  if (!wo) return NextResponse.json({ error: "WorkOrder not found" }, { status: 404 });
  if (!isRenewalLikeCase(wo.case.type)) {
    return NextResponse.json({ error: "No aplica para este tipo de caso" }, { status: 400 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const photo = form.get("photo") as File | null;
    const bucket = String(form.get("bucket") ?? "").trim() as PhotoBucket;
    const busEquipmentId = String(form.get("busEquipmentId") ?? "").trim();
    if (!photo) return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
    if (!["old", "new", "checklist"].includes(bucket)) {
      return NextResponse.json({ error: "Bucket inválido" }, { status: 400 });
    }

    const relPath = await saveUpload(photo, `work-orders/${wo.id}/renewal-report/${bucket}`);
    const curr = (wo.renewalTechReport ?? null) as any;
    const currentOld = normalizeStringArray(curr?.photosOld);
    const currentNew = normalizeStringArray(curr?.photosNew);
    const currentChecklist = normalizeStringArray(curr?.photosChecklist);

    if (bucket === "old") currentOld.push(relPath);
    if (bucket === "new") currentNew.push(relPath);
    if (bucket === "checklist") currentChecklist.push(relPath);

    const currentInstallation =
      curr?.newInstallation && typeof curr.newInstallation === "object"
        ? { ...(curr.newInstallation as Record<string, any>) }
        : {};
    const currentUpdates = Array.isArray(currentInstallation.equipmentUpdates)
      ? [...currentInstallation.equipmentUpdates]
      : [];

    if ((bucket === "old" || bucket === "new") && busEquipmentId) {
      const idx = currentUpdates.findIndex(
        (x: any) => String(x?.busEquipmentId ?? "") === busEquipmentId
      );
      const baseRow =
        idx >= 0
          ? { ...currentUpdates[idx] }
          : { busEquipmentId, type: "", oldSerial: "", newSerial: "", ipAddress: "", brand: "", model: "" };
      const oldPhotos = normalizeStringArray(baseRow.photoSerialOld);
      const newPhotos = normalizeStringArray(baseRow.photoSerialNew);
      if (bucket === "old") oldPhotos.push(relPath);
      if (bucket === "new") newPhotos.push(relPath);
      baseRow.photoSerialOld = oldPhotos;
      baseRow.photoSerialNew = newPhotos;
      if (idx >= 0) currentUpdates[idx] = baseRow;
      else currentUpdates.push(baseRow);
      currentInstallation.equipmentUpdates = currentUpdates;
    }

    const report = await prisma.renewalTechReport.upsert({
      where: { workOrderId: wo.id },
      create: {
        workOrderId: wo.id,
        photosOld: currentOld,
        photosNew: currentNew,
        photosChecklist: currentChecklist,
        newInstallation: currentInstallation,
      },
      update: {
        photosOld: currentOld,
        photosNew: currentNew,
        photosChecklist: currentChecklist,
        newInstallation: currentInstallation,
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

  const updatesFromBody = Array.isArray((v.newInstallation as any)?.equipmentUpdates)
    ? ((v.newInstallation as any).equipmentUpdates as any[])
    : [];

  const enrichedEquipmentUpdates: any[] = [];
  for (const row of updatesFromBody) {
    const serial = emptyToNull(row?.newSerial ?? row?.serial);
    const model = emptyToNull(row?.model) ?? (await findInventoryModelBySerial(tenantId, serial));
    enrichedEquipmentUpdates.push({
      ...row,
      model: model ?? row?.model ?? "",
    });
  }

  const normalizedInstallation: any =
    v.newInstallation && typeof v.newInstallation === "object"
      ? {
          ...(v.newInstallation as Record<string, any>),
          equipmentUpdates: enrichedEquipmentUpdates,
        }
      : null;

  const normalized: any = {
    ticketNumber: emptyToNull(v.ticketNumber),
    workOrderNumber: emptyToNull(v.workOrderNumber),
    busCode: emptyToNull(v.busCode) ?? wo.case.bus.code,
    plate: emptyToNull(v.plate) ?? wo.case.bus.plate ?? null,
    linkSmartHelios: emptyToNull(v.linkSmartHelios),
    ipSimcard: emptyToNull(v.ipSimcard),

    removedChecklist: v.removedChecklist ?? null,
    newInstallation: normalizedInstallation,
    finalChecklist: v.finalChecklist ?? null,
    timeStart: formatInternalTime(wo.startedAt),
    timeEnd: formatInternalTime(wo.finishedAt),
    observations: emptyToNull(v.observations),
  };

  const report = await prisma.$transaction(async (tx) => {
    const saved = await tx.renewalTechReport.upsert({
      where: { workOrderId: wo.id },
      create: { workOrderId: wo.id, ...normalized },
      update: normalized,
    });

    await tx.bus.update({
      where: { id: wo.case.busId },
      data: {
        linkSmartHelios: normalized.linkSmartHelios ?? undefined,
        ipSimcard: normalized.ipSimcard ?? undefined,
      },
    });

    const updates = enrichedEquipmentUpdates;

    for (const row of updates) {
      const busEquipmentId = String(row?.busEquipmentId ?? "").trim();
      if (!busEquipmentId) continue;
      const serial = emptyToNull(row?.newSerial ?? row?.serial);
      const model = emptyToNull(row?.model) ?? (await findInventoryModelBySerial(tenantId, serial));
      await tx.busEquipment.updateMany({
        where: { id: busEquipmentId, bus: { tenantId, id: wo.case.busId } },
        data: {
          ipAddress: emptyToNull(row?.ipAddress) ?? undefined,
          brand: emptyToNull(row?.brand) ?? undefined,
          model: model ?? undefined,
          serial: serial ?? undefined,
        },
      });
    }

    await tx.caseEvent.create({
      data: {
        caseId: wo.caseId,
        type: CaseEventType.COMMENT,
        message: "Formato RENOVACION TECNOLOGICA guardado.",
        meta: { workOrderId: wo.id, by: userId },
      },
    });

    return saved;
  });

  await notifyTenantUsers({
    tenantId,
    roles: [Role.ADMIN, Role.BACKOFFICE],
    type: NotificationType.FORM_SAVED,
    title: "Formato renovación tecnológica guardado",
    body: `OT-${String(wo.workOrderNo).padStart(3, "0")} · Bus ${wo.case.bus.code}`,
    href: `/work-orders/${wo.id}`,
    meta: { workOrderId: wo.id, caseId: wo.caseId, kind: "RENEWAL" },
  });

  return NextResponse.json({ ok: true, report });
}
