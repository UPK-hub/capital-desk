"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line, Doughnut } from "react-chartjs-2";
import { BarChart3 } from "lucide-react";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler
);

function hexToRgba(hex: string, a: number) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

const nf = (n: number) => n.toLocaleString("es-CO");
const pct = (v: number, total: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

type Item = { label: string; value: number; color: string };

type Summary = {
  creadosMes: number;
  atendidos: number;
  pendientes: number;
  vencidos: number;
  series: { date: string; creados: number; resueltos: number }[];
  porEstado: Item[];
  porTipo: Item[];
  porPrioridad: Item[];
  cargaResponsable: { label: string; value: number }[];
};

/* ---------------------------------------------------------------- piezas */

function Panel({
  texto,
  alcance,
  extra,
  children,
}: {
  texto: string;
  alcance: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-white p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-slate-700">{texto}</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">{alcance}</div>
        </div>
        {extra}
      </div>
      {children}
    </div>
  );
}

function Vacio() {
  return (
    <div className="flex h-[132px] items-center justify-center text-xs text-muted-foreground">
      Sin datos en el periodo
    </div>
  );
}

/** Una sola categoría: la dona no aporta nada, se muestra como dato destacado. */
function Unico({ item, total }: { item: Item; total: number }) {
  return (
    <div className="flex h-[132px] flex-col justify-center gap-2 px-1">
      <div className="flex items-baseline gap-2">
        <span className="text-[30px] font-semibold leading-none tabular-nums" style={{ color: item.color }}>
          {nf(item.value)}
        </span>
        <span className="truncate text-xs font-medium text-slate-600">{item.label}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: "100%", background: item.color }} />
      </div>
      <div className="text-[10.5px] text-slate-400">
        100% de los {nf(total)} registros del periodo — categoría única
      </div>
    </div>
  );
}

function Dona({ datos }: { datos: Item[] }) {
  const items = datos.filter((d) => d.value > 0);
  const total = items.reduce((a, b) => a + b.value, 0);
  if (!total) return <Vacio />;
  if (items.length === 1) return <Unico item={items[0]} total={total} />;

  const data = {
    labels: items.map((d) => d.label),
    datasets: [
      {
        data: items.map((d) => d.value),
        backgroundColor: items.map((d) => d.color),
        borderColor: "#ffffff",
        borderWidth: 2,
        borderRadius: 4,
        spacing: 1,
        hoverOffset: 6,
      },
    ],
  };
  const opts: any = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "72%",
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#0f172a",
        padding: 10,
        cornerRadius: 8,
        displayColors: false,
        titleFont: { size: 11 },
        bodyFont: { size: 11, weight: "600" },
        callbacks: {
          label: (c: any) => `${nf(c.parsed)} · ${pct(c.parsed, total)}%`,
        },
      },
    },
  };

  return (
    <div className="flex h-[132px] items-center gap-3">
      <div className="relative h-[120px] w-[120px] shrink-0">
        <Doughnut data={data} options={opts} />
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[19px] font-semibold leading-none tabular-nums text-slate-800">{nf(total)}</span>
          <span className="mt-0.5 text-[9px] uppercase tracking-wide text-slate-400">total</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {items.map((d) => (
          <li key={d.label} className="flex items-center gap-2 text-[11px]">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: d.color }} />
            <span className="min-w-0 flex-1 truncate text-slate-600">{d.label}</span>
            <span className="tabular-nums font-semibold text-slate-800">{nf(d.value)}</span>
            <span className="w-8 text-right tabular-nums text-slate-400">{pct(d.value, total)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Barras({ datos }: { datos: { label: string; value: number }[] }) {
  const items = datos.filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  if (!items.length) return <Vacio />;
  const max = items[0].value;
  const visibles = items.slice(0, 5);
  const resto = items.slice(5);
  const restoTotal = resto.reduce((a, b) => a + b.value, 0);

  return (
    <div className="flex h-[132px] flex-col justify-center gap-2.5">
      {visibles.map((d) => {
        const sinAsignar = d.label === "Sin asignar";
        return (
          <div key={d.label}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-[11px]">
              <span className={`min-w-0 truncate ${sinAsignar ? "text-slate-500 italic" : "text-slate-600"}`}>
                {d.label}
              </span>
              <span className="tabular-nums font-semibold text-slate-800">{nf(d.value)}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.max(6, (d.value / max) * 100)}%`,
                  background: sinAsignar
                    ? "linear-gradient(90deg,#cbd5e1,#94a3b8)"
                    : "linear-gradient(90deg,#60a5fa,#2563eb)",
                }}
              />
            </div>
          </div>
        );
      })}
      {resto.length > 0 && (
        <div className="text-[10.5px] text-slate-400">
          +{resto.length} responsable{resto.length > 1 ? "s" : ""} más ({nf(restoTotal)} casos)
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ componente */

export default function CasesResumen({
  summary,
  currentMonth,
  months,
  basePath = "/cases",
}: {
  summary: Summary;
  currentMonth: string;
  months: { key: string; label: string }[];
  basePath?: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const onMonth = (m: string) => {
    const p = new URLSearchParams(sp?.toString() ?? "");
    p.set("rmonth", m);
    router.push(`${basePath}?${p.toString()}`);
  };

  const labels = summary.series.map((p) => p.date);
  const lastIdx = summary.series.length - 1;

  const areaGradient = (color: string) => (ctx: any) => {
    const chart = ctx.chart;
    const area = chart.chartArea;
    if (!area) return hexToRgba(color, 0.14);
    const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
    g.addColorStop(0, hexToRgba(color, 0.26));
    g.addColorStop(1, hexToRgba(color, 0));
    return g;
  };

  const lineDataset = (label: string, vals: number[], color: string) => ({
    label,
    data: vals,
    borderColor: color,
    backgroundColor: areaGradient(color),
    borderWidth: 2.25,
    tension: 0.35,
    cubicInterpolationMode: "monotone" as const,
    fill: true,
    pointRadius: vals.map((_, i) => (i === lastIdx ? 3.5 : 0)),
    pointHoverRadius: 5,
    pointBackgroundColor: "#ffffff",
    pointBorderColor: color,
    pointBorderWidth: 2,
    pointHitRadius: 12,
  });

  const creados = summary.series.map((p) => p.creados);
  const resueltos = summary.series.map((p) => p.resueltos);
  const lineData = {
    labels,
    datasets: [
      lineDataset("Creados", creados, "#2563eb"),
      lineDataset("Resueltos", resueltos, "#16a34a"),
    ],
  };
  const lineOpts: any = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#0f172a",
        padding: 10,
        cornerRadius: 8,
        usePointStyle: true,
        titleFont: { size: 11 },
        bodyFont: { size: 11 },
        callbacks: {
          title: (its: any[]) => `Día ${its[0]?.label ?? ""}`,
          label: (c: any) => ` ${c.dataset.label}: ${nf(c.parsed.y)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8, font: { size: 10 }, color: "#aab2bf" },
      },
      y: {
        beginAtZero: true,
        grace: "22%",
        grid: { color: "#f1f5f9", drawTicks: false },
        border: { display: false },
        ticks: { precision: 0, maxTicksLimit: 4, font: { size: 10 }, color: "#b6bdc9", padding: 6 },
      },
    },
  };

  const totalCreados = creados.reduce((a, b) => a + b, 0);
  const totalResueltos = resueltos.reduce((a, b) => a + b, 0);
  const balance = totalResueltos - totalCreados;

  const mesCorto =
    (months.find((m) => m.key === currentMonth)?.label ?? "").split(" ")[0] || "el mes";

  const efectividad = summary.creadosMes > 0 ? Math.round((summary.atendidos / summary.creadosMes) * 100) : null;

  return (
    <div className="rounded-2xl border border-border/60 bg-white p-3.5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <BarChart3 className="h-4 w-4 text-blue-600" /> Resumen
        </span>
        <select
          value={currentMonth}
          onChange={(e) => onMonth(e.target.value)}
          className="h-8 rounded-lg border border-border/70 bg-white px-2.5 text-xs text-slate-600 outline-none focus:border-blue-400"
        >
          {months.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {/* KPIs */}
      <div className="mb-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <div className="rounded-xl border border-blue-100 bg-blue-50/30 p-3">
          <div className="text-[10.5px] text-muted-foreground">Realizados en {mesCorto}</div>
          <div className="text-[22px] font-semibold tabular-nums text-blue-600">{nf(summary.atendidos)}</div>
          {efectividad !== null && (
            <div className="mt-0.5 text-[10px] text-slate-400">{efectividad}% de lo creado en el mes</div>
          )}
        </div>
        <div className="rounded-xl border border-blue-100 bg-blue-50/30 p-3">
          <div className="text-[10.5px] text-muted-foreground">Creados en {mesCorto}</div>
          <div className="text-[22px] font-semibold tabular-nums text-slate-700">{nf(summary.creadosMes)}</div>
          <div className="mt-0.5 text-[10px] text-slate-400">
            {balance >= 0 ? `Saldo +${nf(balance)} a favor` : `Saldo ${nf(balance)} por cerrar`}
          </div>
        </div>
        <div className="rounded-xl border border-border/50 p-3">
          <div className="text-[10.5px] text-muted-foreground">Pendientes a la fecha</div>
          <div className="text-[22px] font-semibold tabular-nums text-amber-600">{nf(summary.pendientes)}</div>
          <div className="mt-0.5 text-[10px] text-slate-400">acumulado abierto</div>
        </div>
        <div className="rounded-xl border border-red-100 bg-red-50/40 p-3">
          <div className="text-[10.5px] text-red-400">Vencidos (SLA) a la fecha</div>
          <div className="text-[22px] font-semibold tabular-nums text-red-600">{nf(summary.vencidos)}</div>
          <div className="mt-0.5 text-[10px] text-red-300">
            {summary.pendientes > 0 ? `${pct(summary.vencidos, summary.pendientes)}% de los pendientes` : "sin pendientes"}
          </div>
        </div>
      </div>

      {/* Gráficas */}
      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-[1.8fr_1fr]">
        <Panel
          texto="Creados vs. resueltos"
          alcance={`día a día · ${mesCorto}`}
          extra={
            <div className="flex items-center gap-3 text-[10.5px]">
              <span className="flex items-center gap-1.5 text-slate-500">
                <span className="h-2 w-2 rounded-full bg-[#2563eb]" />
                Creados <b className="tabular-nums text-slate-700">{nf(totalCreados)}</b>
              </span>
              <span className="flex items-center gap-1.5 text-slate-500">
                <span className="h-2 w-2 rounded-full bg-[#16a34a]" />
                Resueltos <b className="tabular-nums text-slate-700">{nf(totalResueltos)}</b>
              </span>
            </div>
          }
        >
          <div style={{ position: "relative", height: 132 }}>
            <Line data={lineData} options={lineOpts} />
          </div>
        </Panel>

        <Panel texto="Por estado" alcance={`casos creados en ${mesCorto}`}>
          <Dona datos={summary.porEstado} />
        </Panel>
      </div>

      {/* Por tipo, por prioridad, carga por responsable */}
      <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <Panel texto="Por tipo" alcance={`realizados en ${mesCorto}`}>
          <Dona datos={summary.porTipo} />
        </Panel>
        <Panel texto="Por prioridad" alcance={`realizados en ${mesCorto}`}>
          <Dona datos={summary.porPrioridad} />
        </Panel>
        <Panel texto="Carga por responsable" alcance="casos abiertos a la fecha">
          <Barras datos={summary.cargaResponsable} />
        </Panel>
      </div>
    </div>
  );
}
