import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { buildTmReport } from "@/lib/tm-report";
import { prisma } from "@/lib/prisma";
import TelemetryDashboard, {
  type AlarmRow,
  type BusCountRow,
  type EventRow,
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
  return d.toISOString().slice(0, 10);
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

  const range = Number(searchParams?.range ?? 30);
  const safeRange = [7, 30, 90].includes(range) ? range : 30;

  let start = startOfDay(new Date(now.getTime() - safeRange * 24 * 60 * 60 * 1000));
  let end = endOfDay(now);

  if (searchParams?.start && searchParams?.end) {
    const s = new Date(`${searchParams.start}T00:00:00`);
    const e = new Date(`${searchParams.end}T23:59:59`);
    if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime())) {
      start = startOfDay(s);
      end = endOfDay(e);
    }
  }

  const requestedBusId = searchParams?.busId ?? null;
  const selectedBus = requestedBusId
    ? await prisma.bus.findFirst({
        where: { id: requestedBusId, tenantId },
        select: { id: true, code: true, plate: true },
      })
    : null;

  const [generalReport, selectedBusReport, states, busCountsRaw] = await Promise.all([
    buildTmReport({ tenantId, start, end }),
    selectedBus ? buildTmReport({ tenantId, start, end, busId: selectedBus.id }) : Promise.resolve(null),
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
    prisma.integrationInboundEvent.groupBy({
      by: ["busCode"],
      where: {
        tenantId,
        OR: [{ eventAt: { gte: start, lt: end } }, { eventAt: null, receivedAt: { gte: start, lt: end } }],
      },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 100,
    }),
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

  const busCounts: BusCountRow[] = busCountsRaw.map((row) => ({
    busCode: row.busCode,
    total: row._count.id ?? 0,
  }));

  const events: EventRow[] = (selectedBusReport?.telemetryEvents ?? generalReport.telemetryEvents) as EventRow[];
  const alarms: AlarmRow[] = (selectedBusReport?.telemetryAlarms ?? generalReport.telemetryAlarms) as AlarmRow[];

  return (
    <TelemetryDashboard
      range={{ start: formatInputDate(start), end: formatInputDate(end), rangeDays: safeRange }}
      selectedBus={selectedBus}
      generalTotals={toTotals(generalReport.telemetryTotals)}
      busTotals={selectedBusReport ? toTotals(selectedBusReport.telemetryTotals) : null}
      points={points}
      busCounts={busCounts}
      events={events}
      alarms={alarms}
    />
  );
}
