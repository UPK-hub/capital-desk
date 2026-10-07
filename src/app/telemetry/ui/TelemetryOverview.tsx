"use client";

import * as React from "react";
import Link from "next/link";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { AlarmRow, ReportStatus, TelemetryTotals } from "./TelemetryDashboard";

/**
 * Cabecera ejecutiva del modulo de telemetria.
 *
 * Responde de un vistazo: cuanta flota esta reportando, de que esta compuesta
 * la telemetria del periodo y cuales son las alarmas de conduccion. Los numeros
 * y las etiquetas van siempre junto al color, nunca el color solo.
 */

const AZUL = "#2a78d6";
const NARANJA = "#eb6834";
const AQUA = "#1baf7a";
const AMARILLO = "#eda100";
const VERDE_OK = "#0ca30c";
const ROJO = "#d03b3b";
const GRIS = "#898781";

// Alarmas de conduccion que se destacan arriba, en el orden que importa.
const DESTACADAS: { code: string; titulo: string; color: string }[] = [
  { code: "ALA3", titulo: "Exceso de velocidad", color: ROJO },
  { code: "ALA2", titulo: "Frenada brusca", color: NARANJA },
  { code: "ALA1", titulo: "Aceleración brusca", color: AMARILLO },
  { code: "ALA7", titulo: "Giro brusco", color: AZUL },
];

function nfmt(n: number) {
  return new Intl.NumberFormat("es-CO").format(Math.round(n ?? 0));
}

function Dona({
  datos,
  centroValor,
  centroEtiqueta,
}: {
  datos: { nombre: string; valor: number; color: string }[];
  centroValor: string;
  centroEtiqueta: string;
}) {
  const total = datos.reduce((a, d) => a + d.valor, 0);
  return (
    <div className="relative h-[168px] w-[168px] shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={datos.filter((d) => d.valor > 0)}
            dataKey="valor"
            nameKey="nombre"
            innerRadius={56}
            outerRadius={80}
            paddingAngle={2}
            stroke="none"
            startAngle={90}
            endAngle={-270}
          >
            {datos
              .filter((d) => d.valor > 0)
              .map((d) => (
                <Cell key={d.nombre} fill={d.color} />
              ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p: any = payload[0];
              const pct = total > 0 ? (Number(p.value) / total) * 100 : 0;
              return (
                <div className="rounded-md border border-border/70 bg-background px-3 py-2 text-xs shadow-lg">
                  <p className="font-medium text-foreground">{p.name}</p>
                  <p className="text-muted-foreground">
                    {nfmt(Number(p.value))} ({pct.toFixed(1)}%)
                  </p>
                </div>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold leading-none tabular-nums">{centroValor}</span>
        <span className="mt-1 text-[11px] text-muted-foreground">{centroEtiqueta}</span>
      </div>
    </div>
  );
}

function Leyenda({ datos, total }: { datos: { nombre: string; valor: number; color: string }[]; total: number }) {
  return (
    <ul className="min-w-0 flex-1 space-y-2">
      {datos.map((d) => {
        const pct = total > 0 ? (d.valor / total) * 100 : 0;
        return (
          <li key={d.nombre} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{d.nombre}</span>
            <span className="shrink-0 font-medium tabular-nums">{nfmt(d.valor)}</span>
            <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {pct.toFixed(0)}%
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default function TelemetryOverview({
  totals,
  reportStatus,
  alarms,
}: {
  totals: TelemetryTotals;
  reportStatus: ReportStatus;
  alarms: AlarmRow[];
}) {
  const flota = [
    { nombre: "Reportando hoy", valor: reportStatus.reportedToday, color: VERDE_OK },
    { nombre: "Silenciosas", valor: reportStatus.silent, color: ROJO },
  ];
  const pctReporte =
    reportStatus.total > 0 ? (reportStatus.reportedToday / reportStatus.total) * 100 : 0;

  const composicion = [
    { nombre: "Periódicas P20", valor: totals.p20, color: AZUL },
    { nombre: "Periódicas P60", valor: totals.p60, color: AQUA },
    { nombre: "Eventos", valor: totals.eventos, color: AMARILLO },
    { nombre: "Alarmas", valor: totals.alarmas, color: NARANJA },
  ];

  // Totales por codigo de alarma, sumando todos sus niveles.
  const porCodigo = new Map<string, { total: number; criticas: number }>();
  for (const a of alarms) {
    const actual = porCodigo.get(a.code) ?? { total: 0, criticas: 0 };
    actual.total += a.total;
    if (a.levelCode === "N1" || a.levelCode === "N5") actual.criticas += a.total;
    porCodigo.set(a.code, actual);
  }
  const totalAlarmas = [...porCodigo.values()].reduce((a, v) => a + v.total, 0);

  return (
    <section className="grid gap-4 xl:grid-cols-3">
      {/* Estado de la flota */}
      <div className="sts-card p-5">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Estado de la flota</h2>
          <span className="text-xs text-muted-foreground">hoy</span>
        </div>
        <div className="flex items-center gap-5">
          <Dona
            datos={flota}
            centroValor={nfmt(reportStatus.total)}
            centroEtiqueta="buses"
          />
          <Leyenda datos={flota} total={reportStatus.total} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {pctReporte.toFixed(0)}% de la flota está enviando tramas hoy.
          {reportStatus.silent > 0
            ? ` Hay ${nfmt(reportStatus.silent)} ${
                reportStatus.silent === 1 ? "bus en silencio" : "buses en silencio"
              }.`
            : " No hay buses en silencio."}
        </p>
      </div>

      {/* Composicion de la telemetria */}
      <div className="sts-card p-5">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Composición de la telemetría</h2>
          <span className="text-xs text-muted-foreground">periodo</span>
        </div>
        <div className="flex items-center gap-5">
          <Dona
            datos={composicion}
            centroValor={
              totals.total >= 1000
                ? `${(totals.total / 1000).toFixed(totals.total >= 10000 ? 0 : 1)} k`
                : nfmt(totals.total)
            }
            centroEtiqueta="tramas"
          />
          <Leyenda datos={composicion} total={totals.total} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Las periódicas son el latido del equipo. Eventos y alarmas son lo que hay que gestionar.
        </p>
      </div>

      {/* Alarmas de conduccion */}
      <div className="sts-card p-5">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Alarmas de conducción</h2>
          <Link href="/telemetry/alarmas" className="text-xs underline-offset-2 hover:underline">
            Ver tablero
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {DESTACADAS.map((d) => {
            const v = porCodigo.get(d.code) ?? { total: 0, criticas: 0 };
            const pct = totalAlarmas > 0 ? (v.total / totalAlarmas) * 100 : 0;
            return (
              <Link
                key={d.code}
                href={`/telemetry/alarmas?code=${d.code}`}
                className="rounded-xl border border-border/60 p-3 transition hover:ring-2 hover:ring-primary/25"
                style={{ background: `${d.color}12` }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {d.code}
                  </span>
                  <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                </div>
                <p className="mt-1.5 text-2xl font-semibold leading-none tabular-nums">
                  {nfmt(v.total)}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{d.titulo}</p>
                <p className="mt-1.5 text-[11px] tabular-nums text-muted-foreground">
                  {pct.toFixed(0)}% del total
                  {v.criticas > 0 ? ` · ${nfmt(v.criticas)} críticas` : ""}
                </p>
              </Link>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {totalAlarmas > 0
            ? `${nfmt(totalAlarmas)} alarmas en total en el periodo.`
            : "Sin alarmas registradas en el periodo."}
        </p>
      </div>
    </section>
  );
}
