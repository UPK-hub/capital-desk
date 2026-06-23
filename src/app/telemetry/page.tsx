import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getTelemetrySummaryCached, getBusCountsCached } from "@/lib/telemetry/cache";
import { bogToday, bogDayStartInstant, addDaysLabel, bogDayKey } from "@/lib/telemetry/tz";
import { prisma } from "@/lib/prisma";
import TelemetryDashboard, {
  type AlarmRow,
  type BusCountRow,
  type EventRow,
  type ReportStatus,
  type TelemetryMapPoint,
  type TelemetryTotals,
} from "./ui/TelemetryDashboard";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function formatInputDate(d: Date) {
  return bogDayKey(d);
}

function parseCoordinate(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const normalized = raw.replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractLatLng(payload: unknown): { lat: number; lng: number } | null {
  if (!payload || typeof payload !== "object") return null;

  const data = payload as Record<string, unknown>;
  const location =
    (data.localizacionVehiculo as Record<string, unknown> | undefined) ??
    (data.localizacion as Record<string, unknown> | undefined) ??
    (data.location as Record<string, unknown> | undefined) ??
    null;

  const lat =
    parseCoordinate(location?.latitud) ??
    parseCoordinate(location?.latitude) ??
    parseCoordinate(data.latitud) ??
    parseCoordinate(data.latitude);
  const lng =
    parseCoordinate(location?.longitud) ??
    parseCoordinate(location?.longitude) ??
    parseCoordinate(data.longitud) ??
    parseCoordinate(data.longitude);

  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}

function toTotals(value: {
  total: number;
  tramas: number;
  eventos: number;
  alarmas: number;
  p20: number;
  p60: number;
}): TelemetryTotals {
  return {
    total: value.total,
    tramas: value.tramas,
    eventos: value.eventos,
    alarmas: value.alarmas,
    p20: value.p20,
    p60: value.p60,
  };
}

export default async function TelemetryPage({
  searchParams,
}: {
  searchParams?: { range?: string; start?: string; end?: string; busId?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  if (session.user.role !== "ADMIN") redirect("/");

  const tenantId = (session.user as any).tenantId as string;
  const now = new Date();

  const range = Number(searchParams?.range ?? 7);
  const safeRange = [7, 30, 90].includes(range) ? range : 7;

  const todayLabel = bogToday();
  let start = bogDayStartInstant(addDaysLabel(todayLabel, -safeRange));
  let end = new Date(bogDayStartInstant(todayLabel).getTime() + 24 * 60 * 60 * 1000 - 1);

  if (searchParams?.start && searchParams?.end) {
    const s = new Date(`${searchParams.start}T00:00:00-05:00`);
    const e = new Date(`${searchParams.end}T23:59:59.999-05:00`);
    if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime())) {
      start = s;
      end = e;
    }
  }

  const requestedBusId = searchParams?.busId ?? null;
  const selectedBus = requestedBusId
    ? await prisma.bus.findFirst({
        where: { id: requestedBusId, tenantId },
        select: { id: true, code: true, plate: true },
      })
    : null;

  const startISO = start.toISOString();
  const endISO = end.toISOString();

  const [generalSummary, busSummary, states, busCounts] = await Promise.all([
    getTelemetrySummaryCached(tenantId, startISO, endISO, null),
    selectedBus ? getTelemetrySummaryCached(tenantId, startISO, endISO, selectedBus.code) : Promise.resolve(null),
    prisma.busTelemetryState.findMany({
      where: {
        tenantId,
        ...(selectedBus ? { busId: selectedBus.id } : {}),
      },
      include: {
        bus: { select: { id: true, code: true, plate: true } },
      },
      orderBy: { lastSeenAt: "desc" },
      take: selectedBus ? 1 : 500,
    }),
    getBusCountsCached(tenantId, startISO, endISO, selectedBus?.code ?? null),
  ]);

  const points: TelemetryMapPoint[] = states
    .map((row) => {
      const coords = extractLatLng(row.lastPayload);
      if (!coords) return null;
      return {
        busId: row.busId,
        code: row.bus.code,
        plate: row.bus.plate,
        lat: coords.lat,
        lng: coords.lng,
        lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
        lastEventType: row.lastEventType,
        lastSeverity: row.lastSeverity,
        lastMessage: row.lastMessage,
      } satisfies TelemetryMapPoint;
    })
    .filter((p): p is TelemetryMapPoint => Boolean(p));

  // Estado de reporte HOY (flota completa, independiente del rango/filtro):
  // qué buses NO han enviado tramas hoy.
  const startOfToday = bogDayStartInstant(bogToday());
  const [allBuses, allStates] = await Promise.all([
    prisma.bus.findMany({ where: { tenantId }, select: { id: true, code: true, plate: true } }),
    prisma.busTelemetryState.findMany({ where: { tenantId }, select: { busId: true, lastSeenAt: true } }),
  ]);
  const lastSeenByBus = new Map<string, Date | null>(allStates.map((s) => [s.busId, s.lastSeenAt]));
  const silentBuses = allBuses
    .map((b) => ({ code: b.code, plate: b.plate, lastSeenAt: lastSeenByBus.get(b.id) ?? null }))
    .filter((b) => !b.lastSeenAt || b.lastSeenAt < startOfToday)
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((b) => ({
      code: b.code,
      plate: b.plate,
      lastSeenAt: b.lastSeenAt ? b.lastSeenAt.toISOString() : null,
    }));
  const reportStatus: ReportStatus = {
    total: allBuses.length,
    reportedToday: allBuses.length - silentBuses.length,
    silent: silentBuses.length,
    silentBuses,
  };

  const events: EventRow[] = (busSummary?.telemetryEvents ?? generalSummary.telemetryEvents) as EventRow[];
  const alarms: AlarmRow[] = (busSummary?.telemetryAlarms ?? generalSummary.telemetryAlarms) as AlarmRow[];

  return (
    <TelemetryDashboard
      range={{ start: formatInputDate(start), end: formatInputDate(end), rangeDays: safeRange }}
      selectedBus={selectedBus}
      generalTotals={toTotals(generalSummary.telemetryTotals)}
      busTotals={busSummary ? toTotals(busSummary.telemetryTotals) : null}
      points={points}
      busCounts={busCounts}
      events={events}
      alarms={alarms}
      reportStatus={reportStatus}
    />
  );
}
