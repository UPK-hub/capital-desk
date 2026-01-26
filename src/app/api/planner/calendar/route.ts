export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CalendarSlotKind, Role } from "@prisma/client";
import { z } from "zod";
import {
  addDaysBogota,
  bogotaDateTimeToUtc,
  buildShiftHourlySlots,
  getBogotaWeekStartParts,
  parseBogotaDateParts,
  toBogotaParts,
} from "@/lib/technician-schedule";

const saveSchema = z.object({
  technicianId: z.string().min(1),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slots: z.array(
    z.object({
      start: z.string(),
      end: z.string(),
      kind: z.nativeEnum(CalendarSlotKind),
      note: z.string().optional().nullable(),
    })
  ),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = (session.user as any).role as Role;
  if (role !== Role.ADMIN && role !== Role.PLANNER) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const technicianId = String(req.nextUrl.searchParams.get("technicianId") ?? "").trim();
  const weekStartParam = req.nextUrl.searchParams.get("weekStart") ?? "";

  const nowParts = toBogotaParts(new Date());
  const startParts = parseBogotaDateParts(weekStartParam) ?? getBogotaWeekStartParts(nowParts);
  const weekStartUtc = bogotaDateTimeToUtc(startParts, 0, 0);
  const weekEndUtc = bogotaDateTimeToUtc(addDaysBogota(startParts, 7), 0, 0);

  const technicians = await prisma.user.findMany({
    where: { tenantId, active: true, role: Role.TECHNICIAN },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, technicianSchedule: true },
  });

  const selectedTech = technicians.find((t) => t.id === technicianId) ?? technicians[0] ?? null;
  if (!selectedTech) {
    return NextResponse.json({
      weekStart: `${startParts.year}-${String(startParts.month).padStart(2, "0")}-${String(startParts.day).padStart(2, "0")}`,
      technicians: [],
      baseSlots: [],
      overrides: [],
    });
  }

  const calendar = await prisma.technicianWeekCalendar.findFirst({
    where: { tenantId, weekStart: weekStartUtc },
    select: { id: true },
  });

  const overrides = calendar
    ? await prisma.technicianWeekSlot.findMany({
        where: {
          calendarId: calendar.id,
          technicianId: selectedTech.id,
          startAt: { gte: weekStartUtc, lt: weekEndUtc },
        },
        select: { startAt: true, endAt: true, kind: true, note: true },
      })
    : [];

  const reservations = await prisma.workOrder.findMany({
    where: {
      assignedToId: selectedTech.id,
      scheduledAt: { not: null, lt: weekEndUtc },
      scheduledTo: { not: null, gt: weekStartUtc },
    },
    select: {
      id: true,
      scheduledAt: true,
      scheduledTo: true,
      workOrderNo: true,
      case: { select: { id: true, title: true } },
    },
  });

  const baseSlots =
    selectedTech.technicianSchedule
      ? buildShiftHourlySlots({
          shiftType: selectedTech.technicianSchedule.shiftType,
          restDay: selectedTech.technicianSchedule.restDay,
          startParts,
          days: 7,
          slotMinutes: 60,
        })
      : [];

  return NextResponse.json({
    weekStart: `${startParts.year}-${String(startParts.month).padStart(2, "0")}-${String(startParts.day).padStart(2, "0")}`,
    technicians: technicians.map((t) => ({ id: t.id, name: t.name, email: t.email })),
    selectedTechnicianId: selectedTech.id,
    baseSlots: baseSlots.map((s) => ({ start: s.startUtc.toISOString(), end: s.endUtc.toISOString() })),
    overrides: overrides.map((o) => ({
      start: o.startAt.toISOString(),
      end: o.endAt.toISOString(),
      kind: o.kind,
      note: o.note ?? null,
    })),
    reservations: reservations.map((r) => ({
      id: r.id,
      start: (r.scheduledAt as Date).toISOString(),
      end: (r.scheduledTo as Date).toISOString(),
      workOrderNo: r.workOrderNo ?? null,
      caseId: r.case?.id ?? null,
      caseTitle: r.case?.title ?? null,
    })),
  });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = (session.user as any).role as Role;
  if (role !== Role.ADMIN && role !== Role.PLANNER) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const actorId = (session.user as any).id as string;

  const body = await req.json().catch(() => ({}));
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validacion fallida", issues: parsed.error.issues }, { status: 400 });
  }

  const startParts = parseBogotaDateParts(parsed.data.weekStart);
  if (!startParts) return NextResponse.json({ error: "weekStart invalido" }, { status: 400 });

  const weekStartUtc = bogotaDateTimeToUtc(startParts, 0, 0);
  const weekEndUtc = bogotaDateTimeToUtc(addDaysBogota(startParts, 7), 0, 0);

  const tech = await prisma.user.findFirst({
    where: { id: parsed.data.technicianId, tenantId, active: true, role: Role.TECHNICIAN },
    select: { id: true },
  });
  if (!tech) return NextResponse.json({ error: "Tecnico invalido" }, { status: 404 });

  const slots = parsed.data.slots
    .map((s) => ({
      startAt: new Date(s.start),
      endAt: new Date(s.end),
      kind: s.kind,
      note: s.note ?? null,
    }))
    .filter((s) => !Number.isNaN(s.startAt.getTime()) && !Number.isNaN(s.endAt.getTime()));

  for (const slot of slots) {
    const diff = slot.endAt.getTime() - slot.startAt.getTime();
    if (diff !== 60 * 60 * 1000) {
      return NextResponse.json({ error: "Slots deben ser de 60 minutos" }, { status: 400 });
    }
    if (slot.startAt.getTime() < weekStartUtc.getTime() || slot.startAt.getTime() >= weekEndUtc.getTime()) {
      return NextResponse.json({ error: "Slot fuera de la semana" }, { status: 400 });
    }
  }

  const calendar = await prisma.technicianWeekCalendar.upsert({
    where: { tenantId_weekStart: { tenantId, weekStart: weekStartUtc } },
    create: { tenantId, weekStart: weekStartUtc, createdById: actorId },
    update: { createdById: actorId },
    select: { id: true },
  });

  await prisma.$transaction([
    prisma.technicianWeekSlot.deleteMany({
      where: { calendarId: calendar.id, technicianId: tech.id },
    }),
    ...(slots.length
      ? [
          prisma.technicianWeekSlot.createMany({
            data: slots.map((s) => ({
              calendarId: calendar.id,
              technicianId: tech.id,
              startAt: s.startAt,
              endAt: s.endAt,
              kind: s.kind,
              note: s.note ?? null,
            })),
          }),
        ]
      : []),
  ]);

  return NextResponse.json({ ok: true });
}
