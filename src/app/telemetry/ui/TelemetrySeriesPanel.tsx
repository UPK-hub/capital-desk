"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, AlertTriangle, BarChart3, Bus as BusIcon, CalendarClock, Timer, X } from "lucide-react";

type DayPoint = { date: string; total: number };
type BusPoint = { busCode: string; total: number };
type DaySplit = { date: string; P20: number; P60: number };
type Series = {
  type: string;
  code: string | null;
  total: number;
  perDay: DayPoint[];
  perBus: BusPoint[];
  perDaySplit?: DaySplit[];
};

type FilterOption = { value: string; label: string };
type Breakdown = { code: string; label: string; total: number };
type DonutSlice = { name: string; value: number; color: string };

function nfmt(n: number) {
  return new Intl.NumberFormat("es-CO").format(Math.round(n ?? 0));
}

function dmy(iso: string) {
  const p = iso.split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}` : iso;
}

function Stat({
  label,
  value,
  sub,
  color,
  Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="sts-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${color}1f`, color }}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 truncate text-xl font-semibold tabular-nums" style={{ color }} title={value}>
        {value}
      </p>
      {sub ? <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={sub}>{sub}</p> : null}
    </div>
  );
}

function ChartCard({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="sts-card p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

export default function TelemetrySeriesPanel({
  type,
  noun,
  start,
  end,
  busId,
  busLabel,
  filterOptions,
  breakdown,
  breakdownTitle,
  donut,
  donutTitle,
}: {
  type: "eventos" | "alarmas" | "periodicas";
  noun: string;
  start: string;
  end: string;
  busId: string | null;
  busLabel?: string | null;
  filterOptions: FilterOption[];
  breakdown?: Breakdown[];
  breakdownTitle?: string;
  donut?: DonutSlice[];
  donutTitle?: string;
}) {
  const [data, setData] = React.useState<Series | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [code, setCode] = React.useState<string>("");

  const main = type === "alarmas" ? "#dc2626" : type === "periodicas" ? "#0891b2" : "#2563eb";
  const accent = type === "alarmas" ? "#f87171" : type === "periodicas" ? "#22d3ee" : "#60a5fa";
  const gridColor = "#e2e8f0";

  const qs = React.useMemo(() => {
    const p = new URLSearchParams();
    p.set("type", type);
    if (start) p.set("start", start);
    if (end) p.set("end", end);
    if (busId) p.set("busId", busId);
    if (code) p.set("code", code);
    return p.toString();
  }, [type, start, end, busId, code]);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(`/api/telemetry/series?${qs}`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`Error ${r.status}`);
        return r.json();
      })
      .then((j: Series) => {
        if (alive) setData(j);
      })
      .catch((e) => {
        if (alive) setError(e?.message || "No se pudo cargar");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [qs]);

  const perDay = data?.perDay ?? [];
  const perBus = (data?.perBus ?? []).slice(0, 12);
  const total = data?.total ?? 0;
  const avgDay = perDay.length ? Math.round(total / perDay.length) : 0;
  const peak = perDay.reduce<DayPoint | null>((best, d) => (!best || d.total > best.total ? d : best), null);
  const topBus = perBus[0] ?? null;

  const selectedLabel = code ? filterOptions.find((o) => o.value === code)?.label ?? code : null;
  const titleNoun = type === "alarmas" ? "Alarmas" : type === "periodicas" ? "Periódicas" : "Eventos";

  const dayTickInterval = perDay.length > 14 ? Math.ceil(perDay.length / 8) : 0;
  const busBarHeight = Math.max(160, perBus.length * 26 + 24);
  const breakdownData = breakdown ?? [];
  const breakdownHeight = Math.max(180, breakdownData.length * 24 + 24);
  const donutData = (donut ?? []).filter((d) => d.value > 0);

  const p20Total = (data?.perDaySplit ?? []).reduce((a, b) => a + b.P20, 0);
  const p60Total = (data?.perDaySplit ?? []).reduce((a, b) => a + b.P60, 0);

  const areaBlock = (dataset: any[], key: string, title: string, color: string, hint?: string) => {
    const name = key === "total" ? selectedLabel ?? titleNoun : key;
    return (
      <ChartCard title={title} hint={hint}>
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dataset} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={dmy}
                interval={dayTickInterval}
                tick={{ fontSize: 11, fill: "#64748b" }}
                tickLine={false}
                axisLine={{ stroke: gridColor }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#64748b" }}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(v: number) => nfmt(v)}
              />
              <Tooltip
                formatter={(v: number) => [nfmt(v), name]}
                labelFormatter={(l: string) => `Día ${dmy(String(l))}`}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${gridColor}` }}
              />
              <Area type="monotone" dataKey={key} stroke={color} strokeWidth={2} fill={`url(#grad-${key})`} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{titleNoun}</h2>
          <p className="text-xs text-muted-foreground">
            Comportamiento por día y por bus · {busLabel ? busLabel : "toda la flota"}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={`Total ${noun}`}
          value={nfmt(total)}
          color={main}
          Icon={type === "alarmas" ? AlertTriangle : type === "periodicas" ? Timer : Activity}
          sub={selectedLabel ? `filtro: ${code}` : "en el rango"}
        />
        <Stat label="Promedio por día" value={nfmt(avgDay)} color="#0891b2" Icon={CalendarClock} sub={`${perDay.length} días`} />
        <Stat
          label="Día pico"
          value={peak && peak.total > 0 ? nfmt(peak.total) : "—"}
          sub={peak && peak.total > 0 ? dmy(peak.date) : "sin datos"}
          color="#7c3aed"
          Icon={BarChart3}
        />
        <Stat
          label="Bus con más"
          value={topBus ? topBus.busCode : "—"}
          sub={topBus ? `${nfmt(topBus.total)}` : "sin datos"}
          color="#b45309"
          Icon={BusIcon}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Filtrar volumen por tipo:</span>
        <select
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="h-9 rounded-md border border-border bg-white px-2 text-sm text-foreground"
        >
          <option value="">Todos</option>
          {filterOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {code ? (
          <button
            type="button"
            onClick={() => setCode("")}
            className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-white px-2.5 text-xs text-muted-foreground hover:bg-muted/40"
          >
            <X className="h-3.5 w-3.5" /> Quitar filtro
          </button>
        ) : null}
      </div>

      {error ? <div className="sts-card p-4 text-sm text-red-700">No se pudo cargar: {error}</div> : null}

      {loading ? (
        <div className="sts-card p-6 text-sm text-muted-foreground">Cargando gráficas…</div>
      ) : (
        <>
          {type === "periodicas" && data?.perDaySplit ? (
            <div className="grid gap-6 xl:grid-cols-2">
              {areaBlock(data.perDaySplit, "P20", "Volumen P20 por día (cada 20 s)", "#2563eb", `${nfmt(p20Total)} en total`)}
              {areaBlock(data.perDaySplit, "P60", "Volumen P60 por día (cada 60 s)", "#0891b2", `${nfmt(p60Total)} en total`)}
            </div>
          ) : (
            areaBlock(
              perDay,
              "total",
              selectedLabel ? `Volumen por día · ${selectedLabel}` : `Volumen de ${noun} por día`,
              main,
              `${nfmt(total)} en total`
            )
          )}

          <div className="grid gap-6 xl:grid-cols-2">
            <ChartCard title={`${titleNoun} por bus (top 12)`}>
              <div style={{ width: "100%", height: busBarHeight }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={perBus} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={{ stroke: gridColor }} tickFormatter={(v: number) => nfmt(v)} />
                    <YAxis type="category" dataKey="busCode" width={70} tick={{ fontSize: 11, fill: "#334155" }} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(v: number) => [nfmt(v), selectedLabel ?? titleNoun]} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${gridColor}` }} />
                    <Bar dataKey="total" fill={main} radius={[0, 4, 4, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            {breakdownData.length > 0 ? (
              <ChartCard title={breakdownTitle ?? "Por tipo"} hint="clic para filtrar">
                <div style={{ width: "100%", height: breakdownHeight }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={breakdownData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={{ stroke: gridColor }} tickFormatter={(v: number) => nfmt(v)} />
                      <YAxis type="category" dataKey="code" width={48} tick={{ fontSize: 11, fill: "#334155" }} tickLine={false} axisLine={false} />
                      <Tooltip
                        formatter={(v: number) => [nfmt(v), "Total"]}
                        labelFormatter={(c: string) => {
                          const found = breakdownData.find((d) => d.code === c);
                          return found ? `${c} · ${found.label}` : String(c);
                        }}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${gridColor}` }}
                      />
                      <Bar
                        dataKey="total"
                        radius={[0, 4, 4, 0]}
                        barSize={12}
                        cursor="pointer"
                        onClick={(d: any) => {
                          const c = d?.code ?? d?.payload?.code ?? "";
                          setCode((prev) => (prev === c ? "" : c));
                        }}
                      >
                        {breakdownData.map((d) => (
                          <Cell key={d.code} fill={code && code !== d.code ? "#cbd5e1" : code === d.code ? main : accent} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>
            ) : donutData.length > 0 ? (
              <ChartCard title={donutTitle ?? "Distribución"}>
                <div style={{ width: "100%", height: 290 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={70} outerRadius={110} paddingAngle={2}>
                        {donutData.map((d, i) => (
                          <Cell key={i} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number, n: string) => [nfmt(v), n]} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${gridColor}` }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>
            ) : null}
          </div>

          {breakdownData.length > 0 && donutData.length > 0 ? (
            <ChartCard title={donutTitle ?? "Distribución"}>
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={70} outerRadius={110} paddingAngle={2}>
                      {donutData.map((d, i) => (
                        <Cell key={i} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number, n: string) => [nfmt(v), n]} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${gridColor}` }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          ) : null}
        </>
      )}
    </div>
  );
}
