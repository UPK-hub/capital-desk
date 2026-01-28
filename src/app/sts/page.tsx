import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { StsTicketSeverity, StsTicketStatus } from "@prisma/client";
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";

function pct(num: number, den: number) {
  if (!den) return 0;
  return Math.max(0, Math.min(100, Math.round((num / den) * 100)));
}

function fmtPct(v: number) {
  return `${v}%`;
}

function minutesToLabel(total: number) {
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!m) return `${h} h`;
  return `${h} h ${m} min`;
}

const statusOrder: StsTicketStatus[] = [
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

const severityOrder: StsTicketSeverity[] = [
  StsTicketSeverity.EMERGENCY,
  StsTicketSeverity.HIGH,
  StsTicketSeverity.MEDIUM,
  StsTicketSeverity.LOW,
];

const severityLabels: Record<StsTicketSeverity, string> = {
  EMERGENCY: "Emergencia",
  HIGH: "Alto",
  MEDIUM: "Medio",
  LOW: "Bajo",
};

type MonthlyExcelSummary = {
  id: string;
  monthLabel: string;
  files: string[];
  tramasAvgEfficiency: number | null;
  alarmasTotal: number | null;
  panicTotal: number | null;
  eventosTotal: number | null;
};

function monthKeyFromName(file: string) {
  const name = file.toLowerCase();
  const monthMap: Array<[RegExp, string]> = [
    [/enero|january|jan/i, "Enero"],
    [/febrero|february|feb/i, "Febrero"],
    [/marzo|march|mar/i, "Marzo"],
    [/abril|april|apr/i, "Abril"],
    [/mayo|may/i, "Mayo"],
    [/junio|june|jun/i, "Junio"],
    [/julio|july|jul/i, "Julio"],
    [/agosto|august|aug/i, "Agosto"],
    [/septiembre|setiembre|september|sep/i, "Septiembre"],
    [/octubre|october|oct/i, "Octubre"],
    [/noviembre|november|nov/i, "Noviembre"],
    [/diciembre|december|dec/i, "Diciembre"],
  ];
  for (const [rx, label] of monthMap) {
    if (rx.test(name)) return label;
  }
  return "Mes";
}

function safeNumber(v: unknown) {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function readSheetRows(filePath: string) {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const first = wb.SheetNames[0];
  const ws = wb.Sheets[first];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as Array<Array<unknown>>;
}

function summarizeTramas(filePath: string) {
  const rows = readSheetRows(filePath);
  const headerIdx = rows.findIndex((r) => String(r?.[1] ?? "").toLowerCase().includes("vehículo"));
  if (headerIdx === -1) return null;
  const data = rows.slice(headerIdx + 1).filter((r) => String(r?.[1] ?? "").startsWith("K"));
  const effIdx = rows[headerIdx].findIndex((c) => String(c).toLowerCase().includes("eficiencia"));
  if (effIdx === -1) return null;
  const values = data.map((r) => safeNumber(r[effIdx])).filter((n): n is number => n !== null);
  if (!values.length) return null;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.round(avg * 100) / 100;
}

function summarizeAlarmas(filePath: string) {
  const rows = readSheetRows(filePath);
  const headerIdx = rows.findIndex((r) => String(r?.[0] ?? "").toLowerCase().includes("vehículos"));
  if (headerIdx === -1) return null;
  const totalIdx = rows[headerIdx - 1]?.findIndex?.((c: unknown) => String(c).toLowerCase().includes("total")) ?? -1;
  if (totalIdx === -1) return null;
  const data = rows.slice(headerIdx + 1).filter((r) => String(r?.[0] ?? "").startsWith("K"));
  const totals = data.map((r) => safeNumber(r[totalIdx])).filter((n): n is number => n !== null);
  if (!totals.length) return null;
  return Math.round(totals.reduce((a, b) => a + b, 0));
}

function summarizeSimpleTotalBySecondCol(filePath: string) {
  const rows = readSheetRows(filePath);
  const headerIdx = rows.findIndex((r) => String(r?.[0] ?? "").toLowerCase().includes("veh"));
  if (headerIdx === -1) return null;
  const data = rows.slice(headerIdx + 1).filter((r) => String(r?.[0] ?? "").startsWith("K"));
  const values = data.map((r) => safeNumber(r[1])).filter((n): n is number => n !== null);
  if (!values.length) return null;
  return Math.round(values.reduce((a, b) => a + b, 0));
}

function loadMonthlyExcelSummaries(): MonthlyExcelSummary[] {
  const dir = path.join(process.cwd(), "Excels");
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".xls") || f.endsWith(".xlsx"));

  const byMonth = new Map<string, MonthlyExcelSummary>();

  for (const file of files) {
    const full = path.join(dir, file);
    const monthLabel = monthKeyFromName(file);
    const row =
      byMonth.get(monthLabel) ??
      {
        id: monthLabel.toLowerCase(),
        monthLabel,
        files: [],
        tramasAvgEfficiency: null,
        alarmasTotal: null,
        panicTotal: null,
        eventosTotal: null,
      };
    row.files.push(file);

    const lower = file.toLowerCase();
    try {
      if (lower.includes("tramas")) {
        row.tramasAvgEfficiency = summarizeTramas(full);
      } else if (lower.includes("alarmas")) {
        row.alarmasTotal = summarizeAlarmas(full);
      } else if (lower.includes("bot") || lower.includes("pánico") || lower.includes("panico")) {
        row.panicTotal = summarizeSimpleTotalBySecondCol(full);
      } else if (lower.includes("eventos")) {
        row.eventosTotal = summarizeSimpleTotalBySecondCol(full);
      }
    } catch {
      // Si un Excel falla, lo ignoramos para no romper el dashboard.
    }

    byMonth.set(monthLabel, row);
  }

  return Array.from(byMonth.values());
}

export default async function StsDashboardPage() {
  const session = await getServerSession(authOptions);
  const tenantId = (session?.user as any)?.tenantId as string;
  const now = new Date();
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthlySummaries = loadMonthlyExcelSummaries();

  const [
    statusCounts,
    closed30d,
    recentBreaches,
    kpiPolicies,
    slaPolicies,
    severityCounts,
    recentTickets,
  ] = await Promise.all([
    prisma.stsTicket.groupBy({
      by: ["status"],
      where: { tenantId },
      _count: { _all: true },
    }),
    prisma.stsTicket.count({
      where: { tenantId, closedAt: { gte: since30d } },
    }),
    prisma.stsTicket.findMany({
      where: {
        tenantId,
        OR: [{ breachResponse: true }, { breachResolution: true }],
      },
      include: { component: true },
      orderBy: { openedAt: "desc" },
      take: 6,
    }),
    prisma.stsKpiPolicy.findMany({
      where: { tenantId },
      include: { component: true },
    }),
    prisma.stsSlaPolicy.findMany({
      where: { tenantId },
      include: { component: true },
    }),
    prisma.stsTicket.groupBy({
      by: ["severity"],
      where: { tenantId, openedAt: { gte: since7d } },
      _count: { _all: true },
    }),
    prisma.stsTicket.findMany({
      where: { tenantId },
      include: { component: true },
      orderBy: { openedAt: "desc" },
      take: 8,
    }),
  ]);

  const statusMap = new Map(statusCounts.map((c) => [c.status, c._count._all]));
  const severityMap = new Map(severityCounts.map((c) => [c.severity, c._count._all]));

  const responseBreaches30d = await prisma.stsTicket.count({
    where: { tenantId, closedAt: { gte: since30d }, breachResponse: true },
  });
  const resolutionBreaches30d = await prisma.stsTicket.count({
    where: { tenantId, closedAt: { gte: since30d }, breachResolution: true },
  });

  const responseCompliance = pct(closed30d - responseBreaches30d, closed30d);
  const resolutionCompliance = pct(closed30d - resolutionBreaches30d, closed30d);

  const openTotal =
    (statusMap.get(StsTicketStatus.OPEN) ?? 0) +
    (statusMap.get(StsTicketStatus.IN_PROGRESS) ?? 0) +
    (statusMap.get(StsTicketStatus.WAITING_VENDOR) ?? 0);

  const resolvedTotal =
    (statusMap.get(StsTicketStatus.RESOLVED) ?? 0) + (statusMap.get(StsTicketStatus.CLOSED) ?? 0);

  const latestMeasurements = await prisma.stsKpiMeasurement.findMany({
    where: {
      tenantId,
      OR: kpiPolicies.map((p) => ({
        componentId: p.componentId,
        metric: p.metric,
        periodicity: p.periodicity,
      })),
    },
    orderBy: { periodStart: "desc" },
    take: 200,
  });

  const measurementMap = new Map<string, (typeof latestMeasurements)[number]>();
  for (const m of latestMeasurements) {
    const key = `${m.componentId}:${m.metric}:${m.periodicity}`;
    if (!measurementMap.has(key)) measurementMap.set(key, m);
  }

  const slaBySeverity = new Map<StsTicketSeverity, { response: number; resolution: number }>();
  for (const sev of severityOrder) {
    const policies = slaPolicies.filter((p) => p.severity === sev);
    if (!policies.length) continue;
    const response = Math.min(...policies.map((p) => p.responseMinutes));
    const resolution = Math.min(...policies.map((p) => p.resolutionMinutes));
    slaBySeverity.set(sev, { response, resolution });
  }

  const kpiByComponent = new Map<
    string,
    { componentId: string; componentName: string; items: (typeof kpiPolicies)[number][] }
  >();
  for (const p of kpiPolicies) {
    const row = kpiByComponent.get(p.componentId) ?? {
      componentId: p.componentId,
      componentName: p.component.name,
      items: [],
    };
    row.items.push(p);
    kpiByComponent.set(p.componentId, row);
  }
  const componentEntries = Array.from(kpiByComponent.values()).sort((a, b) =>
    a.componentName.localeCompare(b.componentName, "es")
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">STS · Panel operativo</h1>
          <p className="text-sm text-muted-foreground">SLA, severidades y KPIs con la visual de un panel tipo MaintainX.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link className="sts-btn-ghost" href="/sts/reports">
            Reportes
          </Link>
          <Link className="sts-btn-primary" href="/sts/tickets">
            Ver tickets
          </Link>
        </div>
      </div>

      <section className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <div className="sts-card p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Cumplimiento SLA · 30 días</p>
              <h2 className="text-xl font-semibold">Respuesta y resolución</h2>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="sts-chip">Breaches resp: {responseBreaches30d}</span>
              <span className="sts-chip">Breaches res: {resolutionBreaches30d}</span>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border p-4" style={{ borderColor: "hsl(var(--border))" }}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">SLA de respuesta</p>
                <p className="text-2xl font-semibold">{fmtPct(responseCompliance)}</p>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full" style={{ background: "hsl(var(--muted))" }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${responseCompliance}%`, background: "hsl(var(--sts-accent))" }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Meta mensual: 90%+</p>
            </div>

            <div className="rounded-2xl border p-4" style={{ borderColor: "hsl(var(--border))" }}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">SLA de resolución</p>
                <p className="text-2xl font-semibold">{fmtPct(resolutionCompliance)}</p>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full" style={{ background: "hsl(var(--muted))" }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${resolutionCompliance}%`, background: "hsl(var(--sts-accent-2))" }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Cierres analizados: {closed30d}</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            {statusOrder.map((status) => {
              const value = statusMap.get(status) ?? 0;
              const denom = (openTotal + resolvedTotal) || 1;
              const share = pct(value, denom);
              return (
                <div key={status} className="rounded-2xl border p-3" style={{ borderColor: "hsl(var(--border))" }}>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{statusLabels[status]}</p>
                  <p className="mt-1 text-2xl font-semibold">{value}</p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "hsl(var(--muted))" }}>
                    <div className="h-full rounded-full" style={{ width: `${share}%`, background: "hsl(var(--foreground))" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="sts-card p-5 space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Severidad · últimos 7 días</p>
            <h2 className="text-xl font-semibold">Carga por impacto</h2>
          </div>

          <div className="space-y-3">
            {severityOrder.map((sev) => {
              const value = severityMap.get(sev) ?? 0;
              const total = severityOrder.reduce((acc, s) => acc + (severityMap.get(s) ?? 0), 0) || 1;
              const share = pct(value, total);
              const sla = slaBySeverity.get(sev);
              return (
                <div key={sev} className="rounded-2xl border p-3 space-y-2" style={{ borderColor: "hsl(var(--border))" }}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{severityLabels[sev]}</p>
                      <p className="text-[11px] text-muted-foreground">
                        SLA: resp {sla ? minutesToLabel(sla.response) : "-"} · res {sla ? minutesToLabel(sla.resolution) : "-"}
                      </p>
                    </div>
                    <p className="text-2xl font-semibold">{value}</p>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "hsl(var(--muted))" }}>
                    <div className="h-full rounded-full" style={{ width: `${share}%`, background: "hsl(var(--sts-accent))" }} />
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground">Los tiempos mostrados vienen de tu matriz SLA configurada.</p>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="sts-card p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Incumplimientos recientes</h2>
              <p className="text-xs text-muted-foreground">Tickets con breach de respuesta o resolución.</p>
            </div>
            <Link className="sts-btn-ghost text-xs" href="/sts/tickets?breach=response">
              Ver todos
            </Link>
          </div>

          <div className="space-y-2">
            {recentBreaches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay incumplimientos recientes.</p>
            ) : (
              recentBreaches.map((t) => (
                <div key={t.id} className="rounded-2xl border p-3" style={{ borderColor: "hsl(var(--border))" }}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">{t.component.name}</p>
                    <span className="sts-chip">{severityLabels[t.severity]}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {statusLabels[t.status]} · {t.openedAt.toLocaleString("es-CO")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {t.breachResponse ? <span className="sts-chip">Breach respuesta</span> : null}
                    {t.breachResolution ? <span className="sts-chip">Breach resolución</span> : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="sts-card p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">KPIs · panel por componente</h2>
              <p className="text-xs text-muted-foreground">Visual tipo MaintainX: cada bloque resume sus métricas.</p>
            </div>
            <Link className="sts-btn-ghost text-xs" href="/sts/admin">
              Configurar
            </Link>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {componentEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay políticas KPI configuradas.</p>
            ) : (
              componentEntries.slice(0, 8).map((entry) => (
                <div
                  key={entry.componentId}
                  className="rounded-2xl border p-4 space-y-3"
                  style={{ borderColor: "hsl(var(--border))" }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{entry.componentName}</p>
                    <span className="sts-chip">{entry.items.length} KPI</span>
                  </div>

                  <div className="space-y-2">
                    {entry.items.slice(0, 5).map((p) => {
                      const key = `${p.componentId}:${p.metric}:${p.periodicity}`;
                      const m = measurementMap.get(key);
                      const valueNum = m ? Number(m.value) : null;
                      const threshold = Number(p.threshold);
                      const ok = valueNum !== null ? valueNum >= threshold : null;
                      const progress =
                        valueNum === null
                          ? 0
                          : Math.max(0, Math.min(100, Math.round((valueNum / threshold) * 100)));

                      return (
                        <div key={p.id} className="rounded-xl border p-3 space-y-1" style={{ borderColor: "hsl(var(--border))" }}>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-medium">
                              {p.metric} · {p.periodicity}
                            </p>
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{
                                background:
                                  ok === false ? "hsl(0 84% 60%)" : ok === true ? "hsl(142 72% 38%)" : "hsl(var(--muted-foreground))",
                              }}
                            />
                          </div>
                          <div className="flex items-end justify-between text-xs">
                            <span className="text-muted-foreground">Umbral {threshold.toFixed(0)}%</span>
                            <span className="text-sm font-semibold">
                              {valueNum === null ? "-" : `${valueNum.toFixed(1)}%`}
                            </span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "hsl(var(--muted))" }}>
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${progress}%`,
                                background: ok === false ? "hsl(0 84% 60%)" : "hsl(var(--sts-accent))",
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="sts-card p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Actividad reciente</h2>
            <p className="text-xs text-muted-foreground">Últimos tickets abiertos, con componente y severidad.</p>
          </div>
          <Link className="sts-btn-ghost text-xs" href="/sts/tickets">
            Abrir bandeja
          </Link>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {recentTickets.map((t) => (
            <div key={t.id} className="rounded-2xl border p-3 space-y-1" style={{ borderColor: "hsl(var(--border))" }}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{t.component.name}</p>
                <span className="sts-chip">{severityLabels[t.severity]}</span>
              </div>
              <p className="text-xs text-muted-foreground">{statusLabels[t.status]}</p>
              <p className="text-[11px] text-muted-foreground">{t.openedAt.toLocaleString("es-CO")}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="sts-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Entregables mensuales STS</h2>
            <p className="text-xs text-muted-foreground">
              Indicadores y tramas leídos desde la carpeta `Excels` del proyecto.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link className="sts-btn-ghost text-xs" href="/api/sts/reports/monthly">
              Exportar Excel
            </Link>
            <Link className="sts-btn-ghost text-xs" href="/sts/reports">
              Ver reportes
            </Link>
          </div>
        </div>

        {monthlySummaries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No se encontraron Excel en la carpeta `Excels`.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {monthlySummaries.map((m) => (
              <div
                key={m.id}
                className="rounded-2xl border p-4 space-y-3"
                style={{ borderColor: "hsl(var(--border))" }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{m.monthLabel}</p>
                  <span className="sts-chip">{m.files.length} archivos</span>
                </div>

                <div className="grid gap-2 md:grid-cols-2">
                  <div className="rounded-xl border p-3" style={{ borderColor: "hsl(var(--border))" }}>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Tramas · eficiencia prom.</p>
                    <p className="mt-1 text-2xl font-semibold">
                      {m.tramasAvgEfficiency === null ? "-" : `${m.tramasAvgEfficiency.toFixed(2)}%`}
                    </p>
                  </div>
                  <div className="rounded-xl border p-3" style={{ borderColor: "hsl(var(--border))" }}>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Alarmas · total</p>
                    <p className="mt-1 text-2xl font-semibold">{m.alarmasTotal ?? "-"}</p>
                  </div>
                  <div className="rounded-xl border p-3" style={{ borderColor: "hsl(var(--border))" }}>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Botón pánico · total</p>
                    <p className="mt-1 text-2xl font-semibold">{m.panicTotal ?? "-"}</p>
                  </div>
                  <div className="rounded-xl border p-3" style={{ borderColor: "hsl(var(--border))" }}>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Eventos · total</p>
                    <p className="mt-1 text-2xl font-semibold">{m.eventosTotal ?? "-"}</p>
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground">Archivos: {m.files.join(", ")}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
