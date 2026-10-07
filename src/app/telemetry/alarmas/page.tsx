import Link from "next/link";
import dynamic from "next/dynamic";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ALARM_CATALOG, ALARM_LEVELS } from "@/lib/telemetry/catalog";
import { getTableroAlarmas, listarEventos, type FiltroAlarmas } from "@/lib/telemetry/alarms";
import { addDaysLabel, bogToday, labelKey } from "@/lib/telemetry/tz";
import { formatFechaHoraCO } from "@/lib/datetime";
import AlarmasPanel from "./ui/AlarmasPanel";

const AlarmasMapa = dynamic(() => import("./ui/AlarmasMapa"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] items-center justify-center rounded-2xl border border-border bg-muted/20 text-sm text-muted-foreground">
      Cargando mapa...
    </div>
  ),
});

export const dynamicParams = true;
export const revalidate = 0;

type SearchParams = {
  rango?: string;
  desde?: string;
  hasta?: string;
  bus?: string;
  code?: string;
  level?: string;
};

const RANGOS = [
  { clave: "hoy", etiqueta: "Hoy", dias: 0 },
  { clave: "7", etiqueta: "7 días", dias: 6 },
  { clave: "30", etiqueta: "30 días", dias: 29 },
  { clave: "90", etiqueta: "90 días", dias: 89 },
];

/** Etiqueta de día COT a partir de un texto AAAA-MM-DD. */
function etiquetaDesdeTexto(valor: string | undefined): Date | null {
  if (!valor) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

export default async function AlarmasPage({ searchParams }: { searchParams?: SearchParams }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const tenantId = (session.user as any).tenantId as string;

  // --- Rango ---------------------------------------------------------------
  const hoy = bogToday();
  const rangoClave = RANGOS.some((r) => r.clave === searchParams?.rango)
    ? String(searchParams?.rango)
    : "hoy";
  const rango = RANGOS.find((r) => r.clave === rangoClave)!;

  const desdeManual = etiquetaDesdeTexto(searchParams?.desde);
  const hastaManual = etiquetaDesdeTexto(searchParams?.hasta);
  const personalizado = Boolean(desdeManual && hastaManual);

  const desde = personalizado ? (desdeManual as Date) : addDaysLabel(hoy, -rango.dias);
  const hasta = personalizado ? (hastaManual as Date) : hoy;

  const busCode = String(searchParams?.bus ?? "").trim() || null;
  const code = ALARM_CATALOG.some((a) => a.code === searchParams?.code)
    ? String(searchParams?.code)
    : null;
  const level = ALARM_LEVELS.some((l) => l.code === searchParams?.level)
    ? String(searchParams?.level)
    : null;

  const filtro: FiltroAlarmas = { tenantId, desde, hasta, busCode, code, level };

  const [tablero, eventos, buses] = await Promise.all([
    getTableroAlarmas(filtro),
    listarEventos(filtro, 300),
    prisma.bus.findMany({
      where: { tenantId, active: true },
      select: { code: true, plate: true },
      orderBy: { code: "asc" },
      take: 500,
    }),
  ]);

  // --- Enlaces que preservan el resto de filtros ---------------------------
  function construirHref(cambios: Partial<Record<string, string | null>>) {
    const p = new URLSearchParams();
    const base: Record<string, string | null> = {
      rango: personalizado ? null : rangoClave === "hoy" ? null : rangoClave,
      desde: personalizado ? labelKey(desde) : null,
      hasta: personalizado ? labelKey(hasta) : null,
      bus: busCode,
      code,
      level,
      ...cambios,
    };
    for (const [k, v] of Object.entries(base)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/telemetry/alarmas?${s}` : "/telemetry/alarmas";
  }

  const hrefExport = `/api/telemetry/alarmas/export?${new URLSearchParams({
    desde: labelKey(desde),
    hasta: labelKey(hasta),
    ...(busCode ? { bus: busCode } : {}),
    ...(code ? { code } : {}),
    ...(level ? { level } : {}),
  }).toString()}`;

  const placaDe = new Map(buses.map((b) => [b.code, b.plate]));

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Telemetría</p>
          <h1 className="text-xl font-semibold">Alarmas de la flota</h1>
          <p className="text-sm text-muted-foreground">
            Exceso de velocidad, frenada y aceleración brusca, giro brusco y demás alarmas del
            diccionario de datos, con su severidad y su ubicación.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/telemetry" className="sts-btn-ghost h-9 px-4 text-sm">
            Volver a Telemetría
          </Link>
          <a href={hrefExport} className="sts-btn-primary h-9 px-4 text-sm">
            Exportar CSV
          </a>
        </div>
      </div>

      {/* Filtros */}
      <div className="sts-card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Periodo</span>
          {RANGOS.map((r) => {
            const activo = !personalizado && r.clave === rangoClave;
            return (
              <Link
                key={r.clave}
                href={`/telemetry/alarmas?${new URLSearchParams({
                  ...(r.clave === "hoy" ? {} : { rango: r.clave }),
                  ...(busCode ? { bus: busCode } : {}),
                  ...(code ? { code } : {}),
                  ...(level ? { level } : {}),
                }).toString()}`}
                className={`inline-flex h-8 items-center rounded-md px-3 text-sm font-medium ${
                  activo
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border/60"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                {r.etiqueta}
              </Link>
            );
          })}
          <span className="ml-2 text-xs text-muted-foreground">
            {labelKey(desde)} a {labelKey(hasta)}
          </span>
        </div>

        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-muted-foreground">
            Desde
            <input
              type="date"
              name="desde"
              defaultValue={labelKey(desde)}
              className="mt-1 block h-9 rounded-md border px-3 text-sm"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Hasta
            <input
              type="date"
              name="hasta"
              defaultValue={labelKey(hasta)}
              className="mt-1 block h-9 rounded-md border px-3 text-sm"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Bus
            <input
              type="text"
              name="bus"
              list="lista-buses"
              defaultValue={busCode ?? ""}
              placeholder="Todos"
              className="mt-1 block h-9 w-36 rounded-md border px-3 text-sm"
            />
            <datalist id="lista-buses">
              {buses.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.plate ?? ""}
                </option>
              ))}
            </datalist>
          </label>
          <label className="text-xs text-muted-foreground">
            Tipo de alarma
            <select
              name="code"
              defaultValue={code ?? ""}
              className="mt-1 block h-9 w-56 rounded-md border px-2 text-sm"
            >
              <option value="">Todas</option>
              {ALARM_CATALOG.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} · {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Nivel
            <select
              name="level"
              defaultValue={level ?? ""}
              className="mt-1 block h-9 w-48 rounded-md border px-2 text-sm"
            >
              <option value="">Todos</option>
              {ALARM_LEVELS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.code} · {l.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="sts-btn-primary h-9 px-4 text-sm">
            Aplicar
          </button>
          {busCode || code || level || personalizado ? (
            <Link href="/telemetry/alarmas" className="sts-btn-ghost h-9 px-4 text-sm">
              Limpiar
            </Link>
          ) : null}
        </form>
      </div>

      <AlarmasPanel
        resumen={tablero.resumen}
        porCodigo={tablero.porCodigo}
        porNivel={tablero.porNivel}
        tendencia={tablero.tendencia}
        ranking={tablero.ranking}
        hrefTipo={(c) => construirHref({ code: c })}
        codeActivo={code}
      />

      {/* Mapa */}
      <div className="sts-card p-5">
        <h3 className="text-sm font-semibold">Dónde ocurrieron</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Hasta 300 alarmas del filtro actual. El tamaño del punto marca las críticas.
        </p>
        <AlarmasMapa eventos={eventos} />
      </div>

      {/* Detalle */}
      <div className="sts-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 p-5 pb-3">
          <div>
            <h3 className="text-sm font-semibold">Detalle de eventos</h3>
            <p className="text-xs text-muted-foreground">
              Los {eventos.length} más recientes del filtro. Para el periodo completo, usa Exportar CSV.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-y bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Fecha y hora</th>
                <th className="px-4 py-2 font-medium">Bus</th>
                <th className="px-4 py-2 font-medium">Placa</th>
                <th className="px-4 py-2 font-medium">Alarma</th>
                <th className="px-4 py-2 font-medium">Nivel</th>
                <th className="px-4 py-2 text-right font-medium">Velocidad</th>
                <th className="px-4 py-2 font-medium">Ubicación</th>
              </tr>
            </thead>
            <tbody>
              {eventos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No hay alarmas con estos filtros.
                  </td>
                </tr>
              ) : (
                eventos.map((e) => {
                  const critica = e.level === "N1" || e.level === "N5";
                  return (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="whitespace-nowrap px-4 py-2 tabular-nums">
                        {e.eventAt ? formatFechaHoraCO(new Date(e.eventAt)) : "—"}
                      </td>
                      <td className="px-4 py-2 font-medium">{e.busCode}</td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {placaDe.get(e.busCode) ?? "—"}
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-xs text-muted-foreground">{e.code}</span>{" "}
                        {e.label}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1"
                          style={
                            critica
                              ? { color: "#d03b3b", background: "#d03b3b14", borderColor: "transparent" }
                              : { color: "inherit" }
                          }
                        >
                          {e.level || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {e.velocidad != null ? `${e.velocidad} km/h` : "—"}
                      </td>
                      <td className="px-4 py-2">
                        {e.lat != null && e.lng != null ? (
                          <a
                            className="text-xs underline"
                            href={`https://www.google.com/maps?q=${e.lat},${e.lng}&t=k`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {e.lat.toFixed(5)}, {e.lng.toFixed(5)}
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">Sin GPS</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
