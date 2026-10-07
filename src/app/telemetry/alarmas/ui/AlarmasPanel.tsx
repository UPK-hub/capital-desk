"use client";

import * as React from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  AlarmaPorCodigo,
  AlarmaPorNivel,
  FilaBus,
  PuntoTendencia,
  ResumenAlarmas,
} from "@/lib/telemetry/alarms";

/**
 * Tablero visual de alarmas.
 *
 * Reglas de color: los TIPOS de alarma usan la paleta categorica en orden fijo
 * (nunca ciclada); los NIVELES usan la paleta de estado por severidad. En los
 * dos casos la leyenda y el numero van siempre al lado, para que el color nunca
 * cargue solo con el significado. Un solo eje por grafico.
 */

// Paleta categorica, orden fijo. Siete tipos de alarma, siete ranuras.
const COLOR_TIPO: Record<string, string> = {
  ALA1: "#2a78d6", // azul
  ALA2: "#eb6834", // naranja
  ALA3: "#1baf7a", // aqua
  ALA4: "#eda100", // amarillo
  ALA5: "#e87ba4", // magenta
  ALA6: "#008300", // verde
  ALA7: "#4a3aa7", // violeta
};

// Severidad, no identidad: paleta de estado.
const COLOR_NIVEL: Record<string, string> = {
  N1: "#d03b3b", // critico superior
  N2: "#ec835a", // tolerable superior
  N3: "#898781", // normal
  N4: "#fab219", // tolerable inferior
  N5: "#2a78d6", // critico inferior
};

const ORDEN_TIPOS = ["ALA1", "ALA2", "ALA3", "ALA4", "ALA5", "ALA6", "ALA7"];

/**
 * Iconos propios en SVG. Se dibujan aqui en vez de usar una libreria para no
 * depender de que un nombre concreto exista en la version instalada.
 */
type PropsIcono = { className?: string };

function Svg({ className, children }: PropsIcono & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

/** Triangulo de alerta. */
const IcAlerta = (p: PropsIcono) => (
  <Svg {...p}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </Svg>
);

/** Escudo con señal: severidad. */
const IcEscudo = (p: PropsIcono) => (
  <Svg {...p}>
    <path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V6l8-3 8 3Z" />
    <path d="M12 8v4" />
    <path d="M12 16h.01" />
  </Svg>
);

/** Bus. */
const IcBus = (p: PropsIcono) => (
  <Svg {...p}>
    <path d="M4 17V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11" />
    <path d="M4 11h16" />
    <path d="M6 17v2" />
    <path d="M18 17v2" />
    <circle cx="7.5" cy="14.5" r="1" />
    <circle cx="16.5" cy="14.5" r="1" />
  </Svg>
);

/** Flecha ascendente: aceleracion brusca. */
const IcAceleracion = (p: PropsIcono) => (
  <Svg {...p}>
    <path d="M3 17 9 11l4 4 8-8" />
    <path d="M15 7h6v6" />
  </Svg>
);

/** Octagono: frenada brusca. */
const IcFrenada = (p: PropsIcono) => (
  <Svg {...p}>
    <path d="M8.1 3h7.8L21 8.1v7.8L15.9 21H8.1L3 15.9V8.1Z" />
    <path d="M9 15 15 9" />
  </Svg>
);

/** Velocimetro: exceso de velocidad. */
const IcVelocidad = (p: PropsIcono) => (
  <Svg {...p}>
    <path d="M4 18a8 8 0 1 1 16 0" />
    <path d="M12 14 16 9" />
    <circle cx="12" cy="18" r="1.2" />
  </Svg>
);

/** Pesa: exceso de peso. */
const IcPeso = (p: PropsIcono) => (
  <Svg {...p}>
    <circle cx="12" cy="6" r="2.5" />
    <path d="M7.5 10h9l2 10h-13Z" />
  </Svg>
);

/** Camara del conductor tachada. */
const IcCamaraConductor = (p: PropsIcono) => (
  <Svg {...p}>
    <path d="M14 7H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8" />
    <path d="m16 10 5-3v10l-3-1.8" />
    <path d="M3 3l18 18" />
  </Svg>
);

/** Camara CCTV tachada. */
const IcCamaraCctv = (p: PropsIcono) => (
  <Svg {...p}>
    <path d="M5 8h10l3 3v4H5z" />
    <path d="M8 15v4" />
    <path d="M18 11h3" />
    <path d="M3 3l18 18" />
  </Svg>
);

/** Flecha de giro: giro brusco. */
const IcGiro = (p: PropsIcono) => (
  <Svg {...p}>
    <path d="M4 20v-7a4 4 0 0 1 4-4h10" />
    <path d="m14 5 4 4-4 4" />
  </Svg>
);

const ICONO_TIPO: Record<string, React.ComponentType<{ className?: string }>> = {
  ALA1: IcAceleracion,
  ALA2: IcFrenada,
  ALA3: IcVelocidad,
  ALA4: IcPeso,
  ALA5: IcCamaraConductor,
  ALA6: IcCamaraCctv,
  ALA7: IcGiro,
};

/** Minigrafico de linea para la tarjeta de cada tipo. Sin ejes ni etiquetas. */
function Sparkline({ valores, color }: { valores: number[]; color: string }) {
  if (valores.length < 2 || valores.every((v) => v === 0)) {
    return <div className="h-7" aria-hidden />;
  }
  const max = Math.max(...valores, 1);
  const paso = 100 / (valores.length - 1);
  const puntos = valores.map((v, i) => `${(i * paso).toFixed(2)},${(28 - (v / max) * 26).toFixed(2)}`);
  const area = `0,28 ${puntos.join(" ")} 100,28`;
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="h-7 w-full" aria-hidden>
      <polygon points={area} fill={color} opacity={0.16} />
      <polyline
        points={puntos.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function nfmt(n: number) {
  return new Intl.NumberFormat("es-CO").format(Math.round(n ?? 0));
}

function CajaTooltip({
  titulo,
  filas,
}: {
  titulo: string;
  filas: { etiqueta: string; valor: string; color?: string }[];
}) {
  if (filas.length === 0) return null;
  return (
    <div className="max-w-xs rounded-md border border-border/70 bg-background px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-foreground">{titulo}</p>
      {filas.map((f) => (
        <p key={f.etiqueta} className="mt-1 flex items-center gap-2 text-muted-foreground">
          {f.color ? <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: f.color }} /> : null}
          <span className="truncate">{f.etiqueta}</span>
          <span className="ml-auto font-medium tabular-nums text-foreground">{f.valor}</span>
        </p>
      ))}
    </div>
  );
}

function Variacion({ actual, anterior }: { actual: number; anterior: number }) {
  if (anterior <= 0) return null;
  const delta = ((actual - anterior) / anterior) * 100;
  const sube = delta > 0;
  // En alarmas, subir es malo: el color refuerza la etiqueta, no la reemplaza.
  const color = Math.abs(delta) < 1 ? "#898781" : sube ? "#d03b3b" : "#0ca30c";
  return (
    <span className="text-xs font-medium" style={{ color }}>
      {sube ? "▲" : "▼"} {Math.abs(delta).toFixed(0)}% vs. periodo anterior
    </span>
  );
}

export default function AlarmasPanel({
  resumen,
  porCodigo,
  porNivel,
  tendencia,
  ranking,
  hrefTipo,
  codeActivo,
}: {
  resumen: ResumenAlarmas;
  porCodigo: AlarmaPorCodigo[];
  porNivel: AlarmaPorNivel[];
  tendencia: PuntoTendencia[];
  ranking: FilaBus[];
  hrefTipo: (code: string | null) => string;
  codeActivo: string | null;
}) {
  const tiposConDato = React.useMemo(
    () => ORDEN_TIPOS.filter((c) => tendencia.some((p) => Number(p[c] ?? 0) > 0)),
    [tendencia]
  );

  const totalGeneral = porCodigo.reduce((acc, a) => acc + a.total, 0);
  const maxBus = Math.max(1, ...ranking.map((r) => r.total));
  const totalNiveles = porNivel.reduce((a, n) => a + n.total, 0);

  return (
    <div className="space-y-4">
      {/* Cifras de cabecera */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="sts-card relative overflow-hidden p-5">
          <span className="absolute inset-x-0 top-0 h-1" style={{ background: "#2a78d6" }} />
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Alarmas en el periodo
              </p>
              <p className="mt-2 text-4xl font-semibold leading-none tabular-nums">{nfmt(resumen.total)}</p>
            </div>
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
              style={{ background: "#2a78d61f", color: "#2a78d6" }}
            >
              <IcAlerta className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2">
            <Variacion actual={resumen.total} anterior={resumen.totalPeriodoAnterior} />
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {nfmt(resumen.promedioDia)} por día en {resumen.dias} {resumen.dias === 1 ? "día" : "días"}
          </p>
        </div>

        <div className="sts-card relative overflow-hidden p-5">
          <span className="absolute inset-x-0 top-0 h-1" style={{ background: "#d03b3b" }} />
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Críticas (N1 y N5)
              </p>
              <p className="mt-2 text-4xl font-semibold leading-none tabular-nums" style={{ color: "#d03b3b" }}>
                {nfmt(resumen.criticas)}
              </p>
            </div>
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
              style={{ background: "#d03b3b1f", color: "#d03b3b" }}
            >
              <IcEscudo className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{
                width: `${resumen.total > 0 ? Math.max(1, (resumen.criticas / resumen.total) * 100) : 0}%`,
                background: "#d03b3b",
              }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {resumen.total > 0 ? ((resumen.criticas / resumen.total) * 100).toFixed(1) : "0"}% del total del periodo
          </p>
        </div>

        <div className="sts-card relative overflow-hidden p-5">
          <span className="absolute inset-x-0 top-0 h-1" style={{ background: "#eda100" }} />
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Buses con alarmas
              </p>
              <p className="mt-2 text-4xl font-semibold leading-none tabular-nums">{nfmt(resumen.buses)}</p>
            </div>
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
              style={{ background: "#eda1001f", color: "#eda100" }}
            >
              <IcBus className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {resumen.topBus
              ? `El que más reporta es ${resumen.topBus.busCode} con ${nfmt(resumen.topBus.total)}`
              : "Sin alarmas en el periodo"}
          </p>
        </div>

        <div className="sts-card relative overflow-hidden p-5">
          <span
            className="absolute inset-x-0 top-0 h-1"
            style={{ background: COLOR_TIPO[resumen.topCode?.code ?? ""] ?? "#898781" }}
          />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Tipo más frecuente
              </p>
              <p className="mt-2 line-clamp-2 text-xl font-semibold leading-tight" title={resumen.topCode?.label}>
                {resumen.topCode?.label ?? "—"}
              </p>
            </div>
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
              style={{
                background: `${COLOR_TIPO[resumen.topCode?.code ?? ""] ?? "#898781"}1f`,
                color: COLOR_TIPO[resumen.topCode?.code ?? ""] ?? "#898781",
              }}
            >
              {React.createElement(ICONO_TIPO[resumen.topCode?.code ?? ""] ?? IcAlerta, {
                className: "h-4 w-4",
              })}
            </span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {resumen.topCode
              ? `${nfmt(resumen.topCode.total)} eventos · ${resumen.topCode.code} · ${
                  resumen.total > 0 ? ((resumen.topCode.total / resumen.total) * 100).toFixed(0) : 0
                }% del total`
              : "Sin datos"}
          </p>
        </div>
      </div>

      {/* Una tarjeta por tipo de alarma: filtra el tablero al hacer clic. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {porCodigo.map((a) => {
          const activo = codeActivo === a.code;
          const color = COLOR_TIPO[a.code] ?? "#898781";
          const Icono = ICONO_TIPO[a.code] ?? IcAlerta;
          const pctCriticas = a.total > 0 ? (a.criticas / a.total) * 100 : 0;
          const serie = tendencia.map((p) => Number(p[a.code] ?? 0));
          const share = totalGeneral > 0 ? (a.total / totalGeneral) * 100 : 0;

          return (
            <Link
              key={a.code}
              href={hrefTipo(activo ? null : a.code)}
              className={`sts-card group relative flex flex-col overflow-hidden p-4 transition hover:-translate-y-0.5 hover:shadow-lg ${
                activo ? "ring-2 ring-offset-1" : ""
              }`}
              style={activo ? ({ ["--tw-ring-color" as any]: color } as React.CSSProperties) : undefined}
              title={`${a.label}: ${nfmt(a.total)} eventos`}
            >
              <span className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />

              <div className="flex items-start justify-between gap-2">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: `${color}1f`, color }}
                >
                  <Icono className="h-4 w-4" />
                </span>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground">
                  {a.code}
                </span>
              </div>

              <p className="mt-3 text-2xl font-semibold leading-none tabular-nums">{nfmt(a.total)}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted-foreground" title={a.label}>
                {a.label}
              </p>

              <div className="mt-2 -mx-1">
                <Sparkline valores={serie} color={color} />
              </div>

              <div className="mt-1 flex items-center justify-between gap-2 border-t pt-2 text-[11px]">
                {a.criticas > 0 ? (
                  <span className="font-medium" style={{ color: "#d03b3b" }}>
                    {nfmt(a.criticas)} críticas
                  </span>
                ) : (
                  <span className="text-muted-foreground">Sin críticas</span>
                )}
                <span className="tabular-nums text-muted-foreground">{share.toFixed(0)}%</span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Tendencia y severidad */}
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="sts-card p-5 xl:col-span-2">
          <h3 className="text-sm font-semibold">Evolución de las alarmas</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            {resumen.dias <= 1 ? "Por hora del día, en hora de Bogotá" : "Por día, apilado por tipo de alarma"}
          </p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={tendencia} margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
                <CartesianGrid stroke="currentColor" strokeOpacity={0.12} vertical={false} />
                <XAxis
                  dataKey="etiqueta"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "#898781" }}
                  minTickGap={20}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "#898781" }}
                  width={48}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ stroke: "#898781", strokeOpacity: 0.4 }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const filas = payload
                      .filter((p) => Number(p.value) > 0)
                      .sort((a, b) => Number(b.value) - Number(a.value))
                      .map((p) => ({
                        etiqueta:
                          porCodigo.find((c) => c.code === p.dataKey)?.label ?? String(p.dataKey),
                        valor: nfmt(Number(p.value)),
                        color: COLOR_TIPO[String(p.dataKey)],
                      }));
                    return <CajaTooltip titulo={String(label)} filas={filas} />;
                  }}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  height={28}
                  iconType="circle"
                  iconSize={8}
                  formatter={(v) => (
                    <span className="text-[11px] text-muted-foreground">{String(v)}</span>
                  )}
                />
                {tiposConDato.map((code) => (
                  <Area
                    key={code}
                    type="monotone"
                    dataKey={code}
                    stackId="alarmas"
                    stroke={COLOR_TIPO[code]}
                    strokeWidth={2}
                    fill={COLOR_TIPO[code]}
                    fillOpacity={0.22}
                    dot={false}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="sts-card p-5">
          <h3 className="text-sm font-semibold">Severidad</h3>
          <p className="mb-3 text-xs text-muted-foreground">Distribución por nivel del diccionario</p>
          <ul className="space-y-3">
            {porNivel.map((n) => {
              const pct = totalNiveles > 0 ? (n.total / totalNiveles) * 100 : 0;
              return (
                <li key={n.level}>
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="font-medium text-foreground">
                      {n.level}
                      <span className="ml-1 font-normal text-muted-foreground">{n.label}</span>
                    </span>
                    <span className="tabular-nums font-medium">{nfmt(n.total)}</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(pct, n.total > 0 ? 1.5 : 0)}%`, background: COLOR_NIVEL[n.level] }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-[11px] leading-snug text-muted-foreground">
            N1 y N5 son los extremos críticos y son los que exigen gestión. N3 corresponde a lectura
            normal y no genera alarma.
          </p>
        </div>
      </div>

      {/* Ranking de buses */}
      <div className="sts-card p-5">
        <h3 className="text-sm font-semibold">Buses con más alarmas</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Los {ranking.length} primeros del periodo. La franja roja marca las críticas.
        </p>
        {ranking.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Sin alarmas en el periodo.</p>
        ) : (
          <div style={{ height: Math.max(220, ranking.length * 30) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={ranking}
                layout="vertical"
                margin={{ top: 0, right: 48, bottom: 0, left: 8 }}
                barCategoryGap={6}
              >
                <CartesianGrid stroke="currentColor" strokeOpacity={0.12} horizontal={false} />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "#898781" }}
                  domain={[0, Math.ceil(maxBus * 1.1)]}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="busCode"
                  tickLine={false}
                  axisLine={false}
                  width={72}
                  tick={{ fontSize: 11, fill: "#898781" }}
                />
                <Tooltip
                  cursor={{ fill: "#898781", fillOpacity: 0.08 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const fila = payload[0].payload as FilaBus;
                    const detalle = Object.entries(fila.porCodigo)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 4)
                      .map(([code, n]) => ({
                        etiqueta: porCodigo.find((c) => c.code === code)?.label ?? code,
                        valor: nfmt(n),
                        color: COLOR_TIPO[code],
                      }));
                    return (
                      <CajaTooltip
                        titulo={`${fila.busCode}${fila.plate ? ` · ${fila.plate}` : ""}`}
                        filas={[
                          { etiqueta: "Total", valor: nfmt(fila.total) },
                          { etiqueta: "Críticas", valor: nfmt(fila.criticas), color: "#d03b3b" },
                          ...detalle,
                        ]}
                      />
                    );
                  }}
                />
                <Bar dataKey="total" radius={[0, 4, 4, 0]} barSize={16}>
                  {ranking.map((r) => (
                    <Cell
                      key={r.busCode}
                      fill={r.criticas / Math.max(1, r.total) > 0.3 ? "#d03b3b" : "#2a78d6"}
                    />
                  ))}
                  <LabelList
                    dataKey="total"
                    position="right"
                    className="fill-foreground"
                    style={{ fontSize: 11 }}
                    formatter={(v: number) => nfmt(v)}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          Las barras en rojo son buses donde más del 30% de sus alarmas son críticas.
        </p>
      </div>
    </div>
  );
}
