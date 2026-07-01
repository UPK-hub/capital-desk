"use client";

import * as React from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Radio, Timer, X } from "lucide-react";

type Row = { code: string; label: string; total: number };
type AlarmRow = Row & { levelCode?: string; levelLabel?: string };
type SeriesType = "eventos" | "alarmas" | "periodicas";

function nfmt(n: number) {
  return new Intl.NumberFormat("es-CO").format(Math.round(n ?? 0));
}
function dmy(iso: string) {
  const p = String(iso).split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}` : iso;
}

export default function TelemetryTypeBreakdown({
  events,
  alarms,
  periodicas,
  busLabel,
  start,
  end,
  busId,
}: {
  events: Row[];
  alarms: AlarmRow[];
  periodicas: Row[];
  busLabel?: string | null;
  start: string;
  end: string;
  busId: string | null;
}) {
  const [sel, setSel] = React.useState<{ type: SeriesType; code: string; label: string; color: string } | null>(null);
  const [perDay, setPerDay] = React.useState<{ date: string; total: number }[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const eventRows = React.useMemo(
    () => [...events].filter((e) => e.total > 0).sort((a, b) => b.total - a.total),
    [events]
  );
  const alarmRows = React.useMemo(() => {
    const m = new Map<string, Row>();
    for (const a of alarms) {
      if (a.total <= 0) continue;
      const e = m.get(a.code) ?? { code: a.code, label: a.label, total: 0 };
      e.total += a.total;
      m.set(a.code, e);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [alarms]);
  const periRows = React.useMemo(() => periodicas.filter((p) => p.total > 0), [periodicas]);

  // Si cambia el rango o el bus, se limpia la selección.
  React.useEffect(() => {
    setSel(null);
    setPerDay(null);
  }, [start, end, busId]);

  React.useEffect(() => {
    if (!sel) return;
    let alive = true;
    setLoading(true);
    setError(null);
    setPerDay(null);
    const p = new URLSearchParams();
    p.set("type", sel.type);
    if (start) p.set("start", start);
    if (end) p.set("end", end);
    if (busId) p.set("busId", busId);
    p.set("code", sel.code);
    fetch(`/api/telemetry/series?${p.toString()}`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`Error ${r.status}`);
        return r.json();
      })
      .then((j: any) => {
        if (alive) setPerDay(j.perDay ?? []);
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
  }, [sel, start, end, busId]);

  const total = (perDay ?? []).reduce((a, b) => a + b.total, 0);

  const listCard = (
    title: string,
    Icon: React.ComponentType<{ className?: string }>,
    color: string,
    type: SeriesType,
    rows: Row[]
  ) => {
    const max = rows.reduce((m, r) => Math.max(m, r.total), 1);
    return (
      <div className="sts-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${color}1f`, color }}
          >
            <Icon className="h-4 w-4" />
          </span>
          <h3 className="text-sm font-semibold">{title}</h3>
          <span className="ml-auto text-xs text-muted-foreground">{rows.length} tipos</span>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin datos en el rango.</p>
        ) : (
          <div className="max-h-[360px] space-y-0.5 overflow-auto pr-1">
            {rows.map((r) => {
              const on = sel?.type === type && sel?.code === r.code;
              return (
                <button
                  key={r.code}
                  type="button"
                  onClick={() => setSel({ type, code: r.code, label: r.label, color })}
                  className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition ${
                    on ? "" : "hover:bg-muted/40"
                  }`}
                  style={on ? { backgroundColor: `${color}14`, boxShadow: `inset 3px 0 0 ${color}` } : undefined}
                  title="Ver comportamiento día a día"
                >
                  <span className="w-14 shrink-0 text-xs font-semibold" style={{ color }}>
                    {r.code}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-slate-600" title={r.label}>
                    {r.label}
                  </span>
                  <span className="hidden h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-slate-100 sm:inline-block">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${(r.total / max) * 100}%`, backgroundColor: color }}
                    />
                  </span>
                  <span className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums">{nfmt(r.total)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Qué eventos y qué alarmas</h2>
          <p className="text-xs text-muted-foreground">Clic en un tipo para ver su comportamiento día a día</p>
        </div>
        <span className="text-xs text-muted-foreground">{busLabel ? busLabel : "toda la flota"}</span>
      </div>

      {sel ? (
        <div className="sts-card p-5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span
                className="rounded-md px-1.5 py-0.5 text-xs font-semibold"
                style={{ backgroundColor: `${sel.color}1f`, color: sel.color }}
              >
                {sel.code}
              </span>
              {sel.label}
              <span className="text-xs font-normal text-muted-foreground">· {nfmt(total)} en el rango</span>
            </div>
            <button
              type="button"
              onClick={() => setSel(null)}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-white px-2 text-xs text-muted-foreground hover:bg-muted/40"
            >
              <X className="h-3.5 w-3.5" /> Cerrar
            </button>
          </div>
          {error ? (
            <p className="text-sm text-red-700">No se pudo cargar: {error}</p>
          ) : loading ? (
            <p className="text-sm text-muted-foreground">Cargando gráfica…</p>
          ) : (
            <div style={{ width: "100%", height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={perDay ?? []} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="tb-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={sel.color} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={sel.color} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={dmy}
                    interval="preserveStartEnd"
                    minTickGap={20}
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    tickLine={false}
                    axisLine={{ stroke: "#e2e8f0" }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    tickFormatter={(v: number) => nfmt(v)}
                  />
                  <Tooltip
                    formatter={(v: number) => [nfmt(v), sel.label]}
                    labelFormatter={(l: string) => `Día ${dmy(String(l))}`}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                  />
                  <Area type="monotone" dataKey="total" stroke={sel.color} strokeWidth={2} fill="url(#tb-grad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        {listCard("Eventos por tipo", Radio, "#b45309", "eventos", eventRows)}
        {listCard("Alarmas por tipo", AlertTriangle, "#b91c1c", "alarmas", alarmRows)}
        {listCard("Periódicas por tipo", Timer, "#0891b2", "periodicas", periRows)}
      </div>
    </section>
  );
}
