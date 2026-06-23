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

type Summary = {
  atendidos: number;
  pendientes: number;
  sinAsignar: number;
  series: { date: string; creados: number; resueltos: number }[];
  porEstado: { label: string; value: number; color: string }[];
};

export default function CasesResumen({
  summary,
  currentMonth,
  months,
}: {
  summary: Summary;
  currentMonth: string;
  months: { key: string; label: string }[];
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const onMonth = (m: string) => {
    const p = new URLSearchParams(sp?.toString() ?? "");
    p.set("rmonth", m);
    router.push(`/cases?${p.toString()}`);
  };

  const labels = summary.series.map((p) => p.date);
  const lastIdx = summary.series.length - 1;
  const lineDataset = (label: string, vals: number[], color: string) => ({
    label,
    data: vals,
    borderColor: color,
    backgroundColor: hexToRgba(color, 0.12),
    borderWidth: 2.5,
    tension: 0,
    fill: true,
    pointRadius: vals.map((_, i) => (i === lastIdx ? 3.5 : 0)),
    pointHoverRadius: 4,
    pointBackgroundColor: "#ffffff",
    pointBorderColor: color,
    pointBorderWidth: 2,
  });
  const lineData = {
    labels,
    datasets: [
      lineDataset("Creados", summary.series.map((p) => p.creados), "#2563eb"),
      lineDataset("Resueltos", summary.series.map((p) => p.resueltos), "#16a34a"),
    ],
  };
  const lineOpts: any = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        position: "top",
        align: "end",
        labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: "circle", font: { size: 10 }, color: "#7c8595" },
      },
      tooltip: { backgroundColor: "#0f172a", padding: 8, cornerRadius: 8, usePointStyle: true },
    },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 7, font: { size: 10 }, color: "#aab2bf" } },
      y: { beginAtZero: true, grace: "18%", grid: { color: "#f1f3f6" }, border: { display: false }, ticks: { display: false } },
    },
  };

  const donutData = {
    labels: summary.porEstado.map((p) => p.label),
    datasets: [
      {
        data: summary.porEstado.map((p) => p.value),
        backgroundColor: summary.porEstado.map((p) => p.color),
        borderColor: "#ffffff",
        borderWidth: 2,
        hoverOffset: 4,
      },
    ],
  };
  const donutOpts: any = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "62%",
    plugins: {
      legend: { position: "right", labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: "circle", font: { size: 10 }, color: "#64748b", padding: 8 } },
      tooltip: { backgroundColor: "#0f172a", padding: 8, cornerRadius: 8, usePointStyle: true },
    },
  };

  const hasDonut = summary.porEstado.some((p) => p.value > 0);

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
      <div className="mb-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <div className="rounded-xl border border-border/50 p-3">
          <div className="text-[10.5px] text-muted-foreground">Atendidos este mes</div>
          <div className="text-[22px] font-semibold tabular-nums text-blue-600">{summary.atendidos.toLocaleString("es-CO")}</div>
        </div>
        <div className="rounded-xl border border-border/50 p-3">
          <div className="text-[10.5px] text-muted-foreground">Pendientes</div>
          <div className="text-[22px] font-semibold tabular-nums text-amber-600">{summary.pendientes.toLocaleString("es-CO")}</div>
        </div>
        <div className="rounded-xl border border-red-100 bg-red-50/40 p-3">
          <div className="text-[10.5px] text-red-400">Sin asignar</div>
          <div className="text-[22px] font-semibold tabular-nums text-red-600">{summary.sinAsignar.toLocaleString("es-CO")}</div>
        </div>
      </div>

      {/* Gráficas */}
      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-[1.8fr_1fr]">
        <div className="rounded-xl border border-border/50 p-3">
          <div className="mb-1 text-xs font-semibold text-slate-600">Creados vs. resueltos · 30 días</div>
          <div style={{ position: "relative", height: 150 }}>
            <Line data={lineData} options={lineOpts} />
          </div>
        </div>
        <div className="rounded-xl border border-border/50 p-3">
          <div className="mb-1 text-xs font-semibold text-slate-600">Por estado</div>
          <div style={{ position: "relative", height: 150 }}>
            {hasDonut ? (
              <Doughnut data={donutData} options={donutOpts} />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Sin datos</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
