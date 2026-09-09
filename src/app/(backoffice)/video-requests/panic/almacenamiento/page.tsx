import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewPanic } from "@/lib/panic/access";
import { PANIC_EXPECTED_CLIPS, PANIC_RETENTION_YEARS } from "@/lib/panic/config";
import { getVolumesUsage } from "@/lib/panic/storage";
import VideoModuleTabs from "../../VideoModuleTabs";
import { fmtBytes, fmtDateTime } from "../format";

export const dynamic = "force-dynamic";

const GB = 1024 * 1024 * 1024;
const DIAS_VENTANA = 30;
const DIAS_GRAFICA = 14;

function pct(parte: number, total: number) {
  if (!total || total <= 0) return 0;
  return Math.min(Math.max((parte / total) * 100, 0), 100);
}

function fmtNumero(valor: number, decimales = 0) {
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(valor);
}

function fmtDias(dias: number | null) {
  if (dias === null || !Number.isFinite(dias)) return "sin dato";
  if (dias >= 365) return `${fmtNumero(dias / 365, 1)} años`;
  if (dias >= 60) return `${fmtNumero(dias / 30, 1)} meses`;
  return `${fmtNumero(dias, 0)} días`;
}

function claseSemaforo(estado: "bien" | "atencion" | "critico") {
  if (estado === "bien") return "bg-emerald-500/15 text-emerald-600";
  if (estado === "atencion") return "bg-amber-500/15 text-amber-600";
  return "bg-red-500/15 text-red-600";
}

function Tile({
  titulo,
  valor,
  detalle,
}: {
  titulo: string;
  valor: string;
  detalle?: string;
}) {
  return (
    <div className="sts-card p-4">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{valor}</p>
      {detalle ? <p className="mt-1 text-xs text-muted-foreground">{detalle}</p> : null}
    </div>
  );
}

export default async function PanicAlmacenamientoPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="sts-card p-6">
          <p className="text-sm">Debes iniciar sesión.</p>
          <Link className="sts-btn-ghost mt-3 text-sm" href="/login">
            Ir a login
          </Link>
        </div>
      </div>
    );
  }

  if (!canViewPanic(session.user as any)) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="sts-card p-6">
          <p className="text-sm">No autorizado.</p>
        </div>
      </div>
    );
  }

  const tenantId = (session.user as any).tenantId as string;
  const ahora = new Date();
  const desdeVentana = new Date(ahora.getTime() - DIAS_VENTANA * 24 * 60 * 60 * 1000);
  const desdeGrafica = new Date(ahora.getTime() - (DIAS_GRAFICA - 1) * 24 * 60 * 60 * 1000);
  desdeGrafica.setHours(0, 0, 0, 0);

  const [
    volumenes,
    eventosTotales,
    eventosIncompletos,
    eventosVentana,
    clipsTotales,
    clipsVentana,
    porVolumen,
    eventosRecientes,
    primerEvento,
  ] = await Promise.all([
    getVolumesUsage(),
    prisma.panicEvent.count({ where: { tenantId } }),
    prisma.panicEvent.count({ where: { tenantId, complete: false } }),
    prisma.panicEvent.count({ where: { tenantId, receivedAt: { gte: desdeVentana } } }),
    prisma.panicVideoClip.aggregate({
      where: { tenantId },
      _count: { _all: true },
      _sum: { sizeBytes: true },
    }),
    prisma.panicVideoClip.aggregate({
      where: { tenantId, receivedAt: { gte: desdeVentana } },
      _count: { _all: true },
      _sum: { sizeBytes: true },
    }),
    prisma.panicVideoClip.groupBy({
      by: ["storage"],
      where: { tenantId },
      _count: { _all: true },
      _sum: { sizeBytes: true },
    }),
    prisma.panicEvent.findMany({
      where: { tenantId, receivedAt: { gte: desdeGrafica } },
      select: { receivedAt: true, totalBytes: true },
      orderBy: { receivedAt: "asc" },
    }),
    prisma.panicEvent.findFirst({
      where: { tenantId },
      orderBy: { receivedAt: "asc" },
      select: { receivedAt: true },
    }),
  ]);

  const bytesTotales = Number(clipsTotales._sum.sizeBytes ?? 0);
  const bytesVentana = Number(clipsVentana._sum.sizeBytes ?? 0);

  const capacidadTotal = volumenes.reduce((acc, v) => acc + (v.totalBytes ?? 0), 0);
  const libreTotal = volumenes.reduce((acc, v) => acc + (v.freeBytes ?? 0), 0);
  const usadoTotal = Math.max(capacidadTotal - libreTotal, 0);

  // Ritmo de consumo: se mide sobre la ventana observada, o desde el primer
  // evento si el módulo lleva menos de 30 días operando.
  const diasObservados = primerEvento
    ? Math.max(
        1,
        Math.min(
          DIAS_VENTANA,
          Math.ceil((ahora.getTime() - primerEvento.receivedAt.getTime()) / (24 * 60 * 60 * 1000))
        )
      )
    : 0;

  const bytesPorDia = diasObservados ? bytesVentana / diasObservados : 0;
  const eventosPorDia = diasObservados ? eventosVentana / diasObservados : 0;
  const bytesPorEvento = eventosVentana ? bytesVentana / eventosVentana : 0;

  const diasAutonomia = bytesPorDia > 0 && libreTotal > 0 ? libreTotal / bytesPorDia : null;
  const fechaLlenado =
    diasAutonomia !== null ? new Date(ahora.getTime() + diasAutonomia * 24 * 60 * 60 * 1000) : null;

  const anosCubiertos = diasAutonomia !== null ? diasAutonomia / 365 : null;
  const estadoRetencion: "bien" | "atencion" | "critico" =
    anosCubiertos === null
      ? "atencion"
      : anosCubiertos >= PANIC_RETENTION_YEARS
      ? "bien"
      : anosCubiertos >= PANIC_RETENTION_YEARS / 2
      ? "atencion"
      : "critico";

  // Actividad diaria de las últimas dos semanas.
  const dias: { etiqueta: string; eventos: number; bytes: number }[] = [];
  for (let i = 0; i < DIAS_GRAFICA; i += 1) {
    const dia = new Date(desdeGrafica.getTime() + i * 24 * 60 * 60 * 1000);
    dias.push({
      etiqueta: new Intl.DateTimeFormat("es-CO", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "America/Bogota",
      }).format(dia),
      eventos: 0,
      bytes: 0,
    });
  }
  for (const evento of eventosRecientes) {
    const indice = Math.floor(
      (evento.receivedAt.getTime() - desdeGrafica.getTime()) / (24 * 60 * 60 * 1000)
    );
    if (indice >= 0 && indice < dias.length) {
      dias[indice].eventos += 1;
      dias[indice].bytes += Number(evento.totalBytes ?? 0);
    }
  }
  const maxEventos = Math.max(1, ...dias.map((d) => d.eventos));

  const usoPorVolumen = new Map<string, { clips: number; bytes: number }>(
    porVolumen.map((fila): [string, { clips: number; bytes: number }] => [
      String(fila.storage),
      { clips: fila._count._all, bytes: Number(fila._sum.sizeBytes ?? 0) },
    ])
  );

  return (
    <div className="mobile-page-shell">
      <header className="mobile-page-header">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 lg:flex-row lg:items-start lg:justify-between lg:px-6 lg:py-0">
          <div className="space-y-1">
            <h1 className="break-words text-xl font-semibold tracking-tight lg:text-3xl">
              Almacenamiento del botón de pánico
            </h1>
            <p className="text-sm text-muted-foreground">
              Estado de los servidores, consumo observado y autonomía frente a la retención de{" "}
              {PANIC_RETENTION_YEARS} años.
            </p>
            <VideoModuleTabs active="almacenamiento" showPanic />
          </div>
        </div>
      </header>

      <div className="mobile-page-content max-w-6xl space-y-6 lg:px-6">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile
            titulo="Activaciones registradas"
            valor={fmtNumero(eventosTotales)}
            detalle={`${fmtNumero(eventosVentana)} en los últimos ${DIAS_VENTANA} días`}
          />
          <Tile
            titulo="Clips almacenados"
            valor={fmtNumero(clipsTotales._count._all)}
            detalle={`${PANIC_EXPECTED_CLIPS} esperados por activación`}
          />
          <Tile
            titulo="Material guardado"
            valor={fmtBytes(bytesTotales)}
            detalle={
              capacidadTotal
                ? `de ${fmtBytes(capacidadTotal)} de capacidad declarada`
                : "capacidad no declarada"
            }
          />
          <Tile
            titulo="Cargues incompletos"
            valor={fmtNumero(eventosIncompletos)}
            detalle="activaciones a las que les faltan clips"
          />
        </section>

        <section className="sts-card p-5">
          <h2 className="text-base font-semibold">Servidores de almacenamiento</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Se escribe en el primero y, cuando baja del mínimo libre, la ingesta pasa sola al
            siguiente.
          </p>

          <div className="mt-4 space-y-5">
            {volumenes.map((volumen) => {
              const uso = usoPorVolumen.get(volumen.key);
              const capacidad = volumen.totalBytes ?? 0;
              const libre = volumen.freeBytes ?? 0;
              const usado = capacidad ? Math.max(capacidad - libre, 0) : uso?.bytes ?? 0;
              const porcentaje = pct(usado, capacidad);
              const umbral = pct(volumen.minFreeBytes, capacidad);

              const estado: "bien" | "atencion" | "critico" = !volumen.usable
                ? "critico"
                : capacidad && libre <= volumen.minFreeBytes * 2
                ? "atencion"
                : "bien";

              return (
                <div key={volumen.key} className="space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">
                        {volumen.key.toUpperCase()}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          {volumen.root}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fmtBytes(usado)} usados de {capacidad ? fmtBytes(capacidad) : "capacidad sin declarar"}
                        {uso ? ` · ${fmtNumero(uso.clips)} clips` : ""}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${claseSemaforo(estado)}`}
                    >
                      {!volumen.usable
                        ? "No disponible"
                        : `${fmtBytes(libre)} libres · ${fmtNumero(porcentaje, 1)}% usado`}
                    </span>
                  </div>

                  <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${
                        estado === "critico"
                          ? "bg-red-500"
                          : estado === "atencion"
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                      }`}
                      style={{ width: `${porcentaje}%` }}
                    />
                    {umbral > 0 && umbral < 100 ? (
                      <div
                        className="absolute top-0 h-full w-px bg-foreground/40"
                        style={{ left: `${100 - umbral}%` }}
                        title={`Umbral de desbordamiento: ${fmtBytes(volumen.minFreeBytes)} libres`}
                      />
                    ) : null}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Umbral de paso al siguiente servidor: {fmtBytes(volumen.minFreeBytes)} libres ·
                    dato de espacio tomado de{" "}
                    {volumen.source === "filesystem"
                      ? "el sistema de archivos"
                      : volumen.source === "contabilidad"
                      ? "la contabilidad de la mesa"
                      : "ninguna fuente disponible"}
                    {volumen.error ? ` · ${volumen.error}` : ""}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile
            titulo="Activaciones por día"
            valor={diasObservados ? fmtNumero(eventosPorDia, 1) : "-"}
            detalle={diasObservados ? `promedio de ${diasObservados} días observados` : "sin datos aún"}
          />
          <Tile
            titulo="Peso por activación"
            valor={eventosVentana ? fmtBytes(bytesPorEvento) : "-"}
            detalle="promedio de las últimas activaciones"
          />
          <Tile
            titulo="Consumo diario"
            valor={bytesPorDia ? fmtBytes(bytesPorDia) : "-"}
            detalle="al ritmo observado"
          />
          <Tile
            titulo="Autonomía restante"
            valor={fmtDias(diasAutonomia)}
            detalle={fechaLlenado ? `se llenaría hacia ${fmtDateTime(fechaLlenado)}` : "sin ritmo medido"}
          />
        </section>

        <section className="sts-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Retención comprometida</h2>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${claseSemaforo(estadoRetencion)}`}>
              {anosCubiertos === null
                ? "Sin ritmo medido"
                : anosCubiertos >= PANIC_RETENTION_YEARS
                ? `Alcanza para ${fmtNumero(anosCubiertos, 1)} años`
                : `Alcanza para ${fmtNumero(anosCubiertos, 1)} de ${PANIC_RETENTION_YEARS} años`}
            </span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {anosCubiertos === null
              ? "Todavía no hay consumo suficiente para proyectar. La medición se vuelve confiable con algunas semanas de operación."
              : anosCubiertos >= PANIC_RETENTION_YEARS
              ? `Con el ritmo actual, el espacio disponible cubre la política de ${PANIC_RETENTION_YEARS} años. La mesa no elimina material de botón de pánico.`
              : `Con el ritmo actual el espacio se agota antes de cumplir los ${PANIC_RETENTION_YEARS} años comprometidos. Conviene ampliar disco o revisar el volumen de material que envían los equipos.`}
          </p>
        </section>

        <section className="sts-card p-5">
          <h2 className="text-base font-semibold">Actividad de las últimas dos semanas</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Activaciones recibidas por día y material asociado.
          </p>

          <div className="mt-5 flex items-end gap-2">
            {dias.map((dia) => (
              <div key={dia.etiqueta} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {dia.eventos || ""}
                </span>
                <div
                  className="w-full rounded-t bg-sky-600/80"
                  style={{ height: `${Math.max((dia.eventos / maxEventos) * 96, dia.eventos ? 6 : 2)}px` }}
                  title={`${dia.etiqueta}: ${dia.eventos} activaciones · ${fmtBytes(dia.bytes)}`}
                />
                <span className="text-[10px] text-muted-foreground">{dia.etiqueta}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
