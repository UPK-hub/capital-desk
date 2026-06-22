import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { buildTmReport } from "@/lib/tm-report";
import { buildTelemetrySeries, type SeriesType, type TelemetrySeries } from "@/lib/telemetry/series";
import { buildTramaQuality, type TramaQuality } from "@/lib/telemetry/quality";

// Caché de resultados de telemetría. Los datos son de solo-anexado y los
// tableros no necesitan tiempo real, así que cacheamos ~5 min por
// tenant + rango + bus (+ tipo/código). Las cargas repetidas son instantáneas.
const TTL = 300;

export function getTmReportCached(tenantId: string, startISO: string, endISO: string, busId: string | null) {
  return unstable_cache(
    async () => buildTmReport({ tenantId, start: new Date(startISO), end: new Date(endISO), busId }),
    ["tm-report", tenantId, startISO, endISO, busId ?? "all"],
    { revalidate: TTL }
  )();
}

export function getBusCountsCached(tenantId: string, startISO: string, endISO: string, busId: string | null) {
  return unstable_cache(
    async () => {
      const start = new Date(startISO);
      const end = new Date(endISO);
      const raw = await prisma.integrationInboundEvent.groupBy({
        by: ["busCode"],
        where: {
          tenantId,
          ...(busId ? { busId } : {}),
          OR: [{ eventAt: { gte: start, lt: end } }, { eventAt: null, receivedAt: { gte: start, lt: end } }],
        },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 100,
      });
      return raw.map((r) => ({ busCode: r.busCode, total: r._count.id ?? 0 }));
    },
    ["tm-buscounts", tenantId, startISO, endISO, busId ?? "all"],
    { revalidate: TTL }
  )();
}

export function getSeriesCached(p: {
  tenantId: string;
  type: SeriesType;
  startISO: string;
  endISO: string;
  busId: string | null;
  code: string | null;
}): Promise<TelemetrySeries> {
  return unstable_cache(
    async () =>
      buildTelemetrySeries({
        tenantId: p.tenantId,
        type: p.type,
        start: new Date(p.startISO),
        end: new Date(p.endISO),
        busId: p.busId,
        code: p.code,
      }),
    ["telemetry-series", p.tenantId, p.type, p.startISO, p.endISO, p.busId ?? "all", p.code ?? "all"],
    { revalidate: TTL }
  )();
}

export function getQualityCached(p: {
  tenantId: string;
  startISO: string;
  endISO: string;
  busId: string | null;
  limit: number;
}): Promise<TramaQuality> {
  return unstable_cache(
    async () =>
      buildTramaQuality({
        tenantId: p.tenantId,
        start: new Date(p.startISO),
        end: new Date(p.endISO),
        busId: p.busId,
        limit: p.limit,
      }),
    ["telemetry-quality", p.tenantId, p.startISO, p.endISO, p.busId ?? "all", String(p.limit)],
    { revalidate: TTL }
  )();
}
