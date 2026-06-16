"use client";

// Tablero de videos interactivo (sin dependencias). Calcula indicadores en
// memoria y permite "desplegar" (drill-down): al tocar un estado muestra las
// solicitudes que están en ese estado, con enlace al detalle.

import * as React from "react";
import Link from "next/link";

type Row = {
  id: string;
  status: string;
  downloadStatus: string;
  origin: string;
  createdAt: string;
  tech: string | null;
  busCode: string;
  caseNo: number | null;
  caseId: string;
  title: string;
};

const CASE_STATUS = [
  { key: "EN_ESPERA", label: "En espera", color: "#f59e0b" },
  { key: "EN_CURSO", label: "En curso", color: "#3b82f6" },
  { key: "COMPLETADO", label: "Completado", color: "#16a34a" },
];

const DOWNLOAD_STATUS = [
  { key: "PENDIENTE", label: "Pendiente", color: "#a1a1aa" },
  { key: "DESCARGA_REALIZADA", label: "Descarga realizada", color: "#16a34a" },
  { key: "DESCARGA_FALLIDA", label: "Descarga fallida", color: "#dc2626" },
  { key: "BUS_NO_EN_PATIO", label: "Bus no en patio", color: "#6366f1" },
];

const ORIGIN = [
  { key: "TRANSMILENIO_SA", label: "TransMilenio S.A.", color: "#2563eb" },
  { key: "INTERVENTORIA", label: "Interventoría", color: "#0891b2" },
  { key: "CAPITAL_BUS", label: "Capital Bus", color: "#7c3aed" },
  { key: "OTRO", label: "Otro", color: "#71717a" },
];

function pct(n: number, total: number) {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

function Bar({
  label,
  count,
  max,
  color,
  onClick,
  active,
}: {
  label: string;
  count: number;
  max: number;
  color: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const width = max > 0 ? Math.round((count / max) * 100) : 0;
  const inner = (
    <>
      <span className="w-36 shrink-0 truncate text-left text-xs text-muted-foreground" title={label}>
        {label}
      </span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
        <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
      <span className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums">{count}</span>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full items-center gap-3 rounded-md px-1 py-1 text-left transition hover:bg-muted/50 ${active ? "bg-muted/50" : ""}`}
      >
        {inner}
      </button>
    );
  }
  return <div className="flex items-center gap-3 px-1">{inner}</div>;
}

export default function VideoDashboard({ rows }: { rows: Row[] }) {
  const [open, setOpen] = React.useState<string | null>(null);
  const total = rows.length;
  const countOf = (field: "status" | "downloadStatus" | "origin", key: string) =>
    rows.filter((r) => r[field] === key).length;

  const caseStatus = CASE_STATUS.map((d) => ({ ...d, count: countOf("status", d.key) }));
  const downloadStatus = DOWNLOAD_STATUS.map((d) => ({ ...d, count: countOf("downloadStatus", d.key) }));
  const origin = ORIGIN.map((d) => ({ ...d, count: countOf("origin", d.key) }));

  // Últimos 6 meses
  const now = new Date();
  const months: { key: string; label: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleDateString("es-CO", { month: "short" }),
      count: 0,
    });
  }
  for (const r of rows) {
    const d = new Date(r.createdAt);
    const m = months.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`);
    if (m) m.count += 1;
  }
  const maxMonth = Math.max(1, ...months.map((m) => m.count));

  const busMap = new Map<string, number>();
  for (const r of rows) busMap.set(r.busCode || "—", (busMap.get(r.busCode || "—") ?? 0) + 1);
  const topBuses = [...busMap.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  const maxBus = Math.max(1, ...topBuses.map((b) => b.count));

  const techMap = new Map<string, number>();
  for (const r of rows) {
    const n = r.tech ?? "Sin asignar";
    techMap.set(n, (techMap.get(n) ?? 0) + 1);
  }
  const byTech = [...techMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  const maxTech = Math.max(1, ...byTech.map((t) => t.count));

  const toggle = (key: string) => setOpen((o) => (o === key ? null : key));

  const allDefs = [
    ...CASE_STATUS.map((d) => ({ ...d, t: "status" as const })),
    ...DOWNLOAD_STATUS.map((d) => ({ ...d, t: "downloadStatus" as const })),
  ];
  const openDef = open ? allDefs.find((d) => `${d.t}:${d.key}` === open) ?? null : null;
  const openRows = openDef ? rows.filter((r) => r[openDef.t] === openDef.key) : [];

  const kpis = [
    { key: null as string | null, label: "Total solicitudes", value: total, color: "#0f172a" },
    { key: "status:EN_ESPERA", label: "En espera", value: caseStatus[0].count, color: "#b45309" },
    { key: "status:EN_CURSO", label: "En curso", value: caseStatus[1].count, color: "#1d4ed8" },
    { key: "status:COMPLETADO", label: "Completado", value: caseStatus[2].count, color: "#15803d" },
  ];

  const W = 520;
  const H = 150;
  const padX = 12;
  const padTop = 22;
  const padBottom = 24;
  const slot = (W - padX * 2) / months.length;
  const barW = Math.min(46, slot * 0.6);
  const chartH = H - padTop - padBottom;

  return (
    <section className="mobile-section-card mobile-section-card__body space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Tablero de videos</h2>
        <span className="text-xs text-muted-foreground">Toca un estado para ver sus solicitudes</span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map((k) => {
          const active = !!k.key && open === k.key;
          const content = (
            <>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: k.color }} />
                <p className="text-xs text-muted-foreground">{k.label}</p>
              </div>
              <p className="mt-2 text-3xl font-semibold tabular-nums" style={{ color: k.color }}>
                {k.value}
              </p>
            </>
          );
          if (k.key) {
            return (
              <button
                key={k.label}
                type="button"
                onClick={() => toggle(k.key as string)}
                className={`rounded-xl border bg-card p-4 text-left transition hover:bg-muted/40 ${active ? "border-border ring-1 ring-border/60" : "border-border/60"}`}
              >
                {content}
              </button>
            );
          }
          return (
            <div key={k.label} className="rounded-xl border border-border/60 bg-card p-4">
              {content}
            </div>
          );
        })}
      </div>

      {/* Drill-down */}
      {openDef ? (
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">
              Solicitudes · {openDef.label} <span className="text-muted-foreground">({openRows.length})</span>
            </p>
            <button type="button" onClick={() => setOpen(null)} className="text-xs text-muted-foreground underline">
              Cerrar
            </button>
          </div>
          {openRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin solicitudes en este estado.</p>
          ) : (
            <div className="divide-y divide-border/50">
              {openRows.slice(0, 60).map((r) => (
                <Link
                  key={r.id}
                  href={`/video-requests/${r.id}`}
                  className="flex items-center justify-between gap-3 rounded px-1 py-2 hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      #{r.caseNo ?? r.caseId} · {r.busCode}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{r.title}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{r.tech ?? "Sin asignar"}</span>
                </Link>
              ))}
            </div>
          )}
          {openRows.length > 60 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              … y {openRows.length - 60} más. Usa la pestaña Solicitudes para verlas todas.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Distribuciones */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <p className="mb-3 text-sm font-semibold">Estado de descarga</p>
          <div className="space-y-1.5">
            {downloadStatus.map((d) => (
              <Bar
                key={d.key}
                label={`${d.label} · ${pct(d.count, total)}%`}
                count={d.count}
                max={total}
                color={d.color}
                onClick={() => toggle(`downloadStatus:${d.key}`)}
                active={open === `downloadStatus:${d.key}`}
              />
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <p className="mb-3 text-sm font-semibold">Por procedencia</p>
          <div className="space-y-2.5 pt-1">
            {origin.map((d) => (
              <Bar key={d.key} label={`${d.label} · ${pct(d.count, total)}%`} count={d.count} max={total} color={d.color} />
            ))}
          </div>
        </div>
      </div>

      {/* Gestión por mes */}
      <div className="rounded-xl border border-border/60 bg-card p-4">
        <p className="text-sm font-semibold">Gestión por mes</p>
        <p className="mb-3 text-xs text-muted-foreground">Solicitudes creadas (últimos 6 meses)</p>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Solicitudes por mes">
          {months.map((m, i) => {
            const h = Math.round((m.count / maxMonth) * chartH);
            const x = padX + slot * i + (slot - barW) / 2;
            const y = padTop + (chartH - h);
            return (
              <g key={m.key}>
                <text x={x + barW / 2} y={y - 6} textAnchor="middle" fontSize="11" fontWeight="600" fill="#475569">
                  {m.count}
                </text>
                <rect x={x} y={y} width={barW} height={h} rx="5" fill="#3b82f6" />
                <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="#94a3b8">
                  {m.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Top buses + técnicos */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <p className="mb-3 text-sm font-semibold">Top buses con más solicitudes</p>
          <div className="space-y-2.5">
            {topBuses.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin datos.</p>
            ) : (
              topBuses.map((b) => <Bar key={b.code} label={b.code} count={b.count} max={maxBus} color="#2563eb" />)
            )}
          </div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <p className="mb-3 text-sm font-semibold">Carga por técnico</p>
          <div className="space-y-2.5">
            {byTech.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin datos.</p>
            ) : (
              byTech.map((t) => <Bar key={t.name} label={t.name} count={t.count} max={maxTech} color="#7c3aed" />)
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
