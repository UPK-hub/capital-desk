import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { codeNumber } from "@/lib/telemetry/catalog";

// Series para los tableros de Eventos, Alarmas y Periódicas:
//  - perDay: volumen de tramas por día (rango), filtrable por código (EVn/ALAn) o subtipo (P20/P60)
//  - perBus: volumen por bus (top)

export type SeriesType = "eventos" | "alarmas" | "periodicas";
export type DayPoint = { date: string; total: number };
export type BusPoint = { busCode: string; total: number };

export type TelemetrySeries = {
  type: SeriesType;
  code: string | null;
  range: { start: Date; end: Date };
  busId: string | null;
  total: number;
  perDay: DayPoint[];
  perBus: BusPoint[];
};

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function eachDay(start: Date, end: Date): string[] {
  const days: string[] = [];
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  let guard = 0;
  while (cur <= last && guard < 400) {
    days.push(dayKey(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
    guard += 1;
  }
  return days;
}

export async function buildTelemetrySeries(params: {
  tenantId: string;
  type: SeriesType;
  start: Date;
  end: Date;
  busId?: string | null;
  code?: string | null;
}): Promise<TelemetrySeries> {
  const { tenantId, start, end } = params;
  const busId = params.busId ?? null;
  const code = params.code && params.code.trim() ? params.code.trim() : null;

  const busFilter = busId ? Prisma.sql`AND "busId" = ${busId}` : Prisma.empty;
  const rangeFilter = Prisma.sql`AND (("eventAt" >= ${start} AND "eventAt" <= ${end}) OR ("eventAt" IS NULL AND "receivedAt" >= ${start} AND "receivedAt" <= ${end}))`;
  const coalDate = Prisma.sql`coalesce("eventAt", "receivedAt")`;

  // Filtro por clase de trama
  const kindClause =
    params.type === "periodicas"
      ? Prisma.sql`AND "kind"::text = 'TRAMAS' AND "tramaType" = 1`
      : Prisma.sql`AND "kind"::text = ${params.type === "alarmas" ? "ALARMAS" : "EVENTOS"}`;

  // Filtro por código/subtipo seleccionado (opcional)
  let codeFilter = Prisma.empty;
  if (code) {
    if (params.type === "periodicas") {
      codeFilter = Prisma.sql`AND upper("tramaSubtype") = ${code.toUpperCase()}`;
    } else {
      const num = codeNumber(code);
      if (num != null) {
        const col = params.type === "alarmas" ? Prisma.sql`"alarmCode"` : Prisma.sql`"eventCode"`;
        codeFilter = Prisma.sql`AND regexp_replace(coalesce(${col}, ''), '[^0-9]', '', 'g') = ${String(num)}`;
      }
    }
  }

  const [perDayRaw, perBusRaw] = await Promise.all([
    prisma.$queryRaw<{ d: string; c: number }[]>(Prisma.sql`
      SELECT to_char(date_trunc('day', ${coalDate}), 'YYYY-MM-DD') AS d, count(*)::int AS c
      FROM "IntegrationInboundEvent"
      WHERE "tenantId" = ${tenantId} ${kindClause} ${codeFilter} ${rangeFilter} ${busFilter}
      GROUP BY 1
      ORDER BY 1 ASC
    `),
    prisma.$queryRaw<{ busCode: string; c: number }[]>(Prisma.sql`
      SELECT "busCode", count(*)::int AS c
      FROM "IntegrationInboundEvent"
      WHERE "tenantId" = ${tenantId} ${kindClause} ${codeFilter} ${rangeFilter} ${busFilter}
      GROUP BY "busCode"
      ORDER BY c DESC
      LIMIT 20
    `),
  ]);

  const byDay = new Map(perDayRaw.map((r) => [r.d, Number(r.c)]));
  const perDay: DayPoint[] = eachDay(start, end).map((d) => ({ date: d, total: byDay.get(d) ?? 0 }));
  const perBus: BusPoint[] = perBusRaw.map((r) => ({ busCode: r.busCode, total: Number(r.c) }));
  const total = perDay.reduce((a, b) => a + b.total, 0);

  return { type: params.type, code, range: { start, end }, busId, total, perDay, perBus };
}
