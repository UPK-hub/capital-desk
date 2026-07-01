"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowUp, BarChart3, ChevronsUpDown, Download, Search } from "lucide-react";

export type BusBreakdownRow = {
  busCode: string;
  tramas: number;
  p20: number;
  p60: number;
  eventos: number;
  alarmas: number;
  total: number;
};

type MetricKey = "total" | "tramas" | "p20" | "p60" | "eventos" | "alarmas";

const METRICS: { key: MetricKey; label: string; color: string }[] = [
  { key: "total", label: "Total", color: "#0f172a" },
  { key: "tramas", label: "Tramas", color: "#4f46e5" },
  { key: "p20", label: "P20", color: "#2563eb" },
  { key: "p60", label: "P60", color: "#0891b2" },
  { key: "eventos", label: "Eventos", color: "#b45309" },
  { key: "alarmas", label: "Alarmas", color: "#b91c1c" },
];

function nfmt(n: number) {
  return new Intl.NumberFormat("es-CO").format(Math.round(n ?? 0));
}

export default function TelemetryBusBreakdown({
  rows,
  busLabel,
  exportHref,
}: {
  rows: BusBreakdownRow[];
  busLabel?: string | null;
  exportHref?: string;
}) {
  const [metric, setMetric] = React.useState<MetricKey>("total");
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<{ key: MetricKey | "busCode"; dir: "asc" | "desc" }>({
    key: "total",
    dir: "desc",
  });

  const active = METRICS.find((m) => m.key === metric)!;
  const gridColor = "#e2e8f0";

  const fleet = React.useMemo(() => {
    const acc: Record<MetricKey, number> = { total: 0, tramas: 0, p20: 0, p60: 0, eventos: 0, alarmas: 0 };
    for (const r of rows) {
      acc.tramas += r.tramas;
      acc.p20 += r.p20;
      acc.p60 += r.p60;
      acc.eventos += r.eventos;
      acc.alarmas += r.alarmas;
      acc.total += r.total;
    }
    return acc;
  }, [rows]);

  const maxByKey = React.useMemo(() => {
    const m: Record<string, number> = { tramas: 1, p20: 1, p60: 1, eventos: 1, alarmas: 1, total: 1 };
    for (const r of rows) {
      m.tramas = Math.max(m.tramas, r.tramas);
      m.p20 = Math.max(m.p20, r.p20);
      m.p60 = Math.max(m.p60, r.p60);
      m.eventos = Math.max(m.eventos, r.eventos);
      m.alarmas = Math.max(m.alarmas, r.alarmas);
      m.total = Math.max(m.total, r.total);
    }
    return m;
  }, [rows]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => r.busCode.toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  const sorted = React.useMemo(() => {
    const arr = [...filtered];
    const dir = sort.dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (sort.key === "busCode") return a.busCode.localeCompare(b.busCode) * dir;
      return (((a[sort.key] as number) ?? 0) - ((b[sort.key] as number) ?? 0)) * dir;
    });
    return arr;
  }, [filtered, sort]);

  const chartData = React.useMemo(
    () => [...rows].sort((a, b) => (b[metric] as number) - (a[metric] as number)).slice(0, 15),
    [rows, metric]
  );
  const chartHeight = Math.max(220, chartData.length * 28 + 24);

  const toggleSort = (key: MetricKey | "busCode") =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "busCode" ? "asc" : "desc" }
    );

  const SortIcon = ({ k }: { k: MetricKey | "busCode" }) =>
    sort.key !== k ? (
      <ChevronsUpDown className="inline h-3 w-3 opacity-40" />
    ) : sort.dir === "asc" ? (
      <ArrowUp className="inline h-3 w-3" />
    ) : (
      <ArrowDown className="inline h-3 w-3" />
    );

  const barCols: MetricKey[] = ["tramas", "p20", "p60", "eventos", "alarmas"];

  return (
    <section className="sts-card p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Detalle por bus</h2>
          <p className="text-xs text-muted-foreground">
            Tramas, periódicas, eventos y alarmas por bus · {busLabel ? busLabel : "toda la flota"} · {rows.length} buses
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar bus…"
              className="h-8 w-44 rounded-md border border-border bg-transparent pl-8 pr-2 text-sm outline-none focus:border-foreground"
            />
          </div>
          {exportHref ? (
            <a href={exportHref} className="sts-btn-primary text-sm inline-flex items-center gap-1">
              <Download className="h-4 w-4" /> Excel
            </a>
          ) : null}
        </div>
      </div>

      {/* Tarjetas por métrica: también son el selector del gráfico */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {METRICS.map((m) => {
          const on = metric === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setMetric(m.key)}
              className={`rounded-xl p-3 text-left transition ${
                on ? "border-2 shadow-sm" : "border border-border/60 hover:bg-muted/40"
              }`}
              style={on ? { borderColor: m.color, backgroundColor: `${m.color}0f` } : undefined}
            >
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {m.label}
              </span>
              <span className="mt-0.5 block text-lg font-semibold tabular-nums" style={{ color: m.color }}>
                {nfmt(fleet[m.key])}
              </span>
            </button>
          );
        })}
      </div>

      {/* Gráfico por bus de la métrica seleccionada */}
      <div className="rounded-xl border border-border/50 p-3">
        <div className="mb-1 flex items-center gap-2 text-sm font-medium">
          <BarChart3 className="h-4 w-4" style={{ color: active.color }} />
          {active.label} por bus <span className="text-xs font-normal text-muted-foreground">(top 15)</span>
        </div>
        <div style={{ width: "100%", height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: "#64748b" }}
                tickLine={false}
                axisLine={{ stroke: gridColor }}
                tickFormatter={(v: number) => nfmt(v)}
              />
              <YAxis
                type="category"
                dataKey="busCode"
                width={72}
                tick={{ fontSize: 11, fill: "#334155" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(v: number) => [nfmt(v), active.label]}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${gridColor}` }}
              />
              <Bar dataKey={metric} radius={[0, 4, 4, 0]} barSize={16}>
                {chartData.map((d) => (
                  <Cell key={d.busCode} fill={active.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabla consolidada por bus */}
      <div className="max-h-[520px] overflow-auto rounded-xl border border-border/50">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2">
                <button onClick={() => toggleSort("busCode")} className="inline-flex items-center gap-1">
                  Bus <SortIcon k="busCode" />
                </button>
              </th>
              {barCols.map((k) => {
                const m = METRICS.find((x) => x.key === k)!;
                return (
                  <th key={k} className="px-3 py-2 text-right">
                    <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1">
                      {m.label} <SortIcon k={k} />
                    </button>
                  </th>
                );
              })}
              <th className="px-3 py-2 text-right">
                <button onClick={() => toggleSort("total")} className="inline-flex items-center gap-1">
                  Total <SortIcon k="total" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-muted-foreground">
                  Sin datos para el rango/filtro.
                </td>
              </tr>
            ) : (
              sorted.map((r, i) => (
                <tr key={r.busCode} className={`border-b border-border/40 ${i % 2 ? "bg-muted/20" : ""}`}>
                  <td className="px-3 py-1.5 font-medium">{r.busCode}</td>
                  {barCols.map((k) => {
                    const color = METRICS.find((m) => m.key === k)!.color;
                    const pct = maxByKey[k] > 0 ? (r[k] / maxByKey[k]) * 100 : 0;
                    return (
                      <td key={k} className="px-3 py-1.5">
                        <div className="flex items-center justify-end gap-2">
                          <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-slate-100 sm:inline-block">
                            <span
                              className="block h-full rounded-full"
                              style={{ width: `${pct}%`, backgroundColor: color }}
                            />
                          </span>
                          <span className="w-14 text-right tabular-nums">{nfmt(r[k])}</span>
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{nfmt(r.total)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
