import { Prisma, StsTelemetryKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EVENT_CATALOG, ALARM_CATALOG, ALARM_LEVELS } from "@/lib/telemetry/catalog";
import { labelKey, bogDayStartInstant, bogToday, eachBogDay, bogDayLabel } from "@/lib/telemetry/tz";
import type { SeriesType, TelemetrySeries, DayPoint, BusPoint, DaySplitPoint } from "@/lib/telemetry/series";

// Resumen diario pre-agregado de telemetría, por día de Colombia (UTC-5).
// Los días cerrados se calculan una sola vez y quedan fijos; "hoy" (COT) se
// recalcula si lleva más de 10 min sin actualizarse. Los tableros leen este
// resumen (miles de filas) en vez de la tabla cruda (millones).

const STALE_TODAY_MS = 10 * 60 * 1000;

function numCode(prefix: string, raw: string): string {
  const m = String(raw ?? "").match(/(\d+)/);
  return m ? `${prefix}${Number(m[1])}` : "";
}

type RawGroup = {
  busCode: string;
  kind: string;
  subtype: string;
  eventCode: string;
  alarmCode: string;
  alarmLevelCode: string;
  c: number;
};

// Evita recalcular el mismo día en paralelo (varias consultas en una carga).
const inflight = new Map<string, Promise<void>>();

export async function recomputeDay(tenantId: string, label: Date): Promise<void> {
  const dayStart = bogDayStartInstant(label); // 00:00 COT
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const groups = await prisma.$queryRaw<RawGroup[]>(Prisma.sql`
    SELECT "busCode",
           "kind"::text AS kind,
           upper(coalesce("tramaSubtype", '')) AS subtype,
           coalesce("eventCode", '') AS "eventCode",
           coalesce("alarmCode", '') AS "alarmCode",
           coalesce("alarmLevelCode", '') AS "alarmLevelCode",
           count(*)::int AS c
    FROM "IntegrationInboundEvent"
    WHERE "tenantId" = ${tenantId}
      AND (("eventAt" >= ${dayStart} AND "eventAt" < ${dayEnd})
        OR ("eventAt" IS NULL AND "receivedAt" >= ${dayStart} AND "receivedAt" < ${dayEnd}))
    GROUP BY 1, 2, 3, 4, 5, 6
  `);

  const merged = new Map<string, { busCode: string; kind: string; code: string; level: string; count: number }>();
  for (const g of groups) {
    let code = "";
    let level = "";
    if (g.kind === "TRAMAS") code = (g.subtype || "").toUpperCase();
    else if (g.kind === "EVENTOS") code = numCode("EV", g.eventCode);
    else if (g.kind === "ALARMAS") {
      code = numCode("ALA", g.alarmCode);
      level = g.alarmLevelCode || "";
    }
    const key = `${g.busCode}|${g.kind}|${code}|${level}`;
    const prev = merged.get(key);
    merged.set(key, {
      busCode: g.busCode,
      kind: g.kind,
      code,
      level,
      count: (prev?.count ?? 0) + Number(g.c),
    });
  }

  const data = Array.from(merged.values()).map((m) => ({
    tenantId,
    busCode: m.busCode,
    day: label,
    kind: m.kind as StsTelemetryKind,
    code: m.code,
    level: m.level,
    count: m.count,
  }));

  await prisma.$transaction(async (tx) => {
    await tx.telemetryDailyRollup.deleteMany({ where: { tenantId, day: label } });
    if (data.length) await tx.telemetryDailyRollup.createMany({ data });
  });
}

function recomputeDayOnce(tenantId: string, label: Date): Promise<void> {
  const key = `${tenantId}|${labelKey(label)}`;
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = recomputeDay(tenantId, label).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export async function ensureRange(tenantId: string, start: Date, end: Date): Promise<void> {
  const days = eachBogDay(start, end);
  if (days.length === 0) return;
  const today = bogToday();
  const first = days[0];
  const last = days[days.length - 1];

  const existing = await prisma.telemetryDailyRollup.groupBy({
    by: ["day"],
    where: { tenantId, day: { gte: first, lte: last } },
    _max: { updatedAt: true },
  });
  const presence = new Map<string, Date | null>(
    existing.map((e) => [labelKey(e.day), e._max.updatedAt ?? null])
  );

  for (const day of days) {
    if (day.getTime() > today.getTime()) continue;
    const k = labelKey(day);
    const isToday = day.getTime() === today.getTime();
    const updatedAt = presence.get(k) ?? null;
    const present = presence.has(k);
    const staleToday = isToday && (!updatedAt || Date.now() - updatedAt.getTime() > STALE_TODAY_MS);
    if (!present || staleToday) {
      await recomputeDayOnce(tenantId, day);
    }
  }
}

export type TelemetrySummary = {
  telemetryTotals: { total: number; tramas: number; eventos: number; alarmas: number; p20: number; p60: number };
  telemetryEvents: { code: string; label: string; total: number }[];
  telemetryAlarms: { code: string; label: string; levelCode: string; levelLabel: string; total: number }[];
};

export async function summaryFromRollup(
  tenantId: string,
  start: Date,
  end: Date,
  busCode: string | null
): Promise<TelemetrySummary> {
  await ensureRange(tenantId, start, end);
  const first = bogDayLabel(start);
  const last = bogDayLabel(end);
  const baseWhere = { tenantId, day: { gte: first, lte: last }, ...(busCode ? { busCode } : {}) };

  const [byKind, tramaSub, events, alarms] = await Promise.all([
    prisma.telemetryDailyRollup.groupBy({ by: ["kind"], where: baseWhere, _sum: { count: true } }),
    prisma.telemetryDailyRollup.groupBy({
      by: ["code"],
      where: { ...baseWhere, kind: StsTelemetryKind.TRAMAS },
      _sum: { count: true },
    }),
    prisma.telemetryDailyRollup.groupBy({
      by: ["code"],
      where: { ...baseWhere, kind: StsTelemetryKind.EVENTOS },
      _sum: { count: true },
    }),
    prisma.telemetryDailyRollup.groupBy({
      by: ["code", "level"],
      where: { ...baseWhere, kind: StsTelemetryKind.ALARMAS },
      _sum: { count: true },
    }),
  ]);

  const kindTotal = (k: StsTelemetryKind) => byKind.find((r) => r.kind === k)?._sum.count ?? 0;
  const tramas = kindTotal(StsTelemetryKind.TRAMAS);
  const eventos = kindTotal(StsTelemetryKind.EVENTOS);
  const alarmas = kindTotal(StsTelemetryKind.ALARMAS);
  const subVal = (c: string) => tramaSub.find((r) => (r.code || "").toUpperCase() === c)?._sum.count ?? 0;

  const telemetryTotals = {
    total: tramas + eventos + alarmas,
    tramas,
    eventos,
    alarmas,
    p20: subVal("P20"),
    p60: subVal("P60"),
  };

  const eventLabel = (code: string) => EVENT_CATALOG.find((c) => c.code === code)?.label ?? code;
  const telemetryEvents = events
    .filter((r) => (r._sum.count ?? 0) > 0)
    .map((r) => ({ code: r.code || "SIN_CODIGO", label: eventLabel(r.code), total: r._sum.count ?? 0 }))
    .sort((a, b) => b.total - a.total);

  const alarmLabel = (code: string) => ALARM_CATALOG.find((c) => c.code === code)?.label ?? code;
  const levelLabel = (lvl: string) => ALARM_LEVELS.find((l) => l.code === lvl)?.label ?? (lvl || "Sin nivel");
  const telemetryAlarms = alarms
    .filter((r) => (r._sum.count ?? 0) > 0)
    .map((r) => ({
      code: r.code || "SIN_CODIGO",
      label: alarmLabel(r.code),
      levelCode: r.level || "SIN_NIVEL",
      levelLabel: levelLabel(r.level),
      total: r._sum.count ?? 0,
    }))
    .sort((a, b) => b.total - a.total);

  return { telemetryTotals, telemetryEvents, telemetryAlarms };
}

export async function busCountsFromRollup(
  tenantId: string,
  start: Date,
  end: Date,
  busCode: string | null
): Promise<BusPoint[]> {
  await ensureRange(tenantId, start, end);
  const first = bogDayLabel(start);
  const last = bogDayLabel(end);
  const rows = await prisma.telemetryDailyRollup.groupBy({
    by: ["busCode"],
    where: { tenantId, day: { gte: first, lte: last }, ...(busCode ? { busCode } : {}) },
    _sum: { count: true },
    orderBy: { _sum: { count: "desc" } },
    take: 100,
  });
  return rows.map((r) => ({ busCode: r.busCode, total: r._sum.count ?? 0 }));
}

export type BusBreakdownRow = {
  busCode: string;
  tramas: number;
  p20: number;
  p60: number;
  eventos: number;
  alarmas: number;
  total: number;
};

// Consolidado por bus con TODAS las métricas del rango (para el Resumen):
// tramas, P20, P60, eventos, alarmas y total.
export async function busBreakdownFromRollup(
  tenantId: string,
  start: Date,
  end: Date,
  busCode: string | null
): Promise<BusBreakdownRow[]> {
  await ensureRange(tenantId, start, end);
  const first = bogDayLabel(start);
  const last = bogDayLabel(end);
  const baseWhere = { tenantId, day: { gte: first, lte: last }, ...(busCode ? { busCode } : {}) };

  const [byBusKind, byBusSub] = await Promise.all([
    prisma.telemetryDailyRollup.groupBy({ by: ["busCode", "kind"], where: baseWhere, _sum: { count: true } }),
    prisma.telemetryDailyRollup.groupBy({
      by: ["busCode", "code"],
      where: { ...baseWhere, kind: StsTelemetryKind.TRAMAS },
      _sum: { count: true },
    }),
  ]);

  const map = new Map<string, BusBreakdownRow>();
  const ensure = (bus: string): BusBreakdownRow => {
    let r = map.get(bus);
    if (!r) {
      r = { busCode: bus, tramas: 0, p20: 0, p60: 0, eventos: 0, alarmas: 0, total: 0 };
      map.set(bus, r);
    }
    return r;
  };

  for (const g of byBusKind) {
    const r = ensure(g.busCode);
    const c = g._sum.count ?? 0;
    if (g.kind === StsTelemetryKind.TRAMAS) r.tramas += c;
    else if (g.kind === StsTelemetryKind.EVENTOS) r.eventos += c;
    else if (g.kind === StsTelemetryKind.ALARMAS) r.alarmas += c;
  }
  for (const g of byBusSub) {
    const r = ensure(g.busCode);
    const code = (g.code || "").toUpperCase();
    const c = g._sum.count ?? 0;
    if (code === "P20") r.p20 += c;
    else if (code === "P60") r.p60 += c;
  }
  for (const r of map.values()) r.total = r.tramas + r.eventos + r.alarmas;

  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

export async function seriesFromRollup(p: {
  tenantId: string;
  type: SeriesType;
  start: Date;
  end: Date;
  busCode: string | null;
  code: string | null;
}): Promise<TelemetrySeries> {
  await ensureRange(p.tenantId, p.start, p.end);
  const first = bogDayLabel(p.start);
  const last = bogDayLabel(p.end);
  const kind =
    p.type === "eventos"
      ? StsTelemetryKind.EVENTOS
      : p.type === "alarmas"
        ? StsTelemetryKind.ALARMAS
        : StsTelemetryKind.TRAMAS;
  const code = p.code && p.code.trim() ? p.code.trim().toUpperCase() : null;
  const where = {
    tenantId: p.tenantId,
    kind,
    day: { gte: first, lte: last },
    ...(p.busCode ? { busCode: p.busCode } : {}),
    ...(code ? { code } : {}),
  };

  const [perDayRows, perBusRows] = await Promise.all([
    prisma.telemetryDailyRollup.groupBy({ by: ["day"], where, _sum: { count: true } }),
    prisma.telemetryDailyRollup.groupBy({
      by: ["busCode"],
      where,
      _sum: { count: true },
      orderBy: { _sum: { count: "desc" } },
      take: 1000,
    }),
  ]);

  const byDay = new Map(perDayRows.map((r) => [labelKey(r.day), r._sum.count ?? 0]));
  const perDay: DayPoint[] = eachBogDay(p.start, p.end).map((d) => ({ date: labelKey(d), total: byDay.get(labelKey(d)) ?? 0 }));
  const perBus: BusPoint[] = perBusRows.map((r) => ({ busCode: r.busCode, total: r._sum.count ?? 0 }));
  const total = perDay.reduce((a, b) => a + b.total, 0);

  let perDaySplit: DaySplitPoint[] | undefined;
  if (p.type === "periodicas") {
    const splitRows = await prisma.telemetryDailyRollup.groupBy({
      by: ["day", "code"],
      where: {
        tenantId: p.tenantId,
        kind: StsTelemetryKind.TRAMAS,
        day: { gte: first, lte: last },
        ...(p.busCode ? { busCode: p.busCode } : {}),
      },
      _sum: { count: true },
    });
    const p20 = new Map<string, number>();
    const p60 = new Map<string, number>();
    for (const r of splitRows) {
      const k = labelKey(r.day);
      const v = r._sum.count ?? 0;
      const c = (r.code || "").toUpperCase();
      if (c === "P20") p20.set(k, (p20.get(k) ?? 0) + v);
      else if (c === "P60") p60.set(k, (p60.get(k) ?? 0) + v);
    }
    perDaySplit = eachBogDay(p.start, p.end).map((d) => {
      const k = labelKey(d);
      return { date: k, P20: p20.get(k) ?? 0, P60: p60.get(k) ?? 0 };
    });
  }

  return {
    type: p.type,
    code: p.code ?? null,
    range: { start: p.start, end: p.end },
    busId: null,
    total,
    perDay,
    perBus,
    perDaySplit,
  };
}
