// src/app/api/cases/[id]/assign/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CalendarSlotKind, CaseEventType, CaseStatus, NotificationType, Role, WorkOrderStatus } from "@prisma/client";
import { CAPABILITIES } from "@/lib/capabilities";
import { notifyTenantUsers } from "@/lib/notifications";
import { nextNumbers } from "@/lib/tenant-sequence";
import { fmtWorkOrderNo, fmtCaseNo } from "@/lib/format-no";
import { CASE_TYPE_REGISTRY } from "@/lib/case-type-registry";
import {
  addDaysBogota,
  bogotaDateTimeToUtc,
  buildShiftHourlySlots,
  getBogotaWeekStartParts,
  overlaps,
  toBogotaParts,
} from "@/lib/technician-schedule";

function short(s: string | null | undefined, max = 260) {
  const x = String(s ?? "").trim();
  if (!x) return "";
  return x.length > max ? `${x.slice(0, max)}…` : x;
}

function toBogotaDayKey(value: Date | null | undefined) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function fmtBogotaDateTime(value: Date | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(value);
}

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = (session.user as any).role as Role;
  const caps = (session.user as any).capabilities as string[] | undefined;
  if (role !== Role.ADMIN && role !== Role.PLANNER && !caps?.includes(CAPABILITIES.CASE_ASSIGN)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const actorUserId = (session.user as any).id as string;
  const caseId = String(ctx.params.id);

  const body = await req.json().catch(() => ({}));
  const technicianId = String(body.technicianId ?? "").trim();
  if (!technicianId) return NextResponse.json({ error: "technicianId requerido" }, { status: 400 });
  const wantsReprogram =
    body.reprogram === true ||
    body.reprogram === "true" ||
    body.reprogram === 1 ||
    body.reprogram === "1";
  const reprogramReason = short(String(body.reprogramReason ?? ""), 280) || null;
  const scheduledAtRaw = String(body.scheduledAt ?? "").trim();
  const scheduledToRaw = String(body.scheduledTo ?? "").trim();
  if (!scheduledAtRaw || !scheduledToRaw) {
    return NextResponse.json({ error: "Horario requerido" }, { status: 400 });
  }
  const scheduledAt = new Date(scheduledAtRaw);
  const scheduledTo = new Date(scheduledToRaw);
  if (Number.isNaN(scheduledAt.getTime()) || Number.isNaN(scheduledTo.getTime())) {
    return NextResponse.json({ error: "Horario invalido" }, { status: 400 });
  }
  if (scheduledAt.getTime() >= scheduledTo.getTime()) {
    return NextResponse.json({ error: "Rango de horario invalido" }, { status: 400 });
  }
  if (scheduledTo.getTime() - scheduledAt.getTime() !== 60 * 60 * 1000) {
    return NextResponse.json({ error: "El horario debe ser de 60 minutos" }, { status: 400 });
  }

  const tech = await prisma.user.findFirst({
    where: { id: technicianId, tenantId, active: true, role: Role.TECHNICIAN },
    select: { id: true, name: true, email: true },
  });
  if (!tech) return NextResponse.json({ error: "Técnico inválido" }, { status: 400 });

  const schedule = await prisma.technicianSchedule.findFirst({
    where: { userId: tech.id, tenantId },
    select: { shiftType: true, restDay: true },
  });

  const c = await prisma.case.findFirst({
    where: { id: caseId, tenantId },
    include: { bus: true, workOrder: true, stsTicket: true },
  });
  if (!c) return NextResponse.json({ error: "Caso no encontrado" }, { status: 404 });
  const cfg = CASE_TYPE_REGISTRY[c.type];
  if (!cfg?.requiresWorkOrder) {
    return NextResponse.json({ error: "Este caso no requiere OT" }, { status: 400 });
  }

  const assignment = await prisma.$transaction(async (tx) => {
    const workOrder =
      c.workOrder ??
      (await (async () => {
        const nums = await nextNumbers(tx as any, tenantId, { workOrder: true });
        return tx.workOrder.create({
          data: {
            tenantId,
            workOrderNo: nums.workOrderNo!, // requerido
            caseId: c.id,
            status: WorkOrderStatus.CREADA,
          },
        });
      })());
    const previousScheduledAt = workOrder.scheduledAt;
    const previousDayKey = toBogotaDayKey(previousScheduledAt);
    const targetDayKey = toBogotaDayKey(scheduledAt);
    const isPreventive = c.type === "PREVENTIVO";
    const reprogrammed = isPreventive && Boolean(previousDayKey) && previousDayKey !== targetDayKey;

    if (reprogrammed && !wantsReprogram) {
      throw new Error("Esta OT preventiva ya tiene fecha programada. Activa 'Reprogramar' para cambiarla.");
    }

    const weekParts = getBogotaWeekStartParts(toBogotaParts(scheduledAt));
    const weekStartUtc = bogotaDateTimeToUtc(weekParts, 0, 0);
    const weekEndUtc = bogotaDateTimeToUtc(addDaysBogota(weekParts, 7), 0, 0);

    const baseSlots = schedule
      ? buildShiftHourlySlots({
          shiftType: schedule.shiftType,
          restDay: schedule.restDay,
          startParts: weekParts,
          days: 7,
          slotMinutes: 60,
        })
      : [];

    const overrides = await tx.technicianWeekSlot.findMany({
      where: {
        technicianId: tech.id,
        calendar: { tenantId, weekStart: weekStartUtc },
        startAt: { gte: weekStartUtc, lt: weekEndUtc },
      },
      select: { startAt: true, endAt: true, kind: true },
    });

    const requestedSlot = { startUtc: scheduledAt, endUtc: scheduledTo };
    const override = overrides.find(
      (o) =>
        o.startAt?.getTime() === scheduledAt.getTime() &&
        o.endAt?.getTime() === scheduledTo.getTime()
    );

    if (override?.kind === CalendarSlotKind.BLOCKED || override?.kind === CalendarSlotKind.TIME_OFF) {
      throw new Error("El horario seleccionado esta bloqueado");
    }

    const baseAllowed = baseSlots.some(
      (slot) =>
        slot.startUtc.getTime() === requestedSlot.startUtc.getTime() &&
        slot.endUtc.getTime() === requestedSlot.endUtc.getTime()
    );

    if (!baseAllowed && override?.kind !== CalendarSlotKind.AVAILABLE) {
      throw new Error("El horario no coincide con el calendario del tecnico");
    }

    const conflicts = await tx.workOrder.findMany({
      where: {
        assignedToId: tech.id,
        scheduledAt: { not: null, lt: scheduledTo },
        scheduledTo: { not: null, gt: scheduledAt },
        NOT: { id: workOrder.id },
      },
      select: { scheduledAt: true, scheduledTo: true },
      take: 1,
    });
    if (
      conflicts.some(
        (c) =>
          c.scheduledAt &&
          c.scheduledTo &&
          overlaps(requestedSlot, { startUtc: c.scheduledAt as Date, endUtc: c.scheduledTo as Date })
      )
    ) {
      throw new Error("El horario seleccionado ya esta reservado");
    }

    const updated = await tx.workOrder.update({
      where: { id: workOrder.id },
      data: {
        assignedToId: tech.id,
        assignedAt: new Date(),
        status: WorkOrderStatus.ASIGNADA,
        scheduledAt,
        scheduledTo,
      },
    });

    if (!c.stsTicket) {
      await tx.case.update({ where: { id: c.id }, data: { status: CaseStatus.OT_ASIGNADA } });
    }

    await tx.caseEvent.create({
      data: {
        caseId: c.id,
        type: CaseEventType.ASSIGNED,
        message: `Asignado a técnico: ${tech.name ?? tech.id}`,
        meta: { technicianId: tech.id, workOrderId: updated.id, by: actorUserId, scheduledAt, scheduledTo },
      },
    });

    if (reprogrammed) {
      const existingReport = await tx.preventiveReport.findUnique({
        where: { workOrderId: updated.id },
        select: { scheduledAt: true },
      });
      const baseProgrammedAt = existingReport?.scheduledAt ?? previousScheduledAt ?? scheduledAt;

      if (existingReport) {
        await tx.preventiveReport.update({
          where: { workOrderId: updated.id },
          data: {
            scheduledAt: baseProgrammedAt,
            rescheduledAt: scheduledAt,
          },
        });
      } else {
        await tx.preventiveReport.create({
          data: {
            workOrderId: updated.id,
            scheduledAt: baseProgrammedAt,
            rescheduledAt: scheduledAt,
          },
        });
      }

      await tx.caseEvent.create({
        data: {
          caseId: c.id,
          type: CaseEventType.COMMENT,
          message: `Fecha programada reprogramada: ${fmtBogotaDateTime(previousScheduledAt)} → ${fmtBogotaDateTime(scheduledAt)}`,
          meta: {
            workOrderId: updated.id,
            by: actorUserId,
            previousScheduledAt: previousScheduledAt?.toISOString() ?? null,
            newScheduledAt: scheduledAt.toISOString(),
            reason: reprogramReason,
          },
        },
      });
    }

    await tx.busLifecycleEvent.create({
      data: {
        busId: c.busId,
        busEquipmentId: null,
        caseId: c.id,
        workOrderId: updated.id,
        eventType: "WO_ASSIGNED",
        summary: "OT asignada a técnico",
        occurredAt: new Date(),
      },
    });

    return {
      workOrder: updated,
      reprogrammed,
      previousScheduledAt,
    };
  });
  const wo = assignment.workOrder;

  // ========= NOTIFICACIÓN INTERNA + EMAIL (vía notifyTenantUsers) =========

  const caseNo = fmtCaseNo(c.caseNo ?? null);
  const workOrderNo = fmtWorkOrderNo(wo.workOrderNo ?? null);

  const busLabel = `${c.bus.code}${c.bus.plate ? ` (${c.bus.plate})` : ""}`;

  // Título del correo (y campana)
  const title = `Caso asignado: ${caseNo} · ${c.type}`;

  // Cuerpo multilinea (se verá perfecto si en buildEmail usas white-space:pre-line)
  const bodyLines = [
    `Caso: ${caseNo}`,
    `Tipo: ${c.type}`,
    `Título: ${c.title}`,
    `Bus: ${busLabel}`,
    `Prioridad: ${c.priority}`,
    `OT: ${workOrderNo}`,
    `Horario: ${fmtBogotaDateTime(scheduledAt)} - ${fmtBogotaDateTime(scheduledTo)}`,
  ];

  const desc = short(c.description, 300);
  if (desc) bodyLines.push(`Descripción: ${desc}`);

  const bodyText = bodyLines.join("\n");

  await notifyTenantUsers({
    tenantId,
    userIds: [tech.id],
    type: NotificationType.CASE_ASSIGNED,
    title,
    body: bodyText,
    href: `/work-orders/${wo.id}`,
    meta: {
      caseId: c.id,
      workOrderId: wo.id,
      technicianId: tech.id,
      by: actorUserId,

      // útil para debug / trazabilidad
      caseNo: c.caseNo ?? null,
      workOrderNo: wo.workOrderNo ?? null,
      caseType: c.type,
      busCode: c.bus.code,
      plate: c.bus.plate ?? null,
      priority: c.priority,
    },
    sendEmail: true,
  });

  if (assignment.reprogrammed) {
    const reproTitle = `Preventivo reprogramado: ${caseNo}`;
    const reproLines = [
      `Caso: ${caseNo}`,
      `OT: ${workOrderNo}`,
      `Bus: ${busLabel}`,
      `Fecha anterior: ${fmtBogotaDateTime(assignment.previousScheduledAt)}`,
      `Nueva fecha: ${fmtBogotaDateTime(scheduledAt)}`,
      `Técnico: ${tech.name ?? tech.id}`,
    ];
    if (reprogramReason) reproLines.push(`Motivo: ${reprogramReason}`);
    const reproBody = reproLines.join("\n");
    const reprogramMeta = {
      caseId: c.id,
      workOrderId: wo.id,
      technicianId: tech.id,
      by: actorUserId,
      previousScheduledAt: assignment.previousScheduledAt?.toISOString() ?? null,
      newScheduledAt: scheduledAt.toISOString(),
      newScheduledTo: scheduledTo.toISOString(),
      reason: reprogramReason,
    };

    await notifyTenantUsers({
      tenantId,
      roles: [Role.ADMIN, Role.BACKOFFICE, Role.PLANNER],
      type: NotificationType.CASE_ASSIGNED,
      title: reproTitle,
      body: reproBody,
      href: `/cases/${c.id}`,
      meta: reprogramMeta,
      sendEmail: false,
    });

    await notifyTenantUsers({
      tenantId,
      userIds: [tech.id],
      type: NotificationType.CASE_ASSIGNED,
      title: reproTitle,
      body: reproBody,
      href: `/work-orders/${wo.id}`,
      meta: reprogramMeta,
      sendEmail: false,
    });
  }

  return NextResponse.json({ ok: true, workOrderId: wo.id, reprogrammed: assignment.reprogrammed });
}
