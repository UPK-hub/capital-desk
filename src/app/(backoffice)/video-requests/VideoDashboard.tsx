"use client";

// Tablero de videos nivel BI (sin dependencias nuevas; usa lucide-react ya
// instalado). Filtro por rango de fechas (desde–hasta), KPIs con tendencia y
// sparkline, gráfico de área de tendencia mensual, donas, rankings y drill-down.

import * as React from "react";
import Link from "next/link";
import { Layers, Clock, Play, Check, X } from "lucide-react";

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

const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
const mkey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const mlabel = (y: number, m: number) => new Date(y, m, 1).toLocaleDateString("es-CO", { month: "short" });

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(1, ...data);
  const n = data.length;
  const pts = data.map((v, i) => `${n > 1 ? (100 / (n - 1)) * i : 50},${22 - (v / max) * 19}`).join(" ");
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-6 w-full" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}

function Donut({ segments, size = 116, thickness = 19 }: { segments: { count: number; color: string }[]; size?: number; thickness?: number }) {
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
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={thickness} strokeDasharray={`${seg} ${C - seg}`} strokeDashoffset={off} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
          );
        })}
      <text x={size / 2} y={size / 2 - 2} textAnchor="middle" fontSize="22" fontWeight="600" fill="#0f172a">{total}</text>
      <text x={size / 2} y={size / 2 + 15} textAnchor="middle" fontSize="10" fill="#94a3b8">total</text>
    </svg>
  );
}

function LegendItem({ label, count, total, color, onClick, active }: { label: string; count: number; total: number; color: string; onClick?: () => void; active?: boolean }) {
  const inner = (
    <>
      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
      <span className="flex-1 truncate text-left text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold tabular-nums">{count}</span>
      <span className="w-10 text-right text-[11px] text-muted-foreground tabular-nums">{pct(count, total)}%</span>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 transition hover:bg-blue-50 ${active ? "bg-blue-100" : ""}`}>{inner}</button>
  ) : (
    <div className="flex items-center gap-2 px-1.5 py-1">{inner}</div>
  );
}

function RankBar({ rank, label, count, max, color }: { rank: number; label: string; count: number; max: number; color: string }) {
  const width = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#eef2f7] text-[11px] font-semibold text-slate-600">{rank}</span>
      <span className="w-28 shrink-0 truncate text-xs text-muted-foreground" title={label}>{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#eef2f7]">
        <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
      <span className="w-7 shrink-0 text-right text-xs font-semibold tabular-nums">{count}</span>
    </div>
  );
}

export default function VideoDashboard({ rows }: { rows: Row[] }) {
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [open, setOpen] = React.useState<string | null>(null);

  const fromTime = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity;
  const toTime = to ? new Date(`${to}T23:59:59`).getTime() : Infinity;
  const inRange = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= fromTime && t <= toTime;
  };
  const filtered = rows.filter((r) => inRange(r.createdAt));
  const total = filtered.length;
  const countOf = (field: "status" | "downloadStatus" | "origin", key: string) => filtered.filter((r) => r[field] === key).length;

  const caseStatus = CASE_STATUS.map((d) => ({ ...d, count: countOf("status", d.key) }));
  const downloadStatus = DOWNLOAD_STATUS.map((d) => ({ ...d, count: countOf("downloadStatus", d.key) }));
  const origin = ORIGIN.map((d) => ({ ...d, count: countOf("origin", d.key) }));

  const now = new Date();
  const matches = (r: Row, field?: "status", key?: string) => (field ? r[field] === key : true);
  function series6(field?: "status", key?: string): number[] {
    const out: number[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const k = mkey(d);
      out.push(rows.filter((r) => mkey(new Date(r.createdAt)) === k && matches(r, field, key)).length);
    }
    return out;
  }

  // Área: meses presentes en el set filtrado (últimos 12)
  const byMonth = new Map<string, number>();
  for (const r of filtered) {
    const k = mkey(new Date(r.createdAt));
    byMonth.set(k, (byMonth.get(k) ?? 0) + 1);
  }
  const areaData = [...byMonth.keys()].sort().slice(-12).map((k) => {
    const [y, m] = k.split("-").map(Number);
    return { label: mlabel(y, m - 1), count: byMonth.get(k) ?? 0 };
  });

  // Rankings (set filtrado)
  const busMap = new Map<string, number>();
  for (const r of filtered) busMap.set(r.busCode || "—", (busMap.get(r.busCode || "—") ?? 0) + 1);
  const topBuses = [...busMap.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count).slice(0, 6);
  const maxBus = Math.max(1, ...topBuses.map((b) => b.count));

  const techMap = new Map<string, number>();
  for (const r of filtered) {
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
  const openRows = openDef ? filtered.filter((r) => r[openDef.t] === openDef.key) : [];

  const kpis = [
    { key: null as string | null, label: "Total solicitudes", value: total, color: "#0f172a", iconBg: "#eef2f7", Icon: Layers, sf: undefined as ("status" | undefined), sk: undefined as (string | undefined) },
    { key: "status:EN_ESPERA", label: "En espera", value: caseStatus[0].count, color: "#b45309", iconBg: "#fef3c7", Icon: Clock, sf: "status" as const, sk: "EN_ESPERA" },
    { key: "status:EN_CURSO", label: "En curso", value: caseStatus[1].count, color: "#1d4ed8", iconBg: "#dbeafe", Icon: Play, sf: "status" as const, sk: "EN_CURSO" },
    { key: "status:COMPLETADO", label: "Completado", value: caseStatus[2].count, color: "#15803d", iconBg: "#dcfce7", Icon: Check, sf: "status" as const, sk: "COMPLETADO" },
  ];

  // Geometría del gráfico de área
  const W = 1000, H = 200, L = 40, R = 18, T = 28, B = 34;
  const plotW = W - L - R, plotH = H - T - B, baseY = T + plotH;
  const n = areaData.length;
  const maxV = Math.max(1, ...areaData.map((d) => d.count));
  const xAt = (i: number) => (n > 1 ? L + (plotW / (n - 1)) * i : L + plotW / 2);
  const yAt = (v: number) => T + plotH * (1 - v / maxV);
  const areaPath = n > 0 ? `M${xAt(0)},${baseY} ${areaData.map((d, i) => `L${xAt(i)},${yAt(d.count)}`).join(" ")} L${xAt(n - 1)},${baseY} Z` : "";

  return (
    <section className="rounded-2xl border border-[#dce7f5] p-4 space-y-4" style={{ backgroundColor: "#f2f6fb" }}>
      {/* Encabezado + rango de fechas */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Tablero de videos</h2>
          <p className="text-xs text-muted-foreground">Resumen operativo · toca un estado para ver sus solicitudes</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col text-[11px] text-muted-foreground">
            Desde
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-md border border-[#dce7f5] bg-white px-2 text-sm text-foreground" />
          </label>
          <label className="flex flex-col text-[11px] text-muted-foreground">
            Hasta
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-md border border-[#dce7f5] bg-white px-2 text-sm text-foreground" />
          </label>
          {from || to ? (
            <button type="button" onClick={() => { setFrom(""); setTo(""); }} className="inline-flex h-9 items-center gap-1 rounded-md border border-[#dce7f5] bg-white px-2.5 text-xs text-muted-foreground hover:bg-blue-50">
              <X size={14} /> Limpiar
            </button>
          ) : null}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => {
          const active = !!k.key && open === k.key;
          const share = pct(k.value, total);
          const content = (
            <>
              <div className="flex items-center justify-between">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: k.iconBg, color: k.color }}>
                  <k.Icon size={17} />
                </span>
                {k.key ? (
                  <span className="rounded-full bg-[#eef2f7] px-2 py-0.5 text-[11px] font-medium text-slate-600">{share}% del total</span>
                ) : null}
              </div>
              <div className="mt-2">
                <div className="text-[26px] font-semibold leading-none tabular-nums" style={{ color: k.color }}>{k.value}</div>
                <div className="mt-1 text-xs text-muted-foreground">{k.label}</div>
              </div>
              <div className="mt-2"><Sparkline data={series6(k.sf, k.sk)} color={k.color} /></div>
            </>
          );
          if (k.key) {
            return (
              <button key={k.label} type="button" onClick={() => toggle(k.key as string)} className={`rounded-xl border bg-white p-3.5 text-left shadow-sm transition hover:bg-blue-50 ${active ? "border-blue-400 ring-1 ring-blue-200" : "border-[#e7eef7]"}`}>
                {content}
              </button>
            );
          }
          return <div key={k.label} className="rounded-xl border border-[#e7eef7] bg-white p-3.5 shadow-sm">{content}</div>;
        })}
      </div>

      {/* Drill-down */}
      {openDef ? (
        <div className="rounded-xl border border-[#e7eef7] bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">Solicitudes · {openDef.label} <span className="text-muted-foreground">({openRows.length})</span></p>
            <button type="button" onClick={() => setOpen(null)} className="text-xs text-muted-foreground underline">Cerrar</button>
          </div>
          {openRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin solicitudes en este estado.</p>
          ) : (
            <div className="divide-y divide-border/50">
              {openRows.slice(0, 60).map((r) => (
                <Link key={r.id} href={`/video-requests/${r.id}`} className="flex items-center justify-between gap-3 rounded px-1 py-2 hover:bg-blue-50">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">#{r.caseNo ?? r.caseId} · {r.busCode}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.title}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{r.tech ?? "Sin asignar"}</span>
                </Link>
              ))}
            </div>
          )}
          {openRows.length > 60 ? <p className="mt-2 text-xs text-muted-foreground">… y {openRows.length - 60} más. Usa la pestaña Solicitudes para verlas todas.</p> : null}
        </div>
      ) : null}

      {/* Gráfico de área */}
      <div className="rounded-xl border border-[#e7eef7] bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold">Solicitudes por mes</p>
        <p className="mb-2 text-xs text-muted-foreground">Tendencia de creación{from || to ? " (en el rango)" : ""}</p>
        {n === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Sin datos en el rango seleccionado.</p>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 240 }} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Solicitudes por mes">
            <line x1={L} y1={T} x2={W - R} y2={T} stroke="#eef2f7" strokeWidth="1" />
            <line x1={L} y1={T + plotH / 2} x2={W - R} y2={T + plotH / 2} stroke="#eef2f7" strokeWidth="1" />
            <line x1={L} y1={baseY} x2={W - R} y2={baseY} stroke="#e2e8f0" strokeWidth="1" />
            <text x={L - 8} y={T + 5} textAnchor="end" fontSize="13" fill="#94a3b8">{maxV}</text>
            <text x={L - 8} y={T + plotH / 2 + 5} textAnchor="end" fontSize="13" fill="#94a3b8">{Math.round(maxV / 2)}</text>
            <text x={L - 8} y={baseY + 5} textAnchor="end" fontSize="13" fill="#94a3b8">0</text>
            <path d={areaPath} fill="rgba(37,99,235,0.10)" />
            {n > 1 ? <polyline points={areaData.map((d, i) => `${xAt(i)},${yAt(d.count)}`).join(" ")} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinejoin="round" /> : null}
            {areaData.map((d, i) => (
              <g key={i}>
                <circle cx={xAt(i)} cy={yAt(d.count)} r="4.5" fill="#fff" stroke="#2563eb" strokeWidth="2.5" />
                <text x={xAt(i)} y={yAt(d.count) - 12} textAnchor="middle" fontSize="15" fontWeight="600" fill="#475569">{d.count}</text>
                <text x={xAt(i)} y={H - 10} textAnchor="middle" fontSize="13" fill="#94a3b8">{d.label}</text>
              </g>
            ))}
          </svg>
        )}
      </div>

      {/* Donas */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl border border-[#e7eef7] bg-white p-4 shadow-sm">
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
        <div className="rounded-xl border border-[#e7eef7] bg-white p-4 shadow-sm">
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
        <div className="rounded-xl border border-[#e7eef7] bg-white p-4 shadow-sm md:col-span-2 xl:col-span-1">
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

      {/* Rankings */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-[#e7eef7] bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-semibold">Top buses con más solicitudes</p>
          <div className="space-y-2.5">
            {topBuses.length === 0 ? <p className="text-xs text-muted-foreground">Sin datos.</p> : topBuses.map((b, i) => <RankBar key={b.code} rank={i + 1} label={b.code} count={b.count} max={maxBus} color="#2563eb" />)}
          </div>
        </div>
        <div className="rounded-xl border border-[#e7eef7] bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-semibold">Carga por técnico</p>
          <div className="space-y-2.5">
            {byTech.length === 0 ? <p className="text-xs text-muted-foreground">Sin datos.</p> : byTech.map((t, i) => <RankBar key={t.name} rank={i + 1} label={t.name} count={t.count} max={maxTech} color="#8b5cf6" />)}
          </div>
        </div>
      </div>
    </section>
  );
}
