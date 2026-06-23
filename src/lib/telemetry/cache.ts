import { unstable_cache } from "next/cache";
import { buildTramaQuality, type TramaQuality } from "@/lib/telemetry/quality";
import {
  summaryFromRollup,
  busCountsFromRollup,
  seriesFromRollup,
  type TelemetrySummary,
} from "@/lib/telemetry/rollup";
import type { SeriesType, TelemetrySeries, BusPoint } from "@/lib/telemetry/series";

// Caché de resultados de telemetría (~5 min). Los tableros no necesitan tiempo
// real; las cargas repetidas y los cambios de pestaña son instantáneos.
const TTL = 300;

export function getTelemetrySummaryCached(
  tenantId: string,
  startISO: string,
  endISO: string,
  busCode: string | null
): Promise<TelemetrySummary> {
  return unstable_cache(
    async () => summaryFromRollup(tenantId, new Date(startISO), new Date(endISO), busCode),
    ["tm-summary", tenantId, startISO, endISO, busCode ?? "all"],
    { revalidate: TTL }
  )();
}

export function getBusCountsCached(
  tenantId: string,
  startISO: string,
  endISO: string,
  busCode: string | null
): Promise<BusPoint[]> {
  return unstable_cache(
    async () => busCountsFromRollup(tenantId, new Date(startISO), new Date(endISO), busCode),
    ["tm-buscounts", tenantId, startISO, endISO, busCode ?? "all"],
    { revalidate: TTL }
  )();
}

export function getSeriesCached(p: {
  tenantId: string;
  type: SeriesType;
  startISO: string;
  endISO: string;
  busCode: string | null;
  code: string | null;
}): Promise<TelemetrySeries> {
  return unstable_cache(
    async () =>
      seriesFromRollup({
        tenantId: p.tenantId,
        type: p.type,
        start: new Date(p.startISO),
        end: new Date(p.endISO),
        busCode: p.busCode,
        code: p.code,
      }),
    ["telemetry-series", p.tenantId, p.type, p.startISO, p.endISO, p.busCode ?? "all", p.code ?? "all"],
    { revalidate: TTL }
  )();
}

export function getQualityCached(p: {
  tenantId: string;
  startISO: string;
  endISO: string;
  busCode: string | null;
  limit: number;
}): Promise<TramaQuality> {
  return unstable_cache(
    async () =>
      buildTramaQuality({
        tenantId: p.tenantId,
        start: new Date(p.startISO),
        end: new Date(p.endISO),
        busCode: p.busCode,
        limit: p.limit,
      }),
    ["telemetry-quality", p.tenantId, p.startISO, p.endISO, p.busCode ?? "all", String(p.limit)],
    { revalidate: TTL }
  )();
}
