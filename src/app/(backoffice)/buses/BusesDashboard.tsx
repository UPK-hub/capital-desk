"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, Wrench, Film, ClipboardList, Download, Bus as BusIcon } from "lucide-react";
import { Input } from "@/components/Field";

type MonthPoint = { label: string; prev: number; corr: number; video: number; ot: number };
type BusRow = {
  busId: string;
  code: string;
  plate: string | null;
  prev: number;
  corr: number;
  video: number;
  ot: number;
  total: number;
};
type Report = {
  year: number;
  month: number;
  months: MonthPoint[];
  buses: BusRow[];
  kpis: { prev: number; corr: number; video: number; ot: number };
};

const SERIES = [
  { key: "prev", label: "Preventivos", color: "#2563eb" },
  { key: "corr", label: "Correctivos", color: "#e11d48" },
  { key: "video", label: "Solicitudes video", color: "#8b5cf6" },
  { key: "ot", label: "OT", color: "#06b6d4" },
] as const;

const MESES = [
  { v: 0, label: "Todo el año" },
  { v: 1, label: "Enero" },
  { v: 2, label: "Febrero" },
  { v: 3, label: "Marzo" },
  { v: 4, label: "Abril" },
  { v: 5, label: "Mayo" },
  { v: 6, label: "Junio" },
  { v: 7, label: "Julio" },
  { v: 8, label: "Agosto" },
  { v: 9, label: "Septiembre" },
  { v: 10, label: "Octubre" },
  { v: 11, label: "Noviembre" },
  { v: 12, label: "Diciembre" },
];

function niceMax(v: number) {
  if (v <= 5) return 5;
  if (v <= 10) return 10;
  const step = v <= 50 ? 5 : v <= 200 ? 10 : 50;
  return Math.ceil(v / step) * step;
}

export default function BusesDashboard() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(0);
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [busQ, setBusQ] = useState("");

  const years = useMemo(() => {
    const y = now.getFullYear();
    return [y, y - 1, y - 2, y - 3];
  }, [now]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    (async () => {
      const res = await fetch(`/api/buses/dashboard?year=${year}&month=${month}`, { cache: "no-store" });
      const json = res.ok ? ((await res.json()) as Report) : null;
      if (mounted) {
        setData(json);
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [year, month]);

  const kpis = data?.kpis ?? { prev: 0, corr: 0, video: 0, ot: 0 };
  const kpiCards = [
    { label: "Preventivos", value: kpis.prev, color: "#2563eb", bg: "#eff4ff", Icon: CalendarCheck },
    { label: "Correctivos", value: kpis.corr, color: "#e11d48", bg: "#fff1f4", Icon: Wrench },
    { label: "Solicitudes de video", value: kpis.video, color: "#8b5cf6", bg: "#f5f1ff", Icon: Film },
    { label: "OTs", value: kpis.ot, color: "#06b6d4", bg: "#ecfdff", Icon: ClipboardList },
  ];

  const months = data?.months ?? [];
  const periodLabel = month ? `${MESES[month].label} ${year}` : `Año ${year}`;
  const exportHref = `/api/buses/dashboard/export?year=${year}&month=${month}`;

  const filteredBuses = useMemo(() => {
    const rows = data?.buses ?? [];
    const term = busQ.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (b) => b.code.toLowerCase().includes(term) || (b.plate ?? "").toLowerCase().includes(term)
    );
  }, [data, busQ]);
  const maxBusTotal = Math.max(1, ...filteredBuses.map((b) => b.total));

  // ---- geometría del gráfico (barras agrupadas estilo BI) ----
  const W = 920;
  const H = 250;
  const L = 36;
  const R = 16;
  const T = 18;
  const B = 30;
  const plotW = W - L - R;
  const plotH = H - T - B;
  const baseY = T + plotH;
  const groupW = plotW / 12;
  const barW = (groupW * 0.62) / 4;
  const gap = (groupW * 0.62 - barW * 4) / 3;
  const sidePad = (groupW - groupW * 0.62) / 2;
  const dataMax = Math.max(0, ...months.flatMap((m) => [m.prev, m.corr, m.video, m.ot]));
  const top = niceMax(dataMax);
  const gridVals = [0, top / 4, top / 2, (top * 3) / 4, top];
  const yAt = (v: number) => baseY - (v / top) * plotH;

  return (
    <div className="space-y-5 rounded-2xl p-4 sm:p-5" style={{ backgroundColor: "#f2f6fb" }}>
      {/* filtros + exportar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-900">Actividad de la flota</h2>
          <p className="text-sm text-slate-500">{periodLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="h-10 rounded-xl border border-[#dce7f5] bg-white px-3 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-[#2563eb]"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="h-10 rounded-xl border border-[#dce7f5] bg-white px-3 text-sm font-medium text-slate-700 shadow-sm outline-none focus:border-[#2563eb]"
          >
            {MESES.map((m) => (
              <option key={m.v} value={m.v}>
                {m.label}
              </option>
            ))}
          </select>
          <a
            href={exportHref}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#107c41] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0c6234]"
          >
            <Download className="h-4 w-4" />
            Exportar Excel
          </a>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {kpiCards.map(({ label, value, color, bg, Icon }) => (
          <div key={label} className="overflow-hidden rounded-2xl border border-[#dce7f5] bg-white shadow-sm">
            <div className="flex items-center gap-3 p-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: bg }}>
                <Icon className="h-5 w-5" style={{ color }} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[12px] font-medium text-slate-500">{label}</p>
                <p className="text-2xl font-bold tabular-nums text-slate-900">{loading ? "—" : value}</p>
              </div>
            </div>
            <div className="h-1.5 w-full" style={{ backgroundColor: color }} />
          </div>
        ))}
      </div>

      {/* gráfico mensual estilo Power BI */}
      <div className="rounded-2xl border border-[#dce7f5] bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="font-display text-base font-semibold text-slate-900">Actividad por mes · {year}</h3>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {SERIES.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex h-[250px] items-center justify-center text-sm text-slate-400">Cargando…</div>
        ) : dataMax === 0 ? (
          <div className="flex h-[250px] items-center justify-center text-sm text-slate-400">Sin actividad en {year}.</div>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 320 }} role="img">
            {/* guías horizontales + ejes Y */}
            {gridVals.map((g, i) => (
              <g key={i}>
                <line x1={L} y1={yAt(g)} x2={W - R} y2={yAt(g)} stroke="#eef2f7" strokeWidth={1} />
                <text x={L - 8} y={yAt(g) + 3} textAnchor="end" fontSize={10} fill="#94a3b8">
                  {Math.round(g)}
                </text>
              </g>
            ))}
            {/* barras agrupadas */}
            {months.map((m, i) => {
              const gx = L + groupW * i + sidePad;
              return (
                <g key={i}>
                  {SERIES.map((s, si) => {
                    const v = m[s.key];
                    const x = gx + si * (barW + gap);
                    const y = yAt(v);
                    const h = baseY - y;
                    return (
                      <rect
                        key={s.key}
                        x={x}
                        y={y}
                        width={barW}
                        height={Math.max(0, h)}
                        rx={2}
                        fill={s.color}
                      >
                        <title>{`${s.label} · ${m.label}: ${v}`}</title>
                      </rect>
                    );
                  })}
                  <text x={L + groupW * i + groupW / 2} y={H - 10} textAnchor="middle" fontSize={10} fill="#64748b">
                    {m.label}
                  </text>
                </g>
              );
            })}
            <line x1={L} y1={baseY} x2={W - R} y2={baseY} stroke="#cbd5e1" strokeWidth={1} />
          </svg>
        )}
      </div>

      {/* tabla por bus */}
      <div className="rounded-2xl border border-[#dce7f5] bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-[#eef2f7] p-4 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="font-display text-base font-semibold text-slate-900">Por cada bus · {periodLabel}</h3>
          <Input
            placeholder="Filtrar por código o placa…"
            value={busQ}
            onChange={(e) => setBusQ(e.target.value)}
            className="h-9 w-full sm:w-64"
          />
        </div>

        {loading ? (
          <p className="p-6 text-sm text-slate-400">Cargando…</p>
        ) : filteredBuses.length === 0 ? (
          <p className="p-6 text-sm text-slate-400">Sin datos para el período seleccionado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5">Bus</th>
                  <th className="px-3 py-2.5 text-right">Prev.</th>
                  <th className="px-3 py-2.5 text-right">Corr.</th>
                  <th className="px-3 py-2.5 text-right">Video</th>
                  <th className="px-3 py-2.5 text-right">OT</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {filteredBuses.map((b, idx) => (
                  <tr key={b.busId} className={idx % 2 ? "bg-[#f8fafc]" : "bg-white"}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#eff4ff] text-[#2563eb]">
                          <BusIcon className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold leading-tight text-slate-800">{b.code}</p>
                          <p className="text-[11px] leading-tight text-slate-400">{b.plate ?? "Sin placa"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{b.prev}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{b.corr}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{b.video}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{b.ot}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <div className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-slate-100 sm:block">
                          <div
                            className="h-full rounded-full bg-[#2563eb]"
                            style={{ width: `${(b.total / maxBusTotal) * 100}%` }}
                          />
                        </div>
                        <span className="w-8 text-right font-bold tabular-nums text-slate-900">{b.total}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
