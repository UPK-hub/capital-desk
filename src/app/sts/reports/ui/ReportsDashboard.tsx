"use client";

import Link from "next/link";
import { useMemo, useState, useEffect, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface ReportsData {
  rangeDays: number;
  since: string;
  now: string;
  weekLabels: string[];
  createdSeries: number[];
  completedSeries: number[];
  statusLabels: string[];
  statusCounts: number[];
  statusTotal: number;
  severityLabels: string[];
  severityCounts: number[];
  dayLabels: string[];
  dailySeries: { name: string; color: string; values: number[] }[];
  availabilitySeries: number[];
  totalTickets: number;
  totalBreaches: number;
  componentSeverityRows: {
    component: string;
    severity: string;
    response: number;
    resolution: number;
  }[];
  dailyKpiRows: {
    id: string;
    component: string;
    metric: string;
    date: string;
    value: string;
  }[];
}

function pct(num: number, den: number) {
  if (!den) return "0%";
  return `${Math.round((num / den) * 100)}%`;
}

function sum(values: number[]) {
  return values.reduce((acc, val) => acc + val, 0);
}

function avg(values: number[]) {
  if (!values.length) return 0;
  return sum(values) / values.length;
}

function AnimatedNumber({ value, suffix }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let frame = 0;
    const duration = 700;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(value * eased);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  const formatted = Number.isInteger(value) ? Math.round(display).toString() : display.toFixed(1);

  return (
    <span>
      {formatted}
      {suffix ?? ""}
    </span>
  );
}

function MiniLineChart({
  labels,
  series,
}: {
  labels: string[];
  series: { name: string; color: string; values: number[] }[];
}) {
  const width = 420;
  const height = 200;
  const padding = 24;
  const maxValue = Math.max(1, ...series.flatMap((s) => s.values));

  const xStep = labels.length > 1 ? (width - padding * 2) / (labels.length - 1) : 0;
  const yScale = (value: number) =>
    height - padding - (value / maxValue) * (height - padding * 2);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-48">
      {Array.from({ length: 5 }).map((_, idx) => {
        const y = padding + (idx * (height - padding * 2)) / 4;
        return (
          <line
            key={idx}
            x1={padding}
            x2={width - padding}
            y1={y}
            y2={y}
            stroke="hsl(var(--border))"
            strokeWidth="1"
            opacity="0.3"
          />
        );
      })}

      {series.map((s, seriesIndex) => {
        const path = s.values
          .map((val, idx) => {
            const x = padding + idx * xStep;
            const y = yScale(val);
            return `${idx === 0 ? "M" : "L"} ${x} ${y}`;
          })
          .join(" ");

        return (
          <g key={s.name}>
            <path
              d={path}
              fill="none"
              stroke={s.color}
              strokeWidth="3"
              opacity={0.9}
            />
            {s.values.map((val, idx) => {
              const x = padding + idx * xStep;
              const y = yScale(val);
              return (
                <circle
                  key={`${seriesIndex}-${idx}`}
                  cx={x}
                  cy={y}
                  r={4}
                  fill={s.color}
                  stroke="hsl(var(--card))"
                  strokeWidth="2"
                />
              );
            })}
          </g>
        );
      })}

      {labels.map((label, idx) => {
        const x = padding + idx * xStep;
        return (
          <text
            key={label}
            x={x}
            y={height - 6}
            fontSize="10"
            textAnchor="middle"
            fill="hsl(var(--muted-foreground))"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}

function MiniBarChart({
  labels,
  series,
}: {
  labels: string[];
  series: { name: string; color: string; values: number[] }[];
}) {
  const width = 420;
  const height = 220;
  const padding = 24;
  const maxValue = Math.max(1, ...series.flatMap((s) => s.values));
  const barGroupWidth = (width - padding * 2) / labels.length;
  const barWidth = barGroupWidth / Math.max(1, series.length + 1);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-56">
      {Array.from({ length: 5 }).map((_, idx) => {
        const y = padding + (idx * (height - padding * 2)) / 4;
        return (
          <line
            key={idx}
            x1={padding}
            x2={width - padding}
            y1={y}
            y2={y}
            stroke="hsl(var(--border))"
            strokeWidth="1"
            opacity="0.3"
          />
        );
      })}

      {labels.map((label, idx) => {
        const groupX = padding + idx * barGroupWidth;
        return (
          <g key={label}>
            {series.map((s, sIdx) => {
              const value = s.values[idx] ?? 0;
              const rawHeight = ((height - padding * 2) * value) / maxValue;
              const barHeight = value === 0 ? 0 : Math.max(6, rawHeight);
              const x = groupX + sIdx * barWidth + barWidth * 0.3;
              const y = height - padding - barHeight;
              return (
                <rect
                  key={`${label}-${s.name}`}
                  x={x}
                  y={y}
                  width={barWidth * 0.6}
                  height={barHeight}
                  rx={6}
                  fill={s.color}
                />
              );
            })}
            <text
              x={groupX + barGroupWidth / 2}
              y={height - 6}
              fontSize="10"
              textAnchor="middle"
              fill="hsl(var(--muted-foreground))"
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function DonutChart({ value, total, color }: { value: number; total: number; color: string }) {
  const size = 140;
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const safeTotal = total || 1;
  const progress = Math.min(1, value / safeTotal);
  const dash = circumference * progress;

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-40 w-40">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="hsl(var(--border))"
        strokeWidth={stroke}
        opacity="0.35"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={circumference}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="report-donut"
        style={
          {
            "--donut-offset": `${circumference - dash}`,
            "--donut-circumference": `${circumference}`,
          } as Record<string, string>
        }
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="24"
        fontWeight="600"
        fill="hsl(var(--foreground))"
      >
        {pct(value, total)}
      </text>
    </svg>
  );
}

const DEFAULT_ORDER = [
  "created",
  "status",
  "daily-kpis",
  "availability",
  "severity",
  "breaches",
  "component-severity",
  "daily-table",
] as const;

type PanelId = (typeof DEFAULT_ORDER)[number];

export default function ReportsDashboard({ data }: { data: ReportsData }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [order, setOrder] = useState<PanelId[]>(DEFAULT_ORDER.slice());
  const [dragging, setDragging] = useState<PanelId | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem("sts-reports-panel-order");
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as PanelId[];
      if (Array.isArray(parsed) && parsed.length) {
        setOrder(parsed.filter((id) => DEFAULT_ORDER.includes(id)));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("sts-reports-panel-order", JSON.stringify(order));
  }, [order]);

  const handleRangeChange = (days: number) => {
    const params = new URLSearchParams(searchParams?.toString());
    params.set("range", String(days));
    startTransition(() => {
      router.replace(`/sts/reports?${params.toString()}`);
    });
  };

  const handleUpload = async (file?: File | null) => {
    if (!file) return;
    setUploading(true);
    setUploadMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/sts/reports/telemetry-import", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Error al importar");
      }
      setUploadMessage("Telemetría cargada correctamente.");
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "Error al importar");
    } finally {
      setUploading(false);
    }
  };

  const panels = useMemo(
    () =>
      ({
        created: {
          span: 6,
          content: (
            <section
              className="report-card"
              draggable
              onDragStart={() => setDragging("created")}
              onDragEnd={() => setDragging(null)}
            >
              <div className="report-card-header">
                <div>
                  <h2 className="report-card-title">Creado / Completado</h2>
                  <p className="report-subtitle">Tickets por semana (últimas 8 semanas)</p>
                </div>
                <div className="report-card-action report-drag-handle">
                  <span>Arrastrar</span>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                <div className="report-legend">
                  <span
                    className="report-pill"
                    style={{ borderColor: "hsl(var(--sts-accent))", color: "hsl(var(--sts-accent))" }}
                  >
                    Creado: {sum(data.createdSeries)}
                  </span>
                  <span
                    className="report-pill"
                    style={{
                      borderColor: "hsl(var(--sts-accent-2))",
                      color: "hsl(var(--sts-accent-2))",
                    }}
                  >
                    Completado: {sum(data.completedSeries)}
                  </span>
                </div>
                <div className="report-metric">
                  <span className="report-metric-value">
                    <AnimatedNumber
                      value={
                        data.createdSeries.length
                          ? Math.round((sum(data.completedSeries) / Math.max(1, sum(data.createdSeries))) * 100)
                          : 0
                      }
                      suffix="%"
                    />
                  </span>
                  <span className="report-metric-label">Porcentaje completado</span>
                </div>
              </div>
              <div className="report-chart">
                <MiniBarChart
                  labels={data.weekLabels}
                  series={[
                    { name: "Creado", color: "hsl(var(--sts-accent))", values: data.createdSeries },
                    { name: "Completado", color: "hsl(var(--sts-accent-2))", values: data.completedSeries },
                  ]}
                />
              </div>
            </section>
          ),
        },
        status: {
          span: 6,
          content: (
            <section
              className="report-card"
              draggable
              onDragStart={() => setDragging("status")}
              onDragEnd={() => setDragging(null)}
            >
              <div className="report-card-header">
                <div>
                  <h2 className="report-card-title">Estado</h2>
                  <p className="report-subtitle">Distribución actual de tickets</p>
                </div>
                <div className="report-card-action report-drag-handle">
                  <span>Arrastrar</span>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto]">
                <div className="report-legend">
                  {data.statusLabels.map((label, idx) => (
                    <span
                      key={label}
                      className="report-pill"
                      style={{ color: "hsl(var(--foreground))", borderColor: "hsl(var(--border))" }}
                    >
                      {label}: {data.statusCounts[idx]}
                    </span>
                  ))}
                </div>
                <DonutChart value={data.statusCounts[0]} total={data.statusTotal} color="hsl(var(--sts-accent))" />
              </div>
            </section>
          ),
        },
        "daily-kpis": {
          span: 6,
          content: (
            <section
              className="report-card"
              draggable
              onDragStart={() => setDragging("daily-kpis")}
              onDragEnd={() => setDragging(null)}
            >
              <div className="report-card-header">
                <div>
                  <h2 className="report-card-title">KPIs diarios</h2>
                  <p className="report-subtitle">Promedio diario por KPI (7 días)</p>
                </div>
                <div className="report-card-action report-drag-handle">
                  <span>Arrastrar</span>
                </div>
              </div>
              <div className="mt-4 report-legend">
                {data.dailySeries.map((series) => (
                  <span key={series.name} className="report-pill" style={{ color: series.color }}>
                    {series.name}
                  </span>
                ))}
              </div>
              <div className="report-chart">
                <MiniBarChart labels={data.dayLabels} series={data.dailySeries} />
              </div>
            </section>
          ),
        },
        availability: {
          span: 6,
          content: (
            <section
              className="report-card"
              draggable
              onDragStart={() => setDragging("availability")}
              onDragEnd={() => setDragging(null)}
            >
              <div className="report-card-header">
                <div>
                  <h2 className="report-card-title">Disponibilidad semanal</h2>
                  <p className="report-subtitle">Promedio por semana</p>
                </div>
                <div className="report-card-action report-drag-handle">
                  <span>Arrastrar</span>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="report-metric">
                  <span className="report-metric-value">
                    <AnimatedNumber value={avg(data.availabilitySeries)} suffix="%" />
                  </span>
                  <span className="report-metric-label">Promedio</span>
                </div>
                <span className="report-pill" style={{ color: "hsl(var(--sts-accent))" }}>
                  Últimas {data.availabilitySeries.length} semanas
                </span>
              </div>
              <div className="report-chart">
                <MiniLineChart
                  labels={data.weekLabels}
                  series={[
                    { name: "Disponibilidad", color: "hsl(var(--sts-accent))", values: data.availabilitySeries },
                  ]}
                />
              </div>
            </section>
          ),
        },
        severity: {
          span: 6,
          content: (
            <section
              className="report-card"
              draggable
              onDragStart={() => setDragging("severity")}
              onDragEnd={() => setDragging(null)}
            >
              <div className="report-card-header">
                <div>
                  <h2 className="report-card-title">Prioridad / Severidad</h2>
                  <p className="report-subtitle">Distribución de severidades</p>
                </div>
                <div className="report-card-action report-drag-handle">
                  <span>Arrastrar</span>
                </div>
              </div>
              <div className="mt-4 grid gap-3">
                {data.severityLabels.map((label, idx) => (
                  <div key={label} className="flex items-center justify-between rounded-2xl border px-4 py-3">
                    <span className="text-sm font-medium">{label}</span>
                    <span className="text-sm text-muted-foreground">
                      <AnimatedNumber value={data.severityCounts[idx]} /> tickets
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ),
        },
        breaches: {
          span: 6,
          content: (
            <section
              className="report-card"
              draggable
              onDragStart={() => setDragging("breaches")}
              onDragEnd={() => setDragging(null)}
            >
              <div className="report-card-header">
                <div>
                  <h2 className="report-card-title">Brechas SLA</h2>
                  <p className="report-subtitle">Últimos {data.rangeDays} días</p>
                </div>
                <div className="report-card-action report-drag-handle">
                  <span>Arrastrar</span>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                <div className="report-metric">
                  <span className="report-metric-value">
                    <AnimatedNumber value={data.totalBreaches} />
                  </span>
                  <span className="report-metric-label">Tickets con incumplimiento</span>
                </div>
                <div className="report-metric">
                  <span className="report-metric-value">
                    <AnimatedNumber
                      value={
                        data.totalTickets
                          ? Math.round(((data.totalTickets - data.totalBreaches) / data.totalTickets) * 100)
                          : 0
                      }
                      suffix="%"
                    />
                  </span>
                  <span className="report-metric-label">Cumplimiento general</span>
                </div>
              </div>
              <div className="report-chart">
                <div className="grid gap-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>Respuesta / Resolución</span>
                    <span className="text-muted-foreground">{data.totalTickets} tickets</span>
                  </div>
                  <div className="h-3 w-full rounded-full" style={{ background: "hsl(var(--muted))" }}>
                    <div
                      className="h-3 rounded-full"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round(
                            ((data.totalTickets - data.totalBreaches) / Math.max(1, data.totalTickets)) * 100
                          )
                        )}%`,
                        background: "hsl(var(--sts-accent-2))",
                      }}
                    />
                  </div>
                </div>
              </div>
            </section>
          ),
        },
        "component-severity": {
          span: 12,
          content: (
            <section
              className="report-card"
              draggable
              onDragStart={() => setDragging("component-severity")}
              onDragEnd={() => setDragging(null)}
            >
              <div className="report-card-header">
                <div>
                  <h2 className="report-card-title">Cumplimiento SLA por componente y severidad</h2>
                  <p className="report-subtitle">Últimos {data.rangeDays} días</p>
                </div>
                <div className="report-card-action report-drag-handle">
                  <span>Arrastrar</span>
                </div>
              </div>
              <div className="mt-4 overflow-auto">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Componente</th>
                      <th>Severidad</th>
                      <th>Cumpl. respuesta</th>
                      <th>Cumpl. resolución</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.componentSeverityRows.map((row, idx) => (
                      <tr key={`${row.component}-${idx}`}>
                        <td>{row.component}</td>
                        <td>{row.severity}</td>
                        <td>
                          <AnimatedNumber value={row.response} suffix="%" />
                        </td>
                        <td>
                          <AnimatedNumber value={row.resolution} suffix="%" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ),
        },
        "daily-table": {
          span: 12,
          content: (
            <section
              className="report-card"
              draggable
              onDragStart={() => setDragging("daily-table")}
              onDragEnd={() => setDragging(null)}
            >
              <div className="report-card-header">
                <div>
                  <h2 className="report-card-title">KPIs diarios (detalle)</h2>
                  <p className="report-subtitle">Transmisión, captura y grabación</p>
                </div>
                <div className="report-card-action report-drag-handle">
                  <span>Arrastrar</span>
                </div>
              </div>
              <div className="mt-4 overflow-auto">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Componente</th>
                      <th>KPI</th>
                      <th>Fecha</th>
                      <th>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.dailyKpiRows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.component}</td>
                        <td>{row.metric}</td>
                        <td>{row.date}</td>
                        <td>{row.value}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ),
        },
      }) satisfies Record<PanelId, { span: 6 | 12; content: JSX.Element }>,
    [data]
  );

  const orderedPanels = order.map((id) => ({ id, ...panels[id] }));

  const handleDrop = (targetId: PanelId) => {
    if (!dragging || dragging === targetId) return;
    const next = order.filter((id) => id !== dragging);
    const targetIndex = next.indexOf(targetId);
    next.splice(targetIndex, 0, dragging);
    setOrder(next);
  };

  return (
    <div className={isPending ? "report-pending" : ""}>
      <div className="flex flex-wrap items-center justify-between gap-4 fade-up">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Reportes STS</h1>
          <p className="text-sm text-muted-foreground">Panel visual de SLA y KPIs.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="app-pill text-xs">
            {data.since} - {data.now}
          </span>
          <label className="report-filter cursor-pointer">
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(event) => handleUpload(event.target.files?.[0])}
              disabled={uploading}
            />
            {uploading ? "Importando..." : "Importar telemetría"}
          </label>
          <div className="flex items-center gap-2">
            {[7, 30, 90].map((days) => (
              <button
                key={days}
                type="button"
                className={`report-filter ${data.rangeDays === days ? "report-filter-active" : ""}`}
                onClick={() => handleRangeChange(days)}
                disabled={isPending}
              >
                {days} días
              </button>
            ))}
          </div>
          <Link className="sts-btn-ghost" href="/api/sts/reports/tickets">
            Exportar CSV
          </Link>
          <Link className="sts-btn-primary" href="/api/sts/reports/tickets?format=xlsx">
            Exportar Excel
          </Link>
          <Link className="sts-btn-ghost" href="/api/sts/reports/missing-kpis">
            Exportar KPIs faltantes
          </Link>
          <Link className="sts-btn-ghost" href="/api/sts/reports/telemetry-template">
            Exportar plantilla telemetría
          </Link>
          <Link className="sts-btn-ghost" href="/api/sts/reports/telemetry-export">
            Exportar telemetría cargada
          </Link>
          <button
            type="button"
            className="sts-btn-ghost"
            onClick={() => fetch("/api/sts/reports/telemetry-recompute", { method: "POST" })}
          >
            Recalcular KPIs telemetría
          </button>
        </div>
      </div>

      {uploadMessage ? (
        <div className="report-card mt-4">
          <p className="text-sm">{uploadMessage}</p>
        </div>
      ) : null}

      <div className="report-board mt-6">
        {orderedPanels.map((panel) => (
          <div
            key={panel.id}
            className={`report-panel report-span-${panel.span} ${dragging === panel.id ? "report-dragging" : ""}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => handleDrop(panel.id)}
          >
            {panel.content}
          </div>
        ))}
      </div>
    </div>
  );
}
