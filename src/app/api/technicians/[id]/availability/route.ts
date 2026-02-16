export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CalendarSlotKind, Role } from "@prisma/client";
import { CAPABILITIES } from "@/lib/capabilities";
import {
  addDaysBogota,
  bogotaDateTimeToUtc,
  buildShiftHourlySlots,
  formatSlotLabel,
  getBogotaWeekStartParts,
  overlaps,
  ShiftSlot,
  toBogotaParts,
} from "@/lib/technician-schedule";

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = (session.user as any).role as Role;
  const caps = (session.user as any).capabilities as string[] | undefined;
  if (role !== Role.ADMIN && role !== Role.PLANNER && !caps?.includes(CAPABILITIES.PLANNER)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const technicianId = String(ctx.params.id ?? "").trim();
  const requestedDays = Number(req.nextUrl.searchParams.get("days") ?? "14");
  const days = Number.isFinite(requestedDays) ? Math.min(Math.max(Math.trunc(requestedDays), 1), 30) : 14;

  const tech = await prisma.user.findFirst({
    where: { id: technicianId, tenantId, active: true, role: Role.TECHNICIAN },
    select: { id: true, technicianSchedule: true },
  });
  if (!tech) return NextResponse.json({ error: "Tecnico invalido" }, { status: 404 });

  const now = new Date();
  const startParts = toBogotaParts(now);
  const rangeStart = bogotaDateTimeToUtc(startParts, 0, 0);
  const rangeEnd = bogotaDateTimeToUtc(addDaysBogota(startParts, days), 0, 0);

  const baseSlots = tech.technicianSchedule
    ? buildShiftHourlySlots({
        shiftType: tech.technicianSchedule.shiftType,
        restDay: tech.technicianSchedule.restDay,
        startParts,
        days,
        slotMinutes: 60,
      }).filter((s) => s.endUtc.getTime() > now.getTime())
    : [];

  const startWeek = getBogotaWeekStartParts(startParts);
  const endWeek = getBogotaWeekStartParts(addDaysBogota(startParts, days));
  const startWeekUtc = bogotaDateTimeToUtc(startWeek, 0, 0);
  const endWeekUtc = bogotaDateTimeToUtc(endWeek, 0, 0);

  const overrides = await prisma.technicianWeekSlot.findMany({
    where: {
      technicianId: tech.id,
      calendar: {
        tenantId,
        weekStart: { gte: startWeekUtc, lte: endWeekUtc },
      },
      startAt: { gte: rangeStart, lt: rangeEnd },
    },
    select: { startAt: true, endAt: true, kind: true },
  });

  const overrideMap = new Map<string, { slot: ShiftSlot; kind: CalendarSlotKind }>();
  for (const o of overrides) {
    if (!o.startAt || !o.endAt) continue;
    overrideMap.set(o.startAt.toISOString(), {
      slot: { startUtc: o.startAt as Date, endUtc: o.endAt as Date },
      kind: o.kind,
    });
  }

  const baseMap = new Map<string, ShiftSlot>();
  for (const slot of baseSlots) {
    baseMap.set(slot.startUtc.toISOString(), slot);
  }

  const available: ShiftSlot[] = [];
  for (const slot of baseSlots) {
    const key = slot.startUtc.toISOString();
    const override = overrideMap.get(key);
    if (override?.kind === CalendarSlotKind.BLOCKED || override?.kind === CalendarSlotKind.TIME_OFF) continue;
    available.push(slot);
  }

  for (const [key, value] of overrideMap) {
    if (value.kind !== CalendarSlotKind.AVAILABLE) continue;
    if (!baseMap.has(key)) {
      available.push(value.slot);
    }
  }

  if (available.length === 0) return NextResponse.json({ slots: [] });

  const reserved = await prisma.workOrder.findMany({
    where: {
      assignedToId: tech.id,
      scheduledAt: { not: null, lt: rangeEnd },
      scheduledTo: { not: null, gt: rangeStart },
    },
    select: { scheduledAt: true, scheduledTo: true },
  });

  const reservedSlots: ShiftSlot[] = reserved
    .filter((r) => r.scheduledAt && r.scheduledTo)
    .map((r) => ({ startUtc: r.scheduledAt as Date, endUtc: r.scheduledTo as Date }));

  const free = available.filter((slot) => !reservedSlots.some((r) => overlaps(slot, r)));
  free.sort((a, b) => a.startUtc.getTime() - b.startUtc.getTime());

  return NextResponse.json({
    slots: free.map((slot) => ({
      start: slot.startUtc.toISOString(),
      end: slot.endUtc.toISOString(),
      label: formatSlotLabel(slot.startUtc, slot.endUtc),
    })),
  });
}
