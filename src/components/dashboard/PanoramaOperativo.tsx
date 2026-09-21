"use client";

import * as React from "react";
import Link from "next/link";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";
import type { Panorama } from "@/lib/dashboard/panorama";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const COLOR = {
  serie1: "#2563eb",
  serie2: "#0d9488",
  ok: "#16a34a",
  warn: "#d97706",
  bad: "#dc2626",
  gris: "#94a3b8",
  violeta: "#7c3aed",
};

const ESTADO_COLOR: Record<string, string> = {
  AL_DIA: COLOR.ok,
  PENDIENTE: COLOR.warn,
  CORRECTIVO: COLOR.bad,
  SIN_REPORTE: COLOR.gris,
};

const ESTADO_TEXTO: Record<string, string> = {
  AL_DIA: "preventivo del mes al día",
  PENDIENTE: "preventivo pendiente",
  CORRECTIVO: "correctivo abierto",
  SIN_REPORTE: "sin reportar hace 5+ días",
};

const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function Panel({
  titulo,
  alcance,
  children,
  className = "",
}: {
  titulo: string;
  alcance: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-border/60 bg-white p-4 shadow-sm ${className}`}>
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-800">{titulo}</h3>
        <span className="text-[10px] font-semibold uppercase tracking-[0.09em] text-slate-400">
          {alcance}
        </span>
      </header>
      {children}
    </section>
  );
}

/** Medidor de arco para el cumplimiento del preventivo. */
function Medidor({ pct }: { pct: number }) {
  const R = 78;
  const C = 100;
  const punto = (p: number) => {
    const a = ((-210 + (p / 100) * 240) * Math.PI) / 180;
    return [C + R * Math.cos(a), C + R * Math.sin(a)] as const;
  };
  const [x0, y0] = punto(0);
  const [x1, y1] = punto(100);
  const [xp, yp] = punto(Math.max(0, Math.min(100, pct)));
  const largo = (p: number) => (p / 100) * 240 > 180 ? 1 : 0;

  return (
    <div className="relative mx-auto w-[200px]">
      <svg viewBox="0 0 200 172" className="w-full" role="img" aria-label={`Cumplimiento ${pct}%`}>
        <defs>
          <linearGradient id="grad-cumpl" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor={COLOR.serie1} />
            <stop offset="100%" stopColor={COLOR.ok} />
          </linearGradient>
        </defs>
        {Array.from({ length: 21 }, (_, i) => {
          const p = i * 5;
          const a = ((-210 + (p / 100) * 240) * Math.PI) / 180;
          const r1 = R + 11;
          const r2 = R + (p % 25 === 0 ? 17 : 14);
          return (
            <line
              key={p}
              x1={C + r1 * Math.cos(a)}
              y1={C + r1 * Math.sin(a)}
              x2={C + r2 * Math.cos(a)}
              y2={C + r2 * Math.sin(a)}
              stroke={p % 25 === 0 ? "#b7c4d8" : "#dbe3ee"}
              strokeWidth={p % 25 === 0 ? 2 : 1}
            />
          );
        })}
        <path
          d={`M ${x0.toFixed(2)},${y0.toFixed(2)} A ${R},${R} 0 1 1 ${x1.toFixed(2)},${y1.toFixed(2)}`}
          fill="none"
          stroke="#e9eff7"
          strokeWidth={15}
          strokeLinecap="round"
        />
        <path
          d={`M ${x0.toFixed(2)},${y0.toFixed(2)} A ${R},${R} 0 ${largo(pct)} 1 ${xp.toFixed(2)},${yp.toFixed(2)}`}
          fill="none"
          stroke="url(#grad-cumpl)"
          strokeWidth={15}
          strokeLinecap="round"
        />
        <circle cx={xp} cy={yp} r={6} fill="#ffffff" stroke={COLOR.ok} strokeWidth={3} />
      </svg>
      <div className="pointer-events-none absolute inset-x-0 top-[62px] text-center">
        <b className="block text-[40px] font-extrabold leading-none tabular-nums text-slate-900">
          {pct}%
        </b>
      </div>
    </div>
  );
}

function Alerta({
  label,
  valor,
  sub,
  color,
  href,
}: {
  label: string;
  valor: number;
  sub: string;
  color: string;
  href?: string;
}) {
  const cuerpo = (
    <div
      className="relative h-full overflow-hidden rounded-xl border border-border/50 bg-slate-50/70 p-3 pl-4 transition hover:border-slate-300"
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}
    >
      <p className="text-[11px] font-semibold text-slate-500">{label}</p>
      <p className="text-[26px] font-extrabold leading-tight tabular-nums" style={{ color }}>
        {valor}
      </p>
      <p className="text-[10.5px] text-slate-400">{sub}</p>
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {cuerpo}
    </Link>
  ) : (
    cuerpo
  );
}

function BarraFila({
  label,
  valor,
  max,
  color,
}: {
  label: string;
  valor: number;
  max: number;
  color: string;
}) {
  return (
    <div className="mb-2.5 flex items-center gap-3">
      <span className="w-28 shrink-0 truncate text-[11.5px] text-slate-500">{label}</span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
        <span
          className="block h-full rounded-full"
          style={{ width: `${max > 0 ? (valor / max) * 100 : 0}%`, background: color }}
        />
      </span>
      <span className="w-6 text-right text-[12px] font-bold tabular-nums text-slate-700">{valor}</span>
    </div>
  );
}

export default function PanoramaOperativo({
  data,
  verPanico = false,
}: {
  data: Panorama;
  /** El módulo de botón de pánico aún no se expone al cliente: la tarjeta solo
   *  se muestra a quien tiene permiso sobre ese módulo. */
  verPanico?: boolean;
}) {
  const { flota, cumplimiento, alertas, actividad, preventivosHeat, carga, topBuses, videoSla } = data;

  const lineData = React.useMemo(
    () => ({
      labels: actividad.dias,
      datasets: [
        {
          label: "Creados",
          data: actividad.creados,
          borderColor: COLOR.serie1,
          backgroundColor: (ctx: any) => {
            const { chart } = ctx;
            if (!chart.chartArea) return "rgba(37,99,235,0.14)";
            const g = chart.ctx.createLinearGradient(0, chart.chartArea.top, 0, chart.chartArea.bottom);
            g.addColorStop(0, "rgba(37,99,235,0.24)");
            g.addColorStop(1, "rgba(37,99,235,0)");
            return g;
          },
          borderWidth: 2.4,
          tension: 0.35,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBorderWidth: 2,
          pointHoverBackgroundColor: "#ffffff",
          pointHoverBorderColor: COLOR.serie1,
        },
        {
          label: "Resueltos",
          data: actividad.resueltos,
          borderColor: COLOR.serie2,
          backgroundColor: (ctx: any) => {
            const { chart } = ctx;
            if (!chart.chartArea) return "rgba(13,148,136,0.12)";
            const g = chart.ctx.createLinearGradient(0, chart.chartArea.top, 0, chart.chartArea.bottom);
            g.addColorStop(0, "rgba(13,148,136,0.20)");
            g.addColorStop(1, "rgba(13,148,136,0)");
            return g;
          },
          borderWidth: 2.4,
          tension: 0.35,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBorderWidth: 2,
          pointHoverBackgroundColor: "#ffffff",
          pointHoverBorderColor: COLOR.serie2,
        },
      ],
    }),
    [actividad]
  );

  const lineOpts = React.useMemo<any>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: true,
          align: "end",
          labels: { boxWidth: 9, boxHeight: 9, usePointStyle: true, pointStyle: "rectRounded",
            color: "#64748b", font: { size: 11.5, family: "inherit" } },
        },
        tooltip: {
          backgroundColor: "rgba(13,22,38,.94)",
          padding: 10,
          cornerRadius: 9,
          displayColors: true,
          titleFont: { size: 12 },
          bodyFont: { size: 12 },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: "#e2e8f0" },
          ticks: { maxTicksLimit: 8, color: "#94a3b8", font: { size: 10.5 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: "#eef2f7" },
          border: { display: false },
          ticks: { precision: 0, color: "#94a3b8", font: { size: 10.5 } },
        },
      },
    }),
    []
  );

  const maxCarga = Math.max(1, ...carga.map((c) => c.value));
  const totalVideo = Math.max(1, videoSla.dentro + videoSla.porSalir + videoSla.fuera);
  const leyendaFlota = [
    { label: "Preventivo del mes al día", valor: flota.alDia, color: COLOR.ok },
    { label: "Preventivo pendiente", valor: flota.pendiente, color: COLOR.warn },
    { label: "Con correctivo abierto", valor: flota.correctivo, color: COLOR.bad },
    { label: "Sin reportar hace 5+ días", valor: flota.sinReporte, color: COLOR.gris },
  ];

  return (
    <div className="space-y-3.5">
      <div className="grid gap-3.5 lg:grid-cols-[1.5fr_1fr]">
        <Panel titulo="Muro de flota" alcance="un recuadro por bus · hoy">
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(16px, 1fr))" }}
          >
            {flota.buses.map((b) => (
              <span
                key={b.code}
                title={`Bus ${b.code} · ${ESTADO_TEXTO[b.estado]}`}
                className="aspect-square rounded-[3px] ring-1 ring-inset ring-white/60"
                style={{ background: ESTADO_COLOR[b.estado] }}
              />
            ))}
          </div>
          <ul className="mt-3.5 grid gap-2 sm:grid-cols-2">
            {leyendaFlota.map((l) => (
              <li
                key={l.label}
                className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-slate-50/70 px-3 py-2"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: l.color }} />
                <span className="flex-1 text-[12px] text-slate-500">{l.label}</span>
                <span className="text-[14px] font-extrabold tabular-nums text-slate-800">{l.valor}</span>
                <span className="w-9 text-right text-[11px] tabular-nums text-slate-400">
                  {flota.total > 0 ? Math.round((l.valor / flota.total) * 100) : 0}%
                </span>
              </li>
            ))}
          </ul>
          {flota.alDiaConAlerta > 0 ? (
            <p className="mt-2.5 text-[11px] text-slate-400">
              El muro pinta una sola condición por bus, la más crítica.{" "}
              <b className="text-slate-500">{flota.alDiaConAlerta}</b>{" "}
              {flota.alDiaConAlerta === 1 ? "bus tiene" : "buses tienen"} el preventivo del mes, pero
              se {flota.alDiaConAlerta === 1 ? "muestra" : "muestran"} en otra categoría por una
              alerta activa. El cumplimiento del mes los cuenta.
            </p>
          ) : null}
        </Panel>

        <Panel titulo="Cumplimiento preventivo" alcance={`meta ${cumplimiento.meta} · mes`}>
          <Medidor pct={cumplimiento.pct} />
          <p className="-mt-1 text-center text-[11.5px] text-slate-500">
            {cumplimiento.hechos} de {cumplimiento.meta} buses con preventivo del mes
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              { v: cumplimiento.estaSemana, t: "esta semana" },
              { v: cumplimiento.ritmoDiario, t: "ritmo diario" },
              { v: cumplimiento.requeridoDia, t: "requerido/día" },
            ].map((x) => (
              <div key={x.t} className="rounded-xl border border-border/40 bg-slate-50/70 p-2 text-center">
                <b className="block text-[17px] tabular-nums text-slate-800">
                  {String(x.v).replace(".", ",")}
                </b>
                <span className="text-[10.5px] text-slate-400">{x.t}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11.5px] text-slate-500">
            Al ritmo actual el mes cierra en{" "}
            <b className="text-slate-800">{cumplimiento.proyeccion} buses</b>. Faltan{" "}
            {cumplimiento.diasRestantes} días.
          </p>
        </Panel>
      </div>

      <Panel titulo="Requiere atención" alcance="a la fecha">
        <div
          className={`grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 ${
            verPanico ? "xl:grid-cols-6" : "xl:grid-cols-5"
          }`}
        >
          <Alerta
            label="Casos vencidos (SLA)"
            valor={alertas.casosVencidos}
            sub={alertas.casoMasAntiguoDias > 0 ? `el más antiguo, ${alertas.casoMasAntiguoDias} días` : "sin atraso"}
            color={COLOR.bad}
            href="/cases?status=NUEVO"
          />
          <Alerta
            label="Videos fuera de retención"
            valor={alertas.videosFueraRetencion}
            sub={`evento con más de ${videoSla.diasRetencion} días`}
            color={COLOR.bad}
            href="/video-requests"
          />
          <Alerta label="OTs abiertas +7 días" valor={alertas.otsAntiguas} sub="sin cierre" color={COLOR.warn} />
          <Alerta
            label="Novedades sin responsable"
            valor={alertas.novedadesSinResponsable}
            sub="por asignar"
            color={COLOR.warn}
            href="/novedades?assigned=none"
          />
          {verPanico ? (
            <Alerta
              label="Eventos de pánico incompletos"
              valor={alertas.panicIncompletos}
              sub="faltan clips"
              color={COLOR.violeta}
              href="/video-requests/panic"
            />
          ) : null}
          <Alerta
            label="Buses reincidentes"
            valor={alertas.busesReincidentes}
            sub="3+ correctivos / 30 días"
            color={COLOR.serie2}
          />
        </div>
      </Panel>

      <div className="grid gap-3.5 lg:grid-cols-[1.55fr_1fr]">
        <Panel titulo="Actividad de casos" alcance="día a día · mes">
          <div className="relative h-[220px]">
            <Line data={lineData} options={lineOpts} />
          </div>
          <p className="mt-2 text-[11.5px] text-slate-500">
            Creados <b className="text-slate-800">{actividad.totalCreados}</b> · resueltos{" "}
            <b className="text-slate-800">{actividad.totalResueltos}</b> en el mes.
          </p>
        </Panel>

        <Panel titulo="Preventivos ejecutados" alcance="semana × día">
          <div className="grid gap-1.5" style={{ gridTemplateColumns: "auto repeat(7, 1fr)" }}>
            <span />
            {DIAS_SEMANA.map((d) => (
              <span key={d} className="text-center text-[10px] text-slate-400">
                {d}
              </span>
            ))}
            {preventivosHeat.valores.map((fila, s) => (
              <React.Fragment key={s}>
                <span className="pr-1 text-[10px] text-slate-400">S{s + 1}</span>
                {fila.map((v, d) => (
                  <span
                    key={d}
                    title={`Semana ${s + 1} · ${DIAS_SEMANA[d]}: ${v} preventivos`}
                    className="flex aspect-square items-center justify-center rounded-md text-[10.5px] font-semibold"
                    style={{
                      background:
                        v === 0
                          ? "#eef2f7"
                          : `rgba(22,163,74,${0.18 + 0.72 * (v / Math.max(1, preventivosHeat.max))})`,
                      color: v === 0 ? "transparent" : v / Math.max(1, preventivosHeat.max) > 0.55 ? "#ffffff" : "#14532d",
                    }}
                  >
                    {v || ""}
                  </span>
                ))}
              </React.Fragment>
            ))}
          </div>
          <p className="mt-3 text-[11.5px] text-slate-500">
            Pico de <b className="text-slate-800">{preventivosHeat.max}</b> preventivos en un día.
          </p>
        </Panel>
      </div>

      <div className="grid gap-3.5 lg:grid-cols-3">
        <Panel titulo="Carga por responsable" alcance="casos abiertos">
          {carga.length ? (
            carga.map((c) => (
              <BarraFila
                key={c.label}
                label={c.label}
                valor={c.value}
                max={maxCarga}
                color={c.label === "Sin asignar" ? COLOR.gris : COLOR.serie1}
              />
            ))
          ) : (
            <p className="text-[12px] text-slate-400">Sin casos abiertos.</p>
          )}
        </Panel>

        <Panel titulo="Buses con más correctivos" alcance="últimos 30 días">
          {topBuses.length ? (
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="text-[9.5px] uppercase tracking-[0.08em] text-slate-400">
                  <th className="pb-2 text-left font-bold">Bus</th>
                  <th className="pb-2 text-left font-bold">Falla más reciente</th>
                  <th className="pb-2 text-right font-bold">Casos</th>
                </tr>
              </thead>
              <tbody>
                {topBuses.map((b) => (
                  <tr key={b.code} className="border-t border-border/40">
                    <td className="py-2 font-extrabold text-slate-800">{b.code}</td>
                    <td className="py-2 text-slate-500">
                      <span className="line-clamp-1">{b.falla}</span>
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-500">{b.casos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-[12px] text-slate-400">Sin correctivos en el período.</p>
          )}
        </Panel>

        <Panel titulo="Solicitudes de video abiertas" alcance={`retención ${videoSla.diasRetencion} días`}>
          <BarraFila label="Dentro de retención" valor={videoSla.dentro} max={totalVideo} color={COLOR.ok} />
          <BarraFila label="Por salir (7 días)" valor={videoSla.porSalir} max={totalVideo} color={COLOR.warn} />
          <BarraFila label="Fuera de SLA" valor={videoSla.fuera} max={totalVideo} color={COLOR.bad} />
          <p className="mt-3 text-[11.5px] text-slate-500">
            Una solicitud queda fuera de SLA cuando la fecha del evento supera los{" "}
            <b className="text-slate-800">{videoSla.diasRetencion} días</b>: el NVR ya no conserva el
            material.
          </p>
        </Panel>
      </div>
    </div>
  );
}
