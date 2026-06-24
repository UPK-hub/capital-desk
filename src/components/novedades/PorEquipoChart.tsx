"use client";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { Cpu } from "lucide-react";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

export default function PorEquipoChart({ data }: { data: { label: string; value: number }[] }) {
  const sorted = [...data].sort((a, b) => b.value - a.value).slice(0, 8);
  const hasData = sorted.some((d) => d.value > 0);

  const barData = {
    labels: sorted.map((d) => d.label),
    datasets: [
      {
        data: sorted.map((d) => d.value),
        backgroundColor: "#2563eb",
        borderRadius: 5,
        barThickness: 16,
      },
    ],
  };
  const barOpts: any = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: "#0f172a", padding: 8, cornerRadius: 8 },
    },
    scales: {
      x: { beginAtZero: true, grid: { color: "#f1f3f6" }, border: { display: false }, ticks: { precision: 0, font: { size: 10 }, color: "#aab2bf" } },
      y: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 11 }, color: "#475569" } },
    },
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-white p-3.5 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
        <Cpu className="h-4 w-4 text-blue-600" /> Por equipo afectado
      </div>
      <div style={{ position: "relative", height: Math.max(140, sorted.length * 34 + 16) }}>
        {hasData ? (
          <Bar data={barData} options={barOpts} />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Sin datos de equipo</div>
        )}
      </div>
    </div>
  );
}
