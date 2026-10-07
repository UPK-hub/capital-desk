"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Panel de graficos de la replica a OneDrive.
 *
 * Colores por ESTADO, no por serie: se usa la paleta de estado (bueno, aviso,
 * critico) y nunca se apoya solo en el color, siempre hay etiqueta y numero al
 * lado. Un solo eje por grafico.
 */

export type EstadoDato = {
  clave: string;
  etiqueta: string;
  n: number;
  bytes: number;
  color: string;
};

export type PuntoDia = { dia: string; gb: number; archivos: number };
export type PuntoMes = { mes: string; gbReplicado: number; gbPendiente: number };

const COLORES = {
  bueno: "#0ca30c",
  aviso: "#fab219",
  curso: "#2a78d6",
  critico: "#d03b3b",
  neutro: "#898781",
} as const;

function gb(bytes: number) {
  return bytes / 1024 ** 3;
}

function fmtGB(v: number) {
  if (v >= 1000) return `${(v / 1024).toFixed(2)} TB`;
  if (v >= 10) return `${v.toFixed(0)} GB`;
  return `${v.toFixed(1)} GB`;
}

function TooltipCaja({
  titulo,
  filas,
}: {
  titulo: string;
  filas: { etiqueta: string; valor: string; color?: string }[];
}) {
  return (
    <div className="rounded-md border border-border/70 bg-background px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-foreground">{titulo}</p>
      {filas.map((f) => (
        <p key={f.etiqueta} className="mt-1 flex items-center gap-2 text-muted-foreground">
          {f.color ? (
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: f.color }} />
          ) : null}
          <span>{f.etiqueta}</span>
          <span className="ml-auto font-medium tabular-nums text-foreground">{f.valor}</span>
        </p>
      ))}
    </div>
  );
}

export default function ReplicaCharts({
  estados,
  almacenamiento,
  porDia,
  porMes,
}: {
  estados: EstadoDato[];
  almacenamiento: { usadoGB: number; libreGB: number; totalGB: number } | null;
  porDia: PuntoDia[];
  porMes: PuntoMes[];
}) {
  const total = estados.reduce((a, e) => a + e.n, 0);
  const replicado = estados.find((e) => e.clave === "REPLICADO");
  const pendiente = estados.find((e) => e.clave === "PENDIENTE");
  const error = estados.find((e) => e.clave === "ERROR");

  const pct = total > 0 ? (replicado?.n ?? 0) / total : 0;
  const gbReplicados = gb(replicado?.bytes ?? 0);
  const gbPendientes = gb(pendiente?.bytes ?? 0);

  const ocupacion = almacenamiento ? almacenamiento.usadoGB / almacenamiento.totalGB : 0;
  const mesesRestantes = almacenamiento ? almacenamiento.libreGB / 400 : 0;

  const maxDia = Math.max(1, ...porDia.map((d) => d.gb));

  return (
    <div className="space-y-4">
      {/* Fila de cifras. El numero grande responde la pregunta de un vistazo. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="sts-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Videos en el OneDrive del cliente
          </p>
          <p className="mt-2 text-5xl font-semibold leading-none">
            {(pct * 100).toFixed(pct > 0.99 || pct === 0 ? 0 : 1)}
            <span className="text-2xl text-muted-foreground">%</span>
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {(replicado?.n ?? 0).toLocaleString("es-CO")} de {total.toLocaleString("es-CO")} archivos,{" "}
            {fmtGB(gbReplicados)} copiados
          </p>

          {/* Barra de avance por estado: 2 px de separacion entre segmentos. */}
          <div className="mt-4 flex h-3 w-full gap-[2px] overflow-hidden rounded-full">
            {estados
              .filter((e) => e.n > 0)
              .map((e) => (
                <div
                  key={e.clave}
                  className="h-full first:rounded-l-full last:rounded-r-full"
                  style={{ background: e.color, width: `${(e.n / Math.max(1, total)) * 100}%` }}
                  title={`${e.etiqueta}: ${e.n}`}
                />
              ))}
          </div>

          {/* Leyenda con cifra al lado: el color nunca va solo. */}
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            {estados
              .filter((e) => e.n > 0)
              .map((e) => (
                <li key={e.clave} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-2 w-2 rounded-full" style={{ background: e.color }} />
                  {e.etiqueta}
                  <span className="font-medium tabular-nums text-foreground">
                    {e.n.toLocaleString("es-CO")}
                  </span>
                </li>
              ))}
          </ul>

          {error && error.n > 0 ? (
            <p className="mt-3 text-xs" style={{ color: COLORES.critico }}>
              Atencion: {error.n} {error.n === 1 ? "archivo requiere" : "archivos requieren"} revision.
            </p>
          ) : null}
        </div>

        <div className="sts-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Espacio del OneDrive
          </p>
          {almacenamiento ? (
            <>
              <p className="mt-2 text-5xl font-semibold leading-none">
                {almacenamiento.libreGB >= 1024
                  ? (almacenamiento.libreGB / 1024).toFixed(2)
                  : almacenamiento.libreGB.toFixed(0)}
                <span className="text-2xl text-muted-foreground">
                  {almacenamiento.libreGB >= 1024 ? " TB" : " GB"}
                </span>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                libres de {(almacenamiento.totalGB / 1024).toFixed(0)} TB.{" "}
                {almacenamiento.usadoGB.toFixed(0)} GB en uso.
              </p>

              <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, Math.max(1, ocupacion * 100)).toFixed(1)}%`,
                    background:
                      ocupacion > 0.9
                        ? COLORES.critico
                        : ocupacion > 0.75
                        ? COLORES.aviso
                        : COLORES.bueno,
                  }}
                />
              </div>

              <p className="mt-3 text-xs text-muted-foreground">
                Al ritmo actual de la operacion, cerca de 400 GB al mes, alcanza para unos{" "}
                <span className="font-medium text-foreground">{mesesRestantes.toFixed(0)} meses</span>.
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm" style={{ color: COLORES.critico }}>
              No se pudo leer el espacio del OneDrive.
            </p>
          )}
        </div>

        <div className="sts-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Falta por copiar</p>
          <p className="mt-2 text-5xl font-semibold leading-none">
            {fmtGB(gbPendientes).split(" ")[0]}
            <span className="text-2xl text-muted-foreground"> {fmtGB(gbPendientes).split(" ")[1]}</span>
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {(pendiente?.n ?? 0).toLocaleString("es-CO")} archivos en cola
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            El proceso de replica trabaja solo y reintenta los fallos con espera creciente. No hay
            que lanzarlo a mano.
          </p>
        </div>
      </div>

      {/* Dos graficos, una sola medida por eje. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="sts-card p-5">
          <h3 className="text-sm font-semibold">Copiado por día</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Volumen enviado al OneDrive en los últimos 30 días
          </p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={porDia} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                <defs>
                  <linearGradient id="gradDia" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORES.bueno} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={COLORES.bueno} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="currentColor" strokeOpacity={0.12} vertical={false} />
                <XAxis
                  dataKey="dia"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "#898781" }}
                  minTickGap={24}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "#898781" }}
                  width={52}
                  domain={[0, Math.ceil(maxDia * 1.15)]}
                  tickFormatter={(v: number) => `${v} GB`}
                />
                <Tooltip
                  cursor={{ stroke: "#898781", strokeOpacity: 0.4 }}
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <TooltipCaja
                        titulo={String(label)}
                        filas={[
                          {
                            etiqueta: "Copiado",
                            valor: fmtGB(Number(payload[0].value)),
                            color: COLORES.bueno,
                          },
                          {
                            etiqueta: "Archivos",
                            valor: String((payload[0].payload as PuntoDia).archivos),
                          },
                        ]}
                      />
                    ) : null
                  }
                />
                <Area
                  type="monotone"
                  dataKey="gb"
                  stroke={COLORES.bueno}
                  strokeWidth={2}
                  fill="url(#gradDia)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background, #fff)" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="sts-card p-5">
          <h3 className="text-sm font-semibold">Histórico por mes del caso</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Cuánto pesa cada mes y qué parte ya está en el OneDrive
          </p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porMes} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid stroke="currentColor" strokeOpacity={0.12} vertical={false} />
                <XAxis
                  dataKey="mes"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "#898781" }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "#898781" }}
                  width={52}
                  tickFormatter={(v: number) => `${v} GB`}
                />
                <Tooltip
                  cursor={{ fill: "#898781", fillOpacity: 0.08 }}
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <TooltipCaja
                        titulo={String(label)}
                        filas={payload.map((p) => ({
                          etiqueta: p.name === "gbReplicado" ? "En OneDrive" : "Pendiente",
                          valor: fmtGB(Number(p.value)),
                          color: p.name === "gbReplicado" ? COLORES.bueno : COLORES.aviso,
                        }))}
                      />
                    ) : null
                  }
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  height={24}
                  iconType="circle"
                  iconSize={8}
                  formatter={(v) => (
                    <span className="text-xs text-muted-foreground">
                      {v === "gbReplicado" ? "En OneDrive" : "Pendiente"}
                    </span>
                  )}
                />
                <Bar dataKey="gbReplicado" stackId="a" fill={COLORES.bueno} radius={[0, 0, 0, 0]} />
                <Bar dataKey="gbPendiente" stackId="a" fill={COLORES.aviso} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
