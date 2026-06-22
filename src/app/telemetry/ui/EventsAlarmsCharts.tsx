"use client";

import * as React from "react";
import { Activity, AlertTriangle, Radio, TriangleAlert } from "lucide-react";

export type EventBar = { n: number; code: string; label: string; total: number };
export type AlarmBar = {
  n: number;
  code: string;
  label: string;
  total: number;
  levels: Map<string, number>;
};

const LEVEL_STYLE: Record<string, { label: string; color: string }> = {
  N1: { label: "N1 · Crítico superior", color: "#b91c1c" },
  N2: { label: "N2 · Tolerable superior", color: "#ea580c" },
  N3: { label: "N3 · Normal", color: "#94a3b8" },
  N4: { label: "N4 · Tolerable inferior", color: "#d97706" },
  N5: { label: "N5 · Crítico inferior", color: "#2563eb" },
};
const LEVEL_ORDER = ["N1", "N2", "N3", "N4", "N5"];

function nfmt(n: number) {
  return new Intl.NumberFormat("es-CO").format(n ?? 0);
}

function orderedLevels(levels: Map<string, number>) {
  const known = LEVEL_ORDER.filter((k) => (levels.get(k) ?? 0) > 0).map((k) => ({
    code: k,
    count: levels.get(k) ?? 0,
    color: LEVEL_STYLE[k].color,
  }));
  const extra = Array.from(levels.entries())
    .filter(([k, v]) => v > 0 && !LEVEL_ORDER.includes(k))
    .map(([k, v]) => ({ code: k, count: v, color: "#cbd5e1" }));
  return [...known, ...extra];
}

function Highlight({
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

function Donut({
  data,
  size = 132,
  thickness = 18,
}: {
  data: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
}) {
  const total = data.reduce((a, b) => a + b.value, 0);
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  let off = 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="shrink-0" role="img" aria-label="Distribución de alarmas por nivel">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f7" strokeWidth={thickness} />
      {total > 0 &&
        data.map((d, i) => {
          const seg = C * (d.value / total);
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth={thickness}
              strokeDasharray={`${seg} ${C - seg}`}
              strokeDashoffset={-off}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          off += seg;
          return el;
        })}
      <text x="50%" y="47%" textAnchor="middle" style={{ fontSize: "16px", fontWeight: 600, fill: "#0f172a" }}>
        {nfmt(total)}
      </text>
      <text x="50%" y="61%" textAnchor="middle" style={{ fontSize: "10px", fill: "#64748b" }}>
        alarmas
      </text>
    </svg>
  );
}

export default function EventsAlarmsCharts({
  events,
  eventsTotal,
  alarms,
  alarmsTotal,
}: {
  events: EventBar[];
  eventsTotal: number;
  alarms: AlarmBar[];
  alarmsTotal: number;
}) {
  const maxEvent = Math.max(1, ...events.map((e) => e.total));
  const maxAlarm = Math.max(1, ...alarms.map((a) => a.total));

  const topEvent = events.reduce<EventBar | null>((best, e) => (!best || e.total > best.total ? e : best), null);
  const topAlarm = alarms.reduce<AlarmBar | null>((best, a) => (!best || a.total > best.total ? a : best), null);

  const levelTotals = new Map<string, number>();
  for (const a of alarms) {
    for (const [k, v] of a.levels.entries()) levelTotals.set(k, (levelTotals.get(k) ?? 0) + v);
  }
  const donutData = orderedLevels(levelTotals).map((l) => ({
    label: LEVEL_STYLE[l.code]?.label ?? l.code,
    value: l.count,
    color: l.color,
  }));
  const levelGrand = donutData.reduce((a, b) => a + b.value, 0);

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold">Eventos y alarmas</h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Highlight label="Total eventos" value={nfmt(eventsTotal)} color="#b45309" Icon={Radio} sub="tipo 2 · ocasionales" />
        <Highlight
          label="Evento más frecuente"
          value={topEvent && topEvent.total > 0 ? `${topEvent.code} · ${nfmt(topEvent.total)}` : "—"}
          sub={topEvent && topEvent.total > 0 ? topEvent.label : "sin datos"}
          color="#2563eb"
          Icon={Activity}
        />
        <Highlight label="Total alarmas" value={nfmt(alarmsTotal)} color="#b91c1c" Icon={AlertTriangle} sub="tipo 3 · fuera de rango" />
        <Highlight
          label="Alarma más frecuente"
          value={topAlarm && topAlarm.total > 0 ? `${topAlarm.code} · ${nfmt(topAlarm.total)}` : "—"}
          sub={topAlarm && topAlarm.total > 0 ? topAlarm.label : "sin datos"}
          color="#7c3aed"
          Icon={TriangleAlert}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="sts-card p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Eventos por número (EV1–EV18)</h3>
            <span className="text-xs text-muted-foreground">Total: {nfmt(eventsTotal)}</span>
          </div>
          <div className="space-y-2">
            {events.map((e) => {
              const w = Math.round((e.total / maxEvent) * 100);
              const isTop = topEvent && e.code === topEvent.code && e.total > 0;
              return (
                <div key={e.code} className="flex items-center gap-2.5">
                  <span className="flex h-6 w-11 shrink-0 items-center justify-center rounded-md bg-[#eef2f7] text-[11px] font-semibold tabular-nums text-slate-600">
                    {e.code}
                  </span>
                  <span className="hidden w-40 shrink-0 truncate text-xs text-muted-foreground sm:block" title={e.label}>
                    {e.label}
                  </span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#eef2f7]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${w}%`, backgroundColor: isTop ? "#1d4ed8" : "#60a5fa" }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right text-xs font-semibold tabular-nums">{nfmt(e.total)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="sts-card p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Alarmas por número (ALA1–ALA7)</h3>
            <span className="text-xs text-muted-foreground">Total: {nfmt(alarmsTotal)}</span>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Donut data={donutData} />
            <div className="flex-1 space-y-1.5">
              {donutData.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin alarmas en el rango.</p>
              ) : (
                donutData.map((d) => {
                  const pct = levelGrand ? Math.round((d.value / levelGrand) * 100) : 0;
                  return (
                    <div key={d.label} className="flex items-center gap-2 text-xs">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: d.color }} />
                      <span className="flex-1 truncate text-muted-foreground" title={d.label}>{d.label}</span>
                      <span className="tabular-nums font-medium">{nfmt(d.value)}</span>
                      <span className="w-9 text-right tabular-nums text-muted-foreground">{pct}%</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="space-y-2 border-t border-border/50 pt-3">
            {alarms.map((a) => {
              const barPct = Math.round((a.total / maxAlarm) * 100);
              const segs = orderedLevels(a.levels);
              return (
                <div key={a.code} className="flex items-center gap-2.5">
                  <span className="flex h-6 w-12 shrink-0 items-center justify-center rounded-md bg-[#eef2f7] text-[11px] font-semibold text-slate-600">
                    {a.code}
                  </span>
                  <span className="hidden w-36 shrink-0 truncate text-xs text-muted-foreground sm:block" title={a.label}>
                    {a.label}
                  </span>
                  <div className="h-3.5 flex-1 overflow-hidden rounded-full bg-[#eef2f7]">
                    <div className="flex h-full" style={{ width: `${barPct}%` }}>
                      {a.total > 0 &&
                        segs.map((s) => (
                          <div
                            key={s.code}
                            style={{ width: `${(s.count / a.total) * 100}%`, backgroundColor: s.color }}
                            title={`${s.code}: ${nfmt(s.count)}`}
                          />
                        ))}
                    </div>
                  </div>
                  <span className="w-16 shrink-0 text-right text-xs font-semibold tabular-nums">{nfmt(a.total)}</span>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-muted-foreground">
            Cada barra muestra la distribución por nivel (N1 a N5) de esa alarma.
          </p>
        </div>
      </div>
    </section>
  );
}
