import { TechnicianRestDay, TechnicianShiftType } from "@prisma/client";

export const BOGOTA_TZ = "America/Bogota";
const BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1000;

export type DateParts = { year: number; month: number; day: number };

export function toBogotaParts(date: Date): DateParts {
  const shifted = new Date(date.getTime() + BOGOTA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

export function addDaysBogota(parts: DateParts, days: number): DateParts {
  const utc = Date.UTC(parts.year, parts.month - 1, parts.day + days, 0, 0, 0, 0);
  const d = new Date(utc);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function bogotaDateTimeToUtc(parts: DateParts, hour: number, minute: number) {
  const utcMs = Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute, 0, 0) - BOGOTA_OFFSET_MS;
  return new Date(utcMs);
}

export function dayOfWeekBogota(parts: DateParts) {
  const utc = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0);
  return new Date(utc).getUTCDay(); // 0=Sunday..6=Saturday
}

function isRestDay(parts: DateParts, restDay: TechnicianRestDay) {
  if (restDay === TechnicianRestDay.NONE) return false;
  const dow = dayOfWeekBogota(parts);
  if (restDay === TechnicianRestDay.MONDAY) return dow === 1;
  if (restDay === TechnicianRestDay.TUESDAY) return dow === 2;
  if (restDay === TechnicianRestDay.WEDNESDAY) return dow === 3;
  if (restDay === TechnicianRestDay.THURSDAY) return dow === 4;
  if (restDay === TechnicianRestDay.FRIDAY) return dow === 5;
  if (restDay === TechnicianRestDay.SATURDAY) return dow === 6;
  return restDay === TechnicianRestDay.SUNDAY && dow === 0;
}

function shiftWindow(shiftType: TechnicianShiftType) {
  if (shiftType === TechnicianShiftType.DIURNO_AM) {
    return { startHour: 4, startMin: 0, endHour: 12, endMin: 0, crossesMidnight: false };
  }
  if (shiftType === TechnicianShiftType.DIURNO_PM) {
    return { startHour: 14, startMin: 0, endHour: 18, endMin: 0, crossesMidnight: false };
  }
  return { startHour: 21, startMin: 0, endHour: 5, endMin: 0, crossesMidnight: true };
}

export function shiftDurationMinutes(shiftType: TechnicianShiftType) {
  const window = shiftWindow(shiftType);
  const start = window.startHour * 60 + window.startMin;
  const end = window.endHour * 60 + window.endMin;
  return window.crossesMidnight ? 24 * 60 - start + end : Math.max(0, end - start);
}

export type ShiftSlot = { startUtc: Date; endUtc: Date };

export function parseBogotaDateParts(input: string): DateParts | null {
  const m = String(input ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  return { year, month, day };
}

export function getBogotaWeekStartParts(parts: DateParts) {
  const dow = dayOfWeekBogota(parts);
  const daysSinceMonday = (dow + 6) % 7;
  return addDaysBogota(parts, -daysSinceMonday);
}

export function buildShiftSlots(params: {
  shiftType: TechnicianShiftType;
  restDay: TechnicianRestDay;
  days: number;
  nowUtc?: Date;
}) {
  const now = params.nowUtc ?? new Date();
  const startParts = toBogotaParts(now);
  const slots: ShiftSlot[] = [];
  const window = shiftWindow(params.shiftType);

  for (let i = 0; i < params.days; i += 1) {
    const dayParts = addDaysBogota(startParts, i);
    if (isRestDay(dayParts, params.restDay)) continue;

    const startUtc = bogotaDateTimeToUtc(dayParts, window.startHour, window.startMin);
    const endParts = window.crossesMidnight ? addDaysBogota(dayParts, 1) : dayParts;
    const endUtc = bogotaDateTimeToUtc(endParts, window.endHour, window.endMin);

    if (endUtc.getTime() <= now.getTime()) continue;
    slots.push({ startUtc, endUtc });
  }

  return slots;
}

export function buildShiftHourlySlots(params: {
  shiftType: TechnicianShiftType;
  restDay: TechnicianRestDay;
  startParts: DateParts;
  days: number;
  slotMinutes: number;
}) {
  const slots: ShiftSlot[] = [];
  const window = shiftWindow(params.shiftType);

  for (let i = 0; i < params.days; i += 1) {
    const dayParts = addDaysBogota(params.startParts, i);
    if (isRestDay(dayParts, params.restDay)) continue;

    const startUtc = bogotaDateTimeToUtc(dayParts, window.startHour, window.startMin);
    const endParts = window.crossesMidnight ? addDaysBogota(dayParts, 1) : dayParts;
    const endUtc = bogotaDateTimeToUtc(endParts, window.endHour, window.endMin);

    let cursor = startUtc.getTime();
    const endMs = endUtc.getTime();
    const step = params.slotMinutes * 60 * 1000;

    while (cursor + step <= endMs) {
      const slotStart = new Date(cursor);
      const slotEnd = new Date(cursor + step);
      slots.push({ startUtc: slotStart, endUtc: slotEnd });
      cursor += step;
    }
  }

  return slots;
}

export function overlaps(a: ShiftSlot, b: ShiftSlot) {
  return a.startUtc.getTime() < b.endUtc.getTime() && a.endUtc.getTime() > b.startUtc.getTime();
}

export function formatSlotLabel(startUtc: Date, endUtc: Date) {
  const fmtDate = new Intl.DateTimeFormat("es-CO", { timeZone: BOGOTA_TZ, dateStyle: "medium" });
  const fmtTime = new Intl.DateTimeFormat("es-CO", { timeZone: BOGOTA_TZ, hour: "2-digit", minute: "2-digit" });
  return `${fmtDate.format(startUtc)} ${fmtTime.format(startUtc)} - ${fmtTime.format(endUtc)}`;
}
