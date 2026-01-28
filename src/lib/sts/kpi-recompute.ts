import { prisma } from "@/lib/prisma";
import { StsKpiMetric, StsKpiPeriodicity } from "@prisma/client";

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfWeek(date: Date) {
  const next = startOfDay(date);
  const day = next.getDay();
  const diff = (day + 6) % 7;
  next.setDate(next.getDate() - diff);
  return next;
}

function startOfMonth(date: Date) {
  const next = startOfDay(date);
  next.setDate(1);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function clamp(num: number, min: number, max: number) {
  return Math.max(min, Math.min(max, num));
}

async function upsertMeasurement(params: {
  tenantId: string;
  componentId: string;
  metric: StsKpiMetric;
  periodicity: StsKpiPeriodicity;
  periodStart: Date;
  periodEnd: Date;
  value: number;
  source?: string;
}) {
  const existing = await prisma.stsKpiMeasurement.findFirst({
    where: {
      tenantId: params.tenantId,
      componentId: params.componentId,
      metric: params.metric,
      periodicity: params.periodicity,
      periodStart: params.periodStart,
    },
  });

  if (existing) {
    await prisma.stsKpiMeasurement.update({
      where: { id: existing.id },
      data: {
        value: params.value,
        periodEnd: params.periodEnd,
        source: params.source,
      },
    });
    return;
  }

  await prisma.stsKpiMeasurement.create({
    data: {
      tenantId: params.tenantId,
      componentId: params.componentId,
      metric: params.metric,
      periodicity: params.periodicity,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      value: params.value,
      source: params.source,
    },
  });
}

export async function recomputeStsKpisForTenant(tenantId: string, now = new Date()) {
  const components = await prisma.stsComponent.findMany({ where: { tenantId, active: true } });

  const monthStart = startOfMonth(now);
  const monthEnd = addDays(monthStart, 32);
  monthEnd.setDate(1);

  const weekStart = startOfWeek(now);
  const weekBuckets = Array.from({ length: 8 }, (_, index) => addDays(weekStart, -7 * index)).reverse();

  const ticketsForMonth = await prisma.stsTicket.findMany({
    where: {
      tenantId,
      openedAt: { gte: monthStart, lt: monthEnd },
    },
  });

  const ticketsForWeeks = await prisma.stsTicket.findMany({
    where: {
      tenantId,
      OR: [
        { openedAt: { lte: addDays(weekStart, 1) } },
        { closedAt: { gte: addDays(weekStart, -7 * 8) } },
        { closedAt: null },
      ],
    },
  });

  for (const component of components) {
    const monthlyTickets = ticketsForMonth.filter((t) => t.componentId === component.id);
    const totalMonthly = monthlyTickets.length;
    const responseOk = monthlyTickets.filter((t) => !t.breachResponse).length;
    const responsePct = totalMonthly ? (responseOk / totalMonthly) * 100 : 100;

    await upsertMeasurement({
      tenantId,
      componentId: component.id,
      metric: StsKpiMetric.SUPPORT_RESPONSE,
      periodicity: StsKpiPeriodicity.MONTHLY,
      periodStart: monthStart,
      periodEnd: monthEnd,
      value: clamp(Number(responsePct.toFixed(2)), 0, 100),
      source: "auto:sts_ticket",
    });

    for (const bucketStart of weekBuckets) {
      const bucketEnd = addDays(bucketStart, 7);
      const bucketMinutes = (bucketEnd.getTime() - bucketStart.getTime()) / 60000;

      const overlapTickets = ticketsForWeeks.filter((t) => t.componentId === component.id);
      let downtimeMinutes = 0;

      for (const ticket of overlapTickets) {
        const start = ticket.openedAt > bucketStart ? ticket.openedAt : bucketStart;
        const end = (ticket.closedAt ?? now) < bucketEnd ? ticket.closedAt ?? now : bucketEnd;
        if (end > start) {
          downtimeMinutes += (end.getTime() - start.getTime()) / 60000;
        }
      }

      const availability = bucketMinutes ? (1 - downtimeMinutes / bucketMinutes) * 100 : 100;

      await upsertMeasurement({
        tenantId,
        componentId: component.id,
        metric: StsKpiMetric.AVAILABILITY,
        periodicity: StsKpiPeriodicity.WEEKLY,
        periodStart: bucketStart,
        periodEnd: bucketEnd,
        value: clamp(Number(availability.toFixed(2)), 0, 100),
        source: "auto:sts_ticket",
      });
    }
  }
}

export async function recomputeStsKpisAllTenants(now = new Date()) {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  for (const tenant of tenants) {
    await recomputeStsKpisForTenant(tenant.id, now);
  }
}
