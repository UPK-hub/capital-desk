"use client";

// Tablero de videos estilo BI (sin dependencias): KPIs con barra de proporción,
// donas (SVG) por estado del caso / descarga / procedencia, tendencia mensual,
// top buses y carga por técnico. Drill-down: al tocar un estado se despliegan
// las solicitudes que están en él.

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
  { key: "COMPLETADO", label: "Completado", color: "#22c55e" },
];

const DOWNLOAD_STATUS = [
  { key: "PENDIENTE", label: "Pendiente", color: "#94a3b8" },
  { key: "DESCARGA_REALIZADA", label: "Descarga realizada", color: "#22c55e" },
  { key: "DESCARGA_FALLIDA", label: "Descarga fallida", color: "#ef4444" },
  { key: "BUS_NO_EN_PATIO", label: "Bus no en patio", color: "#8b5cf6" },
];

const ORIGIN = [
  { key: "TRANSMILENIO_SA", label: "TransMilenio S.A.", color: "#2563eb" },
  { key: "INTERVENTORIA", label: "Interventoría", color: "#06b6d4" },
  { key: "CAPITAL_BUS", label: "Capital Bus", color: "#8b5cf6" },
  { key: "OTRO", label: "Otro", color: "#94a3b8" },
];

function pct(n: number, total: number) {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

function Donut({ segments, size = 128, thickness = 20 }: { segments: { count: number; color: string }[]; size?: number; thickness?: number }) {
  const total = segments.reduce((s, x) => s + x.count, 0);
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f7" strokeWidth={thickness} />
      {total > 0 &&
        segments.map((s, i) => {
          if (s.count <= 0) return null;
          const f = s.count / total;
          const seg = f * C;
          const off = -acc * C;
          acc += f;
          return (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${seg} ${C - seg}`}
              strokeDashoffset={off}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
        })}
      <text x={size / 2} y={size / 2 - 2} textAnchor="middle" fontSize="24" fontWeight="600" fill="#0f172a">
        {total}
      </text>
      <text x={size / 2} y={size / 2 + 16} textAnchor="middle" fontSize="11" fill="#94a3b8">
        total
      </text>
    </svg>
  );
}

function LegendItem({ label, count, total, color, onClick, active }: { label: string; count: number; total: number; color: string; onClick?: () => void; active?: boolean }) {
  const p = pct(count, total);
  const inner = (
    <>
      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
      <span className="flex-1 truncate text-left text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold tabular-nums">{count}</span>
      <span className="w-10 text-right text-[11px] text-muted-foreground tabular-nums">{p}%</span>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 transition hover:bg-muted/50 ${active ? "bg-muted/50" : ""}`}>
      {inner}
    </button>
  ) : (
    <div className="flex items-center gap-2 px-1.5 py-1">{inner}</div>
  );
}

function HBar({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  const width = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3 px-1">
      <span className="w-36 shrink-0 truncate text-xs text-muted-foreground" title={label}>
        {label}
      </span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
        <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
      <span className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums">{count}</span>
    </div>
  );
}

export default function VideoDashboard({ rows }: { rows: Row[] }) {
  const [open, setOpen] = React.useState<string | null>(null);
  const total = rows.length;
  const countOf = (field: "status" | "downloadStatus" | "origin", key: string) => rows.filter((r) => r[field] === key).length;

  const caseStatus = CASE_STATUS.map((d) => ({ ...d, count: countOf("status", d.key) }));
  const downloadStatus = DOWNLOAD_STATUS.map((d) => ({ ...d, count: countOf("downloadStatus", d.key) }));
  const origin = ORIGIN.map((d) => ({ ...d, count: countOf("origin", d.key) }));

  const now = new Date();
  const months: { key: string; label: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("es-CO", { month: "short" }), count: 0 });
  }
  for (const r of rows) {
    const d = new Date(r.createdAt);
    const m = months.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`);
    if (m) m.count += 1;
  }
  const maxMonth = Math.max(1, ...months.map((m) => m.count));

  const busMap = new Map<string, number>();
  for (const r of rows) busMap.set(r.busCode || "—", (busMap.get(r.busCode || "—") ?? 0) + 1);
  const topBuses = [...busMap.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count).slice(0, 6);
  const maxBus = Math.max(1, ...topBuses.map((b) => b.count));

  const techMap = new Map<string, number>();
  for (const r of rows) {
    const n = r.tech ?? "Sin asignar";
    techMap.set(n, (techMap.get(n) ?? 0) + 1);
  }
  const byTech = [...techMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 6);
  const maxTech = Math.max(1, ...byTech.map((t) => t.count));

  const toggle = (key: string) => setOpen((o) => (o === key ? null : key));

  const allDefs = [
    ...CASE_STATUS.map((d) => ({ ...d, t: "status" as const })),
    ...DOWNLOAD_STATUS.map((d) => ({ ...d, t: "downloadStatus" as const })),
  ];
  const openDef = open ? allDefs.find((d) => `${d.t}:${d.key}` === open) ?? null : null;
  const openRows = openDef ? rows.filter((r) => r[openDef.t] === openDef.key) : [];

  const kpis = [
    { key: null as string | null, label: "Total", value: total, color: "#0f172a" },
    { key: "status:EN_ESPERA", label: "En espera", value: caseStatus[0].count, color: "#d97706" },
    { key: "status:EN_CURSO", label: "En curso", value: caseStatus[1].count, color: "#2563eb" },
    { key: "status:COMPLETADO", label: "Completado", value: caseStatus[2].count, color: "#16a34a" },
  ];

  const W = 560;
  const H = 160;
  const padX = 14;
  const padTop = 24;
  const padBottom = 26;
  const slot = (W - padX * 2) / months.length;
  const barW = Math.min(48, slot * 0.55);
  const chartH = H - padTop - padBottom;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Tablero de videos</h2>
          <p className="text-xs text-muted-foreground">Resumen operativo · toca un estado para desplegar sus solicitudes</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => {
          const active = !!k.key && open === k.key;
          const p = k.key ? pct(k.value, total) : 100;
          const content = (
            <>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: k.color }} />
                  <span className="text-xs text-muted-foreground">{k.label}</span>
                </span>
                {k.key ? <span className="text-[11px] text-muted-foreground tabular-nums">{p}%</span> : null}
              </div>
              <p className="mt-1 text-[28px] font-semibold leading-tight tabular-nums" style={{ color: k.color }}>
                {k.value}
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                <div className="h-full rounded-full" style={{ width: `${p}%`, backgroundColor: k.color }} />
              </div>
            </>
          );
          if (k.key) {
            return (
              <button
                key={k.label}
                type="button"
                onClick={() => toggle(k.key as string)}
                className={`rounded-xl border bg-card p-4 text-left transition hover:bg-muted/30 ${active ? "border-foreground/30 ring-1 ring-border/60" : "border-border/60"}`}
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
                <Link key={r.id} href={`/video-requests/${r.id}`} className="flex items-center justify-between gap-3 rounded px-1 py-2 hover:bg-muted/40">
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
            <p className="mt-2 text-xs text-muted-foreground">… y {openRows.length - 60} más. Usa la pestaña Solicitudes para verlas todas.</p>
          ) : null}
        </div>
      ) : null}

      {/* Donas */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <p className="mb-3 text-sm font-semibold">Estado del caso</p>
          <div className="flex items-center gap-4">
            <Donut segments={caseStatus} />
            <div className="flex-1 space-y-0.5">
              {caseStatus.map((d) => (
                <LegendItem key={d.key} label={d.label} count={d.count} total={total} color={d.color} onClick={() => toggle(`status:${d.key}`)} active={open === `status:${d.key}`} />
              ))}
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <p className="mb-3 text-sm font-semibold">Estado de descarga</p>
          <div className="flex items-center gap-4">
            <Donut segments={downloadStatus} />
            <div className="flex-1 space-y-0.5">
              {downloadStatus.map((d) => (
                <LegendItem key={d.key} label={d.label} count={d.count} total={total} color={d.color} onClick={() => toggle(`downloadStatus:${d.key}`)} active={open === `downloadStatus:${d.key}`} />
              ))}
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4 md:col-span-2 xl:col-span-1">
          <p className="mb-3 text-sm font-semibold">Por procedencia</p>
          <div className="flex items-center gap-4">
            <Donut segments={origin} />
            <div className="flex-1 space-y-0.5">
              {origin.map((d) => (
                <LegendItem key={d.key} label={d.label} count={d.count} total={total} color={d.color} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Gestión por mes */}
      <div className="rounded-xl border border-border/60 bg-card p-4">
        <p className="text-sm font-semibold">Gestión por mes</p>
        <p className="mb-3 text-xs text-muted-foreground">Solicitudes creadas (últimos 6 meses)</p>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Solicitudes por mes">
          <line x1={padX} y1={padTop + chartH + 0.5} x2={W - padX} y2={padTop + chartH + 0.5} stroke="#e2e8f0" strokeWidth="1" />
          {months.map((m, i) => {
            const h = Math.round((m.count / maxMonth) * chartH);
            const x = padX + slot * i + (slot - barW) / 2;
            const y = padTop + (chartH - h);
            return (
              <g key={m.key}>
                <text x={x + barW / 2} y={y - 6} textAnchor="middle" fontSize="11" fontWeight="600" fill="#475569">
                  {m.count}
                </text>
                <rect x={x} y={y} width={barW} height={h} rx="6" fill="#2563eb" />
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
              topBuses.map((b) => <HBar key={b.code} label={b.code} count={b.count} max={maxBus} color="#2563eb" />)
            )}
          </div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <p className="mb-3 text-sm font-semibold">Carga por técnico</p>
          <div className="space-y-2.5">
            {byTech.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin datos.</p>
            ) : (
              byTech.map((t) => <HBar key={t.name} label={t.name} count={t.count} max={maxTech} color="#8b5cf6" />)
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
