import { prisma } from "@/lib/prisma";
import {
  StsTelemetryKind,
  StsKpiMetric,
  StsKpiPeriodicity,
  StsTicketSeverity,
  StsTicketStatus,
} from "@prisma/client";

export type TmReportParams = {
  tenantId: string;
  start: Date;
  end: Date;
  busId?: string | null;
};

type TicketRow = {
  id: string;
  component: string;
  severity: StsTicketSeverity;
  status: StsTicketStatus;
  openedAt: Date;
  closedAt: Date | null;
  breachResponse: boolean;
  breachResolution: boolean;
  responseMinutes: number | null;
  resolutionMinutes: number | null;
};

type TelemetryTotals = {
  total: number;
  tramas: number;
  eventos: number;
  alarmas: number;
  p20: number;
  p60: number;
};

type TelemetryEventRow = {
  code: string;
  label: string;
  total: number;
};

type TelemetryAlarmRow = {
  code: string;
  label: string;
  levelCode: string;
  levelLabel: string;
  total: number;
};

function minutesDiff(a?: Date | null, b?: Date | null) {
  if (!a || !b) return null;
  const diff = b.getTime() - a.getTime();
  if (!Number.isFinite(diff)) return null;
  return Math.max(0, Math.round(diff / 60000));
}

export async function buildTmReport({ tenantId, start, end, busId }: TmReportParams) {
  const telemetryWhere = {
    tenantId,
    ...(busId ? { busId } : {}),
    OR: [
      { eventAt: { gte: start, lt: end } },
      { eventAt: null, receivedAt: { gte: start, lt: end } },
    ],
  };

  const tickets = await prisma.stsTicket.findMany({
    where: {
      tenantId,
      ...(busId ? { case: { busId } } : {}),
      OR: [
        { openedAt: { gte: start, lt: end } },
        { closedAt: { gte: start, lt: end } },
        { closedAt: null },
      ],
    },
    include: { component: true },
  });

  const closedTickets = tickets.filter((t) => t.closedAt && t.closedAt >= start && t.closedAt < end);

  const rows: TicketRow[] = tickets.map((t) => ({
    id: t.id,
    component: t.component.name,
    severity: t.severity,
    status: t.status,
    openedAt: t.openedAt,
    closedAt: t.closedAt,
    breachResponse: Boolean(t.breachResponse),
    breachResolution: Boolean(t.breachResolution),
    responseMinutes: minutesDiff(t.openedAt, t.firstResponseAt),
    resolutionMinutes: minutesDiff(t.openedAt, t.closedAt),
  }));

  const totalTickets = tickets.length;
  const openTickets = tickets.filter((t) => t.status !== StsTicketStatus.CLOSED).length;
  const closedCount = tickets.filter((t) => t.status === StsTicketStatus.CLOSED).length;

  const responseBreaches = closedTickets.filter((t) => t.breachResponse).length;
  const resolutionBreaches = closedTickets.filter((t) => t.breachResolution).length;
  const responseCompliance = closedTickets.length
    ? Math.round(((closedTickets.length - responseBreaches) / closedTickets.length) * 100)
    : 0;
  const resolutionCompliance = closedTickets.length
    ? Math.round(((closedTickets.length - resolutionBreaches) / closedTickets.length) * 100)
    : 0;

  const avgResponseMinutes = closedTickets.length
    ? Math.round(
        closedTickets
          .map((t) => minutesDiff(t.openedAt, t.firstResponseAt))
          .filter((v): v is number => v !== null)
          .reduce((a, b) => a + b, 0) /
          closedTickets.length
      )
    : 0;
  const avgResolutionMinutes = closedTickets.length
    ? Math.round(
        closedTickets
          .map((t) => minutesDiff(t.openedAt, t.closedAt))
          .filter((v): v is number => v !== null)
          .reduce((a, b) => a + b, 0) /
          closedTickets.length
      )
    : 0;

  const severityOrder = [
    StsTicketSeverity.EMERGENCY,
    StsTicketSeverity.HIGH,
    StsTicketSeverity.MEDIUM,
    StsTicketSeverity.LOW,
  ];
  const severityCounts = severityOrder.map(
    (s) => tickets.filter((t) => t.severity === s).length
  );

  const byComponentSeverity = new Map<
    string,
    { total: number; responseBreaches: number; resolutionBreaches: number }
  >();
  for (const t of closedTickets) {
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

  const componentSeverityRows = Array.from(byComponentSeverity.entries()).map(([key, row]) => {
    const [component, severity] = key.split("|");
    return {
      component,
      severity,
      total: row.total,
      response: row.total ? Math.round(((row.total - row.responseBreaches) / row.total) * 100) : 0,
      resolution: row.total ? Math.round(((row.total - row.resolutionBreaches) / row.total) * 100) : 0,
      responseBreaches: row.responseBreaches,
      resolutionBreaches: row.resolutionBreaches,
    };
  });

  const kpiPolicies = await prisma.stsKpiPolicy.findMany({
    where: { tenantId },
    include: { component: true },
  });

  const kpiMeasurements = await prisma.stsKpiMeasurement.findMany({
    where: {
      tenantId,
      periodStart: { gte: start, lt: end },
    },
    include: { component: true },
    orderBy: { periodStart: "desc" },
  });

  const policyByKey = new Map<string, number>();
  for (const p of kpiPolicies) {
    policyByKey.set(`${p.componentId}|${p.metric}|${p.periodicity}`, Number(p.threshold));
  }

  const kpiRows = kpiMeasurements.map((m) => {
    const threshold = policyByKey.get(`${m.componentId}|${m.metric}|${m.periodicity}`) ?? null;
    const value = Number(m.value);
    return {
      component: m.component.name,
      metric: m.metric,
      periodicity: m.periodicity,
      periodStart: m.periodStart,
      value,
      threshold,
      ok: threshold === null ? null : value >= threshold,
    };
  });

  const metricSummary = Object.values(StsKpiMetric).map((metric) => {
    const rows = kpiRows.filter((r) => r.metric === metric);
    const avg =
      rows.length > 0 ? Math.round((rows.reduce((a, b) => a + b.value, 0) / rows.length) * 100) / 100 : 0;
    const okCount = rows.filter((r) => r.ok === true).length;
    return {
      metric,
      average: avg,
      total: rows.length,
      okCount,
      compliance: rows.length ? Math.round((okCount / rows.length) * 100) : 0,
    };
  });

  const [telemetryByKind, tramaSubtypeCounts, eventCounts, alarmCounts] = await Promise.all([
    prisma.integrationInboundEvent.groupBy({
      by: ["kind"],
      where: telemetryWhere,
      _count: { id: true },
    }),
    prisma.integrationInboundEvent.groupBy({
      by: ["tramaSubtype"],
      where: { ...telemetryWhere, kind: StsTelemetryKind.TRAMAS, tramaType: 1 },
      _count: { id: true },
    }),
    prisma.integrationInboundEvent.groupBy({
      by: ["eventCode", "eventLabel"],
      where: { ...telemetryWhere, kind: StsTelemetryKind.EVENTOS, tramaType: 2 },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 50,
    }),
    prisma.integrationInboundEvent.groupBy({
      by: ["alarmCode", "alarmLabel", "alarmLevelCode", "alarmLevelLabel"],
      where: { ...telemetryWhere, kind: StsTelemetryKind.ALARMAS, tramaType: 3 },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 100,
    }),
  ]);

  const byKind = new Map(telemetryByKind.map((row) => [row.kind, row._count.id ?? 0]));
  const bySubtype = new Map(
    tramaSubtypeCounts.map((row) => [String(row.tramaSubtype ?? "").toUpperCase(), row._count.id ?? 0])
  );

  const telemetryTotals: TelemetryTotals = {
    total:
      (byKind.get(StsTelemetryKind.TRAMAS) ?? 0) +
      (byKind.get(StsTelemetryKind.EVENTOS) ?? 0) +
      (byKind.get(StsTelemetryKind.ALARMAS) ?? 0),
    tramas: byKind.get(StsTelemetryKind.TRAMAS) ?? 0,
    eventos: byKind.get(StsTelemetryKind.EVENTOS) ?? 0,
    alarmas: byKind.get(StsTelemetryKind.ALARMAS) ?? 0,
    p20: bySubtype.get("P20") ?? 0,
    p60: bySubtype.get("P60") ?? 0,
  };

  const telemetryEvents: TelemetryEventRow[] = eventCounts.map((row) => ({
    code: row.eventCode ?? "SIN_CODIGO",
    label: row.eventLabel ?? "Sin etiqueta",
    total: row._count.id ?? 0,
  }));

  const telemetryAlarms: TelemetryAlarmRow[] = alarmCounts.map((row) => ({
    code: row.alarmCode ?? "SIN_CODIGO",
    label: row.alarmLabel ?? "Sin etiqueta",
    levelCode: row.alarmLevelCode ?? "SIN_NIVEL",
    levelLabel: row.alarmLevelLabel ?? "Sin nivel",
    total: row._count.id ?? 0,
  }));

  return {
    range: { start, end },
    totals: {
      totalTickets,
      openTickets,
      closedTickets: closedCount,
      responseCompliance,
      resolutionCompliance,
      responseBreaches,
      resolutionBreaches,
      avgResponseMinutes,
      avgResolutionMinutes,
    },
    severityOrder,
    severityCounts,
    componentSeverityRows,
    metricSummary,
    kpiRows,
    ticketRows: rows,
    telemetryTotals,
    telemetryEvents,
    telemetryAlarms,
  };
}
