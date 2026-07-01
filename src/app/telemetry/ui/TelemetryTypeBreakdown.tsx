"use client";

import * as React from "react";
import { AlertTriangle, Radio } from "lucide-react";

type EventRow = { code: string; label: string; total: number };
type AlarmRow = { code: string; label: string; levelCode?: string; levelLabel?: string; total: number };

function nfmt(n: number) {
  return new Intl.NumberFormat("es-CO").format(Math.round(n ?? 0));
}

function List({
  title,
  Icon,
  color,
  rows,
}: {
  title: string;
  Icon: React.ComponentType<{ className?: string }>;
  color: string;
  rows: { code: string; label: string; total: number }[];
}) {
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
        <div className="max-h-[360px] space-y-1.5 overflow-auto pr-1">
          {rows.map((r) => (
            <div key={r.code} className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-xs font-semibold" style={{ color }}>
                {r.code}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-slate-600" title={r.label}>
                {r.label}
              </span>
              <span className="hidden h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-slate-100 sm:inline-block">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${(r.total / max) * 100}%`, backgroundColor: color }}
                />
              </span>
              <span className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums">{nfmt(r.total)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TelemetryTypeBreakdown({
  events,
  alarms,
  busLabel,
}: {
  events: EventRow[];
  alarms: AlarmRow[];
  busLabel?: string | null;
}) {
  const eventRows = React.useMemo(
    () =>
      [...events]
        .filter((e) => e.total > 0)
        .sort((a, b) => b.total - a.total)
        .map((e) => ({ code: e.code, label: e.label, total: e.total })),
    [events]
  );

  const alarmRows = React.useMemo(() => {
    const m = new Map<string, { code: string; label: string; total: number }>();
    for (const a of alarms) {
      if (a.total <= 0) continue;
      const e = m.get(a.code) ?? { code: a.code, label: a.label, total: 0 };
      e.total += a.total;
      m.set(a.code, e);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [alarms]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Qué eventos y qué alarmas</h2>
        <span className="text-xs text-muted-foreground">{busLabel ? busLabel : "toda la flota"}</span>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <List title="Eventos por tipo" Icon={Radio} color="#b45309" rows={eventRows} />
        <List title="Alarmas por tipo" Icon={AlertTriangle} color="#b91c1c" rows={alarmRows} />
      </div>
    </section>
  );
}
