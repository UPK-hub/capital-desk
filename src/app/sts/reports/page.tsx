import { prisma } from "@/lib/prisma";
import {
  StsKpiMetric,
  StsKpiPeriodicity,
  StsTicketSeverity,
  StsTicketStatus,
} from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import ReportsDashboard from "@/app/sts/reports/ui/ReportsDashboard";

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatShortDate(date: Date) {
  return date.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function buildBuckets(start: Date, count: number, stepDays: number) {
  return Array.from({ length: count }, (_, index) => addDays(start, index * stepDays));
}

function countInRange(dates: (Date | null)[], start: Date, end: Date) {
  return dates.filter((date) => date && date >= start && date < end).length;
}

function sum(values: number[]) {
  return values.reduce((acc, val) => acc + val, 0);
}

function avg(values: number[]) {
  if (!values.length) return 0;
  return sum(values) / values.length;
}

export default async function StsReportsPage({
  searchParams,
}: {
  searchParams?: { range?: string };
}) {
  const session = await getServerSession(authOptions);
  const tenantId = (session?.user as any)?.tenantId as string;
  const now = new Date();
  const rangeDays = Number(searchParams?.range ?? 30);
  const safeRange = [7, 30, 90].includes(rangeDays) ? rangeDays : 30;
  const since = new Date(now.getTime() - safeRange * 24 * 60 * 60 * 1000);
  const weekStart = startOfDay(addDays(now, -7 * 7));
  const dayStart = startOfDay(addDays(now, -6));

  const tickets = await prisma.stsTicket.findMany({
    where: { tenantId, closedAt: { gte: since } },
    include: { component: true },
  });

  const ticketsWindow = await prisma.stsTicket.findMany({
    where: {
      tenantId,
      OR: [{ openedAt: { gte: weekStart } }, { closedAt: { gte: weekStart } }, { closedAt: null }],
    },
    include: { component: true },
  });

  const byComponentSeverity = new Map<
    string,
    { total: number; responseBreaches: number; resolutionBreaches: number }
  >();
  for (const t of tickets) {
    const key = `${t.component.name}|${t.severity}`;
    const row = byComponentSeverity.get(key) ?? {
      total: 0,
      responseBreaches: 0,
      resolutionBreaches: 0,
    };
    row.total += 1;
    if (t.breachResponse) row.responseBreaches += 1;
    if (t.breachResolution) row.resolutionBreaches += 1;
    byComponentSeverity.set(key, row);
  }

  const weeklyAvailability = await prisma.stsKpiMeasurement.findMany({
    where: {
      tenantId,
      metric: StsKpiMetric.AVAILABILITY,
      periodicity: StsKpiPeriodicity.WEEKLY,
    },
    orderBy: { periodStart: "desc" },
    take: 20,
    include: { component: true },
  });

  const dailyKpis = await prisma.stsKpiMeasurement.findMany({
    where: {
      tenantId,
      metric: { in: [StsKpiMetric.TRANSMISSION, StsKpiMetric.DATA_CAPTURE, StsKpiMetric.RECORDING] },
      periodicity: StsKpiPeriodicity.DAILY,
    },
    orderBy: { periodStart: "desc" },
    take: 50,
    include: { component: true },
  });

  const weekBuckets = buildBuckets(weekStart, 8, 7);
  const weekLabels = weekBuckets.map((date) =>
    date.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit" })
  );
  const createdSeries = weekBuckets.map((start) =>
    countInRange(
      ticketsWindow.map((t) => t.openedAt),
      start,
      addDays(start, 7)
    )
  );
  const completedSeries = weekBuckets.map((start) =>
    countInRange(
      ticketsWindow.map((t) => t.closedAt),
      start,
      addDays(start, 7)
    )
  );

  const statusOrder = [
    StsTicketStatus.OPEN,
    StsTicketStatus.IN_PROGRESS,
    StsTicketStatus.WAITING_VENDOR,
    StsTicketStatus.RESOLVED,
    StsTicketStatus.CLOSED,
  ];
  const statusLabels: Record<StsTicketStatus, string> = {
    OPEN: "Abierta",
    IN_PROGRESS: "En curso",
    WAITING_VENDOR: "En espera",
    RESOLVED: "Resuelta",
    CLOSED: "Cerrada",
  };
  const statusCounts = statusOrder.map(
    (status) => ticketsWindow.filter((t) => t.status === status).length
  );
  const statusTotal = statusCounts.reduce((acc, val) => acc + val, 0);

  const severityOrder = [
    StsTicketSeverity.EMERGENCY,
    StsTicketSeverity.HIGH,
    StsTicketSeverity.MEDIUM,
    StsTicketSeverity.LOW,
  ];
  const severityLabels: Record<StsTicketSeverity, string> = {
    EMERGENCY: "Emergencia",
    HIGH: "Alta",
    MEDIUM: "Media",
    LOW: "Baja",
  };
  const severityCounts = severityOrder.map(
    (severity) => ticketsWindow.filter((t) => t.severity === severity).length
  );

  const dayBuckets = buildBuckets(dayStart, 7, 1);
  const dayLabels = dayBuckets.map((date) => formatShortDate(date));

  const dailySeries = [
    {
      name: "Transmisión",
      color: "hsl(var(--sts-accent))",
      values: dayBuckets.map((day) => {
        const values = dailyKpis
          .filter((m) => m.metric === StsKpiMetric.TRANSMISSION && isSameDay(m.periodStart, day))
          .map((m) => Number(m.value));
        return avg(values);
      }),
    },
    {
      name: "Captura",
      color: "hsl(var(--sts-accent-2))",
      values: dayBuckets.map((day) => {
        const values = dailyKpis
          .filter((m) => m.metric === StsKpiMetric.DATA_CAPTURE && isSameDay(m.periodStart, day))
          .map((m) => Number(m.value));
        return avg(values);
      }),
    },
    {
      name: "Grabación",
      color: "hsl(var(--sts-accent-2))",
      values: dayBuckets.map((day) => {
        const values = dailyKpis
          .filter((m) => m.metric === StsKpiMetric.RECORDING && isSameDay(m.periodStart, day))
          .map((m) => Number(m.value));
        return avg(values);
      }),
    },
  ];

  const availabilityByWeek = new Map<string, number[]>();
  for (const item of weeklyAvailability) {
    const key = item.periodStart.toISOString().slice(0, 10);
    const list = availabilityByWeek.get(key) ?? [];
    list.push(Number(item.value));
    availabilityByWeek.set(key, list);
  }
  const availabilitySeries = weekBuckets.map((date) => {
    const key = date.toISOString().slice(0, 10);
    const values = availabilityByWeek.get(key) ?? [];
    return avg(values);
  });

  const totalTickets = ticketsWindow.length;
  const totalBreaches = tickets.filter((t) => t.breachResolution || t.breachResponse).length;

  const componentSeverityRows = Array.from(byComponentSeverity.entries()).map(([key, row]) => {
    const [component, severity] = key.split("|");
    return {
      component,
      severity,
      response: row.total ? Math.round(((row.total - row.responseBreaches) / row.total) * 100) : 0,
      resolution: row.total ? Math.round(((row.total - row.resolutionBreaches) / row.total) * 100) : 0,
    };
  });

  const dailyKpiRows = dailyKpis.map((m) => ({
    id: m.id,
    component: m.component.name,
    metric: m.metric,
    date: m.periodStart.toLocaleDateString("es-CO"),
    value: Number(m.value).toFixed(2),
  }));

  const data = {
    rangeDays: safeRange,
    since: formatShortDate(since),
    now: formatShortDate(now),
    weekLabels,
    createdSeries,
    completedSeries,
    statusLabels: statusOrder.map((status) => statusLabels[status]),
    statusCounts,
    statusTotal,
    severityLabels: severityOrder.map((severity) => severityLabels[severity]),
    severityCounts,
    dayLabels,
    dailySeries,
    availabilitySeries,
    totalTickets,
    totalBreaches,
    componentSeverityRows,
    dailyKpiRows,
  };

  return <ReportsDashboard data={data} />;
}
