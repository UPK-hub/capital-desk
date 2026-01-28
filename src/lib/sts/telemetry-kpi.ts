import { prisma } from "@/lib/prisma";
import { StsKpiMetric, StsKpiPeriodicity } from "@prisma/client";

function safeNumber(value: unknown) {
  const raw = String(value ?? "").replace(",", ".");
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

function parseDate(value: unknown) {
  const raw = String(value ?? "");
  const match = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (!day || !month || !year) return null;
  return new Date(year, month - 1, day);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
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

function findHeaderIndex(rows: Array<Array<unknown>>, label: string) {
  return rows.findIndex((row) => row.some((cell) => String(cell ?? "").toLowerCase().includes(label)));
}

function findHeaderColumn(row: Array<unknown>, label: string) {
  return row.findIndex((cell) => String(cell ?? "").toLowerCase().includes(label));
}

export async function applyTelemetryKpisForTenant(tenantId: string) {
  const components = await prisma.stsComponent.findMany({ where: { tenantId, active: true } });
  if (!components.length) return;

  const componentByName = new Map(components.map((c) => [c.name.toLowerCase(), c]));
  const defaultComponent = components[0];

  const transmissionComponent =
    componentByName.get("dispositivo central") ??
    componentByName.get("cctv") ??
    componentByName.get("sensores del motor y conducción") ??
    defaultComponent;

  const panicComponent = componentByName.get("botón de pánico") ?? componentByName.get("boton de panico") ?? defaultComponent;

  const entries = await prisma.stsTelemetryEntry.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });

  const latestByKind = new Map<string, typeof entries[number]>();
  for (const entry of entries) {
    if (!latestByKind.has(entry.kind)) {
      latestByKind.set(entry.kind, entry);
    }
  }

  const tramas = latestByKind.get("TRAMAS");
  if (tramas) {
    const rows = (tramas.payload as any)?.rows as Array<Array<unknown>> | undefined;
    if (rows?.length) {
      const headerIdx = findHeaderIndex(rows, "vehículo");
      if (headerIdx >= 0) {
        const headerRow = rows[headerIdx];
        const efficiencyIdx = findHeaderColumn(headerRow, "eficiencia");
        const data = rows.slice(headerIdx + 1).filter((r) => String(r?.[1] ?? "").startsWith("K"));
        const byDate = new Map<string, number[]>();

        for (const row of data) {
          const date = parseDate(row[0]);
          const eff = safeNumber(row[efficiencyIdx]);
          if (!date || eff === null) continue;
          const key = date.toISOString().slice(0, 10);
          const list = byDate.get(key) ?? [];
          list.push(eff);
          byDate.set(key, list);
        }

        for (const [dateKey, values] of byDate.entries()) {
          const [year, month, day] = dateKey.split("-").map(Number);
          const periodStart = new Date(year, month - 1, day);
          const periodEnd = new Date(year, month - 1, day + 1);
          const avg = values.reduce((a, b) => a + b, 0) / values.length;
          const value = Math.max(0, Math.min(100, Number(avg.toFixed(2))));

          await upsertMeasurement({
            tenantId,
            componentId: transmissionComponent.id,
            metric: StsKpiMetric.TRANSMISSION,
            periodicity: StsKpiPeriodicity.DAILY,
            periodStart,
            periodEnd,
            value,
            source: "telemetry:tramas",
          });

          await upsertMeasurement({
            tenantId,
            componentId: transmissionComponent.id,
            metric: StsKpiMetric.DATA_CAPTURE,
            periodicity: StsKpiPeriodicity.DAILY,
            periodStart,
            periodEnd,
            value,
            source: "telemetry:tramas",
          });

          await upsertMeasurement({
            tenantId,
            componentId: transmissionComponent.id,
            metric: StsKpiMetric.RECORDING,
            periodicity: StsKpiPeriodicity.DAILY,
            periodStart,
            periodEnd,
            value,
            source: "telemetry:tramas",
          });
        }
      }
    }
  }

  const panic = latestByKind.get("PANIC");
  if (panic) {
    const rows = (panic.payload as any)?.rows as Array<Array<unknown>> | undefined;
    if (rows?.length) {
      const headerIdx = findHeaderIndex(rows, "vehícul");
      const data = headerIdx >= 0 ? rows.slice(headerIdx + 1) : rows.slice(1);
      const totals = data
        .filter((r) => String(r?.[0] ?? "").startsWith("K"))
        .map((r) => safeNumber(r[1]))
        .filter((n): n is number => n !== null);
      const total = totals.reduce((a, b) => a + b, 0);
      const now = new Date();
      const periodStart = panic.periodStart ? startOfMonth(new Date(panic.periodStart)) : startOfMonth(now);
      const periodEnd = addMonths(periodStart, 1);
      const value = total > 0 ? 100 : 0;

      await upsertMeasurement({
        tenantId,
        componentId: panicComponent.id,
        metric: StsKpiMetric.ALARM_SUCCESS,
        periodicity: StsKpiPeriodicity.MONTHLY,
        periodStart,
        periodEnd,
        value,
        source: "telemetry:panic",
      });
    }
  }
}
