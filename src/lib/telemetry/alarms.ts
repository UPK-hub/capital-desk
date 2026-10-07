/**
 * Capa de datos del tablero de alarmas.
 *
 * Los agregados (tarjetas, tendencia, ranking) salen de TelemetryDailyRollup,
 * que ya viene pre-sumado por tenant/bus/dia/codigo/nivel y esta indexado. El
 * detalle fila a fila sale de IntegrationInboundEvent, que es la trama cruda y
 * trae coordenadas y el payload completo.
 *
 * Todas las fechas se manejan como ETIQUETAS de dia COT (medianoche UTC), igual
 * que el resto del modulo de telemetria.
 */

import { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ALARM_CATALOG, ALARM_LEVELS } from "./catalog";
import { bogDayStartInstant, addDaysLabel, eachBogDay, labelKey } from "./tz";

const TTL = 120;

export const ALARM_LABEL = new Map(ALARM_CATALOG.map((a) => [a.code, a.label]));
export const LEVEL_LABEL = new Map(ALARM_LEVELS.map((l) => [l.code, l.label]));

/** Niveles que cuentan como criticos para los indicadores. */
export const NIVELES_CRITICOS = ["N1", "N5"];

export type FiltroAlarmas = {
  tenantId: string;
  desde: Date; // etiqueta de dia COT
  hasta: Date; // etiqueta de dia COT, inclusive
  busCode: string | null;
  code: string | null;
  level: string | null;
};

export type ResumenAlarmas = {
  total: number;
  criticas: number;
  buses: number;
  dias: number;
  promedioDia: number;
  topCode: { code: string; label: string; total: number } | null;
  topBus: { busCode: string; total: number } | null;
  totalPeriodoAnterior: number;
};

export type AlarmaPorCodigo = {
  code: string;
  label: string;
  total: number;
  criticas: number;
  niveles: Record<string, number>;
};

export type AlarmaPorNivel = { level: string; label: string; total: number };

export type PuntoTendencia = { etiqueta: string } & Record<string, number | string>;

export type FilaBus = {
  busCode: string;
  plate: string | null;
  total: number;
  criticas: number;
  porCodigo: Record<string, number>;
};

export type EventoAlarma = {
  id: string;
  eventAt: string | null;
  busCode: string;
  code: string;
  label: string;
  level: string;
  levelLabel: string;
  lat: number | null;
  lng: number | null;
  velocidad: number | null;
};

function whereRollup(f: FiltroAlarmas): Prisma.TelemetryDailyRollupWhereInput {
  return {
    tenantId: f.tenantId,
    kind: "ALARMAS",
    day: { gte: f.desde, lte: f.hasta },
    ...(f.busCode ? { busCode: f.busCode } : {}),
    ...(f.code ? { code: f.code } : {}),
    ...(f.level ? { level: f.level } : {}),
  };
}

/** Totales, criticas, buses afectados y comparacion con el periodo anterior. */
async function calcularResumen(f: FiltroAlarmas): Promise<ResumenAlarmas> {
  const dias = eachBogDay(f.desde, f.hasta).length || 1;

  const [porCodigo, porBus, anterior] = await Promise.all([
    prisma.telemetryDailyRollup.groupBy({
      by: ["code", "level"],
      _sum: { count: true },
      where: whereRollup(f),
    }),
    prisma.telemetryDailyRollup.groupBy({
      by: ["busCode"],
      _sum: { count: true },
      where: whereRollup(f),
    }),
    prisma.telemetryDailyRollup.aggregate({
      _sum: { count: true },
      where: whereRollup({
        ...f,
        desde: addDaysLabel(f.desde, -dias),
        hasta: addDaysLabel(f.hasta, -dias),
      }),
    }),
  ]);

  let total = 0;
  let criticas = 0;
  const totalPorCodigo = new Map<string, number>();
  for (const r of porCodigo) {
    const n = r._sum.count ?? 0;
    total += n;
    if (NIVELES_CRITICOS.includes(r.level)) criticas += n;
    totalPorCodigo.set(r.code, (totalPorCodigo.get(r.code) ?? 0) + n);
  }

  const topCodeEntry = [...totalPorCodigo.entries()].sort((a, b) => b[1] - a[1])[0];
  const busesOrdenados = porBus
    .map((b) => ({ busCode: b.busCode, total: b._sum.count ?? 0 }))
    .filter((b) => b.total > 0)
    .sort((a, b) => b.total - a.total);

  return {
    total,
    criticas,
    buses: busesOrdenados.length,
    dias,
    promedioDia: dias > 0 ? total / dias : 0,
    topCode: topCodeEntry
      ? { code: topCodeEntry[0], label: ALARM_LABEL.get(topCodeEntry[0]) ?? topCodeEntry[0], total: topCodeEntry[1] }
      : null,
    topBus: busesOrdenados[0] ?? null,
    totalPeriodoAnterior: anterior._sum.count ?? 0,
  };
}

/** Una fila por tipo de alarma del catalogo, con su desglose por nivel. */
async function calcularPorCodigo(f: FiltroAlarmas): Promise<AlarmaPorCodigo[]> {
  const rows = await prisma.telemetryDailyRollup.groupBy({
    by: ["code", "level"],
    _sum: { count: true },
    where: whereRollup(f),
  });

  const mapa = new Map<string, AlarmaPorCodigo>();
  for (const a of ALARM_CATALOG) {
    mapa.set(a.code, { code: a.code, label: a.label, total: 0, criticas: 0, niveles: {} });
  }

  for (const r of rows) {
    const n = r._sum.count ?? 0;
    if (n <= 0) continue;
    const actual =
      mapa.get(r.code) ??
      ({ code: r.code, label: ALARM_LABEL.get(r.code) ?? r.code, total: 0, criticas: 0, niveles: {} } as AlarmaPorCodigo);
    actual.total += n;
    if (NIVELES_CRITICOS.includes(r.level)) actual.criticas += n;
    actual.niveles[r.level] = (actual.niveles[r.level] ?? 0) + n;
    mapa.set(r.code, actual);
  }

  return [...mapa.values()].sort((a, b) => b.total - a.total || a.code.localeCompare(b.code));
}

/** Totales por nivel de severidad, en el orden del catalogo. */
async function calcularPorNivel(f: FiltroAlarmas): Promise<AlarmaPorNivel[]> {
  const rows = await prisma.telemetryDailyRollup.groupBy({
    by: ["level"],
    _sum: { count: true },
    where: whereRollup(f),
  });
  const mapa = new Map(rows.map((r) => [r.level, r._sum.count ?? 0]));
  return ALARM_LEVELS.map((l) => ({
    level: l.code,
    label: l.label,
    total: mapa.get(l.code) ?? 0,
  }));
}

/**
 * Tendencia en el tiempo, apilada por tipo de alarma.
 * Un solo dia -> por hora (trama cruda). Varios dias -> por dia (rollup).
 */
async function calcularTendencia(f: FiltroAlarmas): Promise<PuntoTendencia[]> {
  const dias = eachBogDay(f.desde, f.hasta);

  if (dias.length <= 1) {
    const inicio = bogDayStartInstant(f.desde);
    const fin = bogDayStartInstant(addDaysLabel(f.hasta, 1));
    const filas = await prisma.$queryRaw<{ hora: number; code: string | null; n: bigint }[]>(Prisma.sql`
      SELECT EXTRACT(HOUR FROM (e."eventAt" AT TIME ZONE 'America/Bogota'))::int AS hora,
             e."alarmCode" AS code,
             COUNT(*)::bigint AS n
        FROM "IntegrationInboundEvent" e
       WHERE e."tenantId" = ${f.tenantId}
         AND e."kind" = 'ALARMAS'
         AND e."eventAt" >= ${inicio}
         AND e."eventAt" < ${fin}
         ${f.busCode ? Prisma.sql`AND e."busCode" = ${f.busCode}` : Prisma.empty}
         ${f.code ? Prisma.sql`AND e."alarmCode" = ${f.code}` : Prisma.empty}
         ${f.level ? Prisma.sql`AND e."alarmLevelCode" = ${f.level}` : Prisma.empty}
       GROUP BY 1, 2
       ORDER BY 1
    `);

    const base: PuntoTendencia[] = Array.from({ length: 24 }, (_, h) => {
      const p: PuntoTendencia = { etiqueta: `${String(h).padStart(2, "0")}:00` };
      for (const a of ALARM_CATALOG) p[a.code] = 0;
      return p;
    });
    for (const r of filas) {
      const punto = base[r.hora];
      if (!punto || !r.code) continue;
      punto[r.code] = Number(punto[r.code] ?? 0) + Number(r.n);
    }
    return base;
  }

  const rows = await prisma.telemetryDailyRollup.groupBy({
    by: ["day", "code"],
    _sum: { count: true },
    where: whereRollup(f),
  });

  const porDia = new Map<string, PuntoTendencia>();
  const fmt = new Intl.DateTimeFormat("es-CO", { timeZone: "UTC", day: "2-digit", month: "short" });
  for (const d of dias) {
    const clave = labelKey(d);
    const p: PuntoTendencia = { etiqueta: fmt.format(d) };
    for (const a of ALARM_CATALOG) p[a.code] = 0;
    porDia.set(clave, p);
  }
  for (const r of rows) {
    const clave = labelKey(r.day);
    const p = porDia.get(clave);
    if (!p) continue;
    p[r.code] = Number(p[r.code] ?? 0) + (r._sum.count ?? 0);
  }
  return [...porDia.values()];
}

/** Ranking de buses con mas alarmas, con su desglose por tipo. */
async function calcularRankingBuses(f: FiltroAlarmas, limite = 15): Promise<FilaBus[]> {
  const rows = await prisma.telemetryDailyRollup.groupBy({
    by: ["busCode", "code", "level"],
    _sum: { count: true },
    where: whereRollup(f),
  });

  const mapa = new Map<string, FilaBus>();
  for (const r of rows) {
    const n = r._sum.count ?? 0;
    if (n <= 0) continue;
    const fila =
      mapa.get(r.busCode) ?? ({ busCode: r.busCode, plate: null, total: 0, criticas: 0, porCodigo: {} } as FilaBus);
    fila.total += n;
    if (NIVELES_CRITICOS.includes(r.level)) fila.criticas += n;
    fila.porCodigo[r.code] = (fila.porCodigo[r.code] ?? 0) + n;
    mapa.set(r.busCode, fila);
  }

  const top = [...mapa.values()].sort((a, b) => b.total - a.total).slice(0, limite);
  if (top.length === 0) return [];

  const buses = await prisma.bus.findMany({
    where: { tenantId: f.tenantId, code: { in: top.map((t) => t.busCode) } },
    select: { code: true, plate: true },
  });
  const placas = new Map(buses.map((b) => [b.code, b.plate]));
  return top.map((t) => ({ ...t, plate: placas.get(t.busCode) ?? null }));
}

/** Claves donde puede venir la velocidad dentro del payload de la trama. */
const CLAVES_VELOCIDAD = [
  "velocidad",
  "velocidadVehiculo",
  "velocidadKmh",
  "velocidad_km_h",
  "speed",
  "vehicleSpeed",
];

function leerVelocidad(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, any>;
  const contenedores = [data, data.localizacionVehiculo, data.localizacion, data.infoVehiculo];
  for (const c of contenedores) {
    if (!c || typeof c !== "object") continue;
    for (const k of CLAVES_VELOCIDAD) {
      const v = c[k];
      if (v === undefined || v === null || v === "") continue;
      const n = Number(String(v).replace(",", "."));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function leerCoordenada(payload: unknown, campo: "latitud" | "longitud"): number | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, any>;
  const loc = data.localizacionVehiculo ?? data.localizacion ?? data.location ?? data;
  const bruto = loc?.[campo] ?? loc?.[campo === "latitud" ? "latitude" : "longitude"];
  if (bruto === undefined || bruto === null || bruto === "") return null;
  const n = Number(String(bruto).replace(",", "."));
  return Number.isFinite(n) && n !== 0 ? n : null;
}

/** Detalle de eventos, de la trama cruda. Acotado por limite. */
export async function listarEventos(f: FiltroAlarmas, limite = 300): Promise<EventoAlarma[]> {
  const inicio = bogDayStartInstant(f.desde);
  const fin = bogDayStartInstant(addDaysLabel(f.hasta, 1));

  const filas = await prisma.integrationInboundEvent.findMany({
    where: {
      tenantId: f.tenantId,
      kind: "ALARMAS",
      eventAt: { gte: inicio, lt: fin },
      ...(f.busCode ? { busCode: f.busCode } : {}),
      ...(f.code ? { alarmCode: f.code } : {}),
      ...(f.level ? { alarmLevelCode: f.level } : {}),
    },
    orderBy: { eventAt: "desc" },
    take: limite,
    select: {
      id: true,
      eventAt: true,
      busCode: true,
      alarmCode: true,
      alarmLabel: true,
      alarmLevelCode: true,
      alarmLevelLabel: true,
      payload: true,
    },
  });

  return filas.map((r) => ({
    id: r.id,
    eventAt: r.eventAt ? r.eventAt.toISOString() : null,
    busCode: r.busCode,
    code: r.alarmCode ?? "",
    label: r.alarmLabel ?? ALARM_LABEL.get(r.alarmCode ?? "") ?? r.alarmCode ?? "Sin código",
    level: r.alarmLevelCode ?? "",
    levelLabel: r.alarmLevelLabel ?? LEVEL_LABEL.get(r.alarmLevelCode ?? "") ?? "",
    lat: leerCoordenada(r.payload, "latitud"),
    lng: leerCoordenada(r.payload, "longitud"),
    velocidad: leerVelocidad(r.payload),
  }));
}

export type TableroAlarmas = {
  resumen: ResumenAlarmas;
  porCodigo: AlarmaPorCodigo[];
  porNivel: AlarmaPorNivel[];
  tendencia: PuntoTendencia[];
  ranking: FilaBus[];
};

async function construirTablero(f: FiltroAlarmas): Promise<TableroAlarmas> {
  const [resumen, porCodigo, porNivel, tendencia, ranking] = await Promise.all([
    calcularResumen(f),
    calcularPorCodigo(f),
    calcularPorNivel(f),
    calcularTendencia(f),
    calcularRankingBuses(f),
  ]);
  return { resumen, porCodigo, porNivel, tendencia, ranking };
}

export function getTableroAlarmas(f: FiltroAlarmas): Promise<TableroAlarmas> {
  return unstable_cache(
    () => construirTablero(f),
    [
      "tm-alarmas",
      f.tenantId,
      labelKey(f.desde),
      labelKey(f.hasta),
      f.busCode ?? "all",
      f.code ?? "all",
      f.level ?? "all",
    ],
    { revalidate: TTL }
  )();
}
