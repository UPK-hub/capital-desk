import Link from "next/link";
import { notFound } from "next/navigation";
import { PanicClipStatus, Role } from "@prisma/client";
import type { PanicVideoClip } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManagePanic, canViewPanic } from "@/lib/panic/access";
import { PANIC_CAMERAS_PER_BUS, PANIC_EXPECTED_CLIPS, retentionUntil } from "@/lib/panic/config";
import VideoModuleTabs from "../../VideoModuleTabs";
import PanicManagePanel from "../PanicManagePanel";
import { CLIP_STATUS_LABEL, STATUS_LABEL, fmtBytes, fmtDateTime, fmtDuration } from "../format";

type ClipRow = PanicVideoClip;

type CamaraAgrupada = {
  key: string;
  canal: number | null;
  codigo: string | null;
  previo: ClipRow | null;
  posterior: ClipRow | null;
  extras: ClipRow[];
};

/**
 * Cada cámara envía dos archivos por activación: el minuto previo y los cinco
 * minutos posteriores. La vista los agrupa por cámara para que la revisión se
 * haga cámara a cámara y el tramo que falta se identifique de inmediato.
 */
function agruparPorCamara(clips: ClipRow[]): CamaraAgrupada[] {
  const mapa = new Map<string, CamaraAgrupada>();

  for (const clip of clips) {
    const key = clip.cameraKey || clip.cameraCode || clip.id;
    let grupo = mapa.get(key);
    if (!grupo) {
      grupo = { key, canal: null, codigo: null, previo: null, posterior: null, extras: [] };
      mapa.set(key, grupo);
    }
    if (grupo.canal === null && clip.channel !== null) grupo.canal = clip.channel;
    if (!grupo.codigo && clip.cameraCode) grupo.codigo = clip.cameraCode;

    if (clip.segment === "PREVIO") {
      if (!grupo.previo) grupo.previo = clip;
      else grupo.extras.push(clip);
    } else if (!grupo.posterior) {
      grupo.posterior = clip;
    } else {
      grupo.extras.push(clip);
    }
  }

  return [...mapa.values()].sort((a, b) => {
    const ca = a.canal ?? Number.MAX_SAFE_INTEGER;
    const cb = b.canal ?? Number.MAX_SAFE_INTEGER;
    if (ca !== cb) return ca - cb;
    return a.key.localeCompare(b.key, "es");
  });
}

/** Ancla estable para saltar a la tarjeta de la cámara desde el mapa superior. */
function anclaCamara(camara: CamaraAgrupada): string {
  return `camara-${camara.key.replace(/[^A-Za-z0-9_-]/g, "-")}`;
}

/** Etiqueta compacta de la cámara para el mapa: "10 · BV3-2". */
function etiquetaCorta(camara: CamaraAgrupada): string {
  const numero = camara.canal !== null ? String(camara.canal) : null;
  return [numero, camara.codigo].filter(Boolean).join(" · ") || camara.key;
}

function ClipSlot({
  clip,
  tramo,
  variante,
}: {
  clip: ClipRow | null;
  tramo: string;
  variante: "previo" | "posterior";
}) {
  if (!clip) {
    return (
      <div className="panic-clip">
        <p className="panic-clip__label">
          <span className="panic-clip__dot panic-clip__dot--vacio" />
          {tramo}
        </p>
        <div className="panic-clip__empty">Pendiente de recibir</div>
        <div className="panic-clip__meta">
          <span className="panic-clip__stats">Sin archivo</span>
        </div>
      </div>
    );
  }

  return (
    <div className="panic-clip">
      <p className="panic-clip__label">
        <span className={`panic-clip__dot panic-clip__dot--${variante}`} />
        {tramo}
        {clip.status === PanicClipStatus.COMPLETO ? null : (
          <span className="panic-clip__flag">{CLIP_STATUS_LABEL[clip.status]}</span>
        )}
      </p>
      <video className="panic-clip__video" controls preload="metadata" src={`/api/panic-clips/${clip.id}`} />
      <div className="panic-clip__meta">
        <span className="panic-clip__stats">
          {fmtDuration(clip.durationSec)} · {fmtBytes(clip.sizeBytes)} · {clip.storage.toUpperCase()}
        </span>
        <a className="panic-clip__dl" href={`/api/panic-clips/${clip.id}?dl=1`}>
          Descargar
        </a>
      </div>
      {clip.error ? <p className="panic-clip__note">{clip.error}</p> : null}
    </div>
  );
}

function TarjetaCamara({ camara }: { camara: CamaraAgrupada }) {
  const recibidos = (camara.previo ? 1 : 0) + (camara.posterior ? 1 : 0);
  const completa = recibidos === 2;
  const titulo =
    camara.canal !== null ? `Cámara ${camara.canal}` : camara.codigo ?? "Cámara sin identificar";

  return (
    <article id={anclaCamara(camara)} className={`panic-cam${completa ? "" : " panic-cam--parcial"}`}>
      <header className="panic-cam__head">
        <div className="panic-cam__ident">
          <span className="panic-cam__name">{titulo}</span>
          {camara.codigo ? <span className="panic-cam__code">{camara.codigo}</span> : null}
        </div>
        <span className={`panic-cam__count panic-cam__count--${completa ? "ok" : "parcial"}`}>{recibidos}/2</span>
      </header>

      <div className="panic-cam__body">
        <ClipSlot clip={camara.previo} tramo="1 minuto previo" variante="previo" />
        <ClipSlot clip={camara.posterior} tramo="5 minutos posteriores" variante="posterior" />
      </div>

      {camara.extras.length > 0 ? (
        <div className="panic-cam__extra">
          <p className="panic-cam__extra-title">Archivos adicionales de esta cámara</p>
          <div className="panic-cam__body" style={{ padding: 0 }}>
            {camara.extras.map((extra) => (
              <ClipSlot
                key={extra.id}
                clip={extra}
                tramo={extra.segment === "PREVIO" ? "1 minuto previo (extra)" : "5 minutos posteriores (extra)"}
                variante={extra.segment === "PREVIO" ? "previo" : "posterior"}
              />
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}

export default async function PanicEventDetailPage({ params }: { params: { id: string } }) {
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
  const puedeGestionar = canManagePanic(session.user as any);

  const event = await prisma.panicEvent.findFirst({
    where: { id: params.id, tenantId },
    include: {
      bus: { select: { id: true, code: true, plate: true } },
      assignedTo: { select: { id: true, name: true } },
      reviewedBy: { select: { id: true, name: true } },
      case: { select: { id: true, caseNo: true, title: true } },
      clips: { orderBy: [{ cameraKey: "asc" }, { segment: "asc" }, { receivedAt: "asc" }] },
      logs: {
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { actor: { select: { id: true, name: true } } },
      },
    },
  });

  if (!event) return notFound();

  const usuarios = puedeGestionar
    ? await prisma.user.findMany({
        where: {
          tenantId,
          active: true,
          role: { in: [Role.ADMIN, Role.BACKOFFICE, Role.SUPERVISOR, Role.HELPDESK] },
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  const esperado = event.expectedClips || PANIC_EXPECTED_CLIPS;
  const completos = event.clips.filter((clip) => clip.status === PanicClipStatus.COMPLETO);
  const faltantes = Math.max(esperado - completos.length, 0);
  const conservarHasta = retentionUntil(event.receivedAt);

  const camaras = agruparPorCamara(event.clips as ClipRow[]);
  const camarasEsperadas = Math.max(Math.round(esperado / 2), PANIC_CAMERAS_PER_BUS);
  const camarasCompletas = camaras.filter((camara) => camara.previo && camara.posterior).length;
  const avance = esperado > 0 ? Math.min(Math.round((completos.length / esperado) * 100), 100) : 0;
  const cargueCompleto = faltantes === 0;

  return (
    <div className="mobile-page-shell">
      <header className="mobile-page-header">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 lg:flex-row lg:items-start lg:justify-between lg:px-6 lg:py-0">
          <div className="min-w-0 space-y-1">
            <h1 className="truncate text-lg font-semibold tracking-tight lg:text-3xl">
              Botón de pánico · {event.bus?.code ?? event.busCode ?? event.vehicleId ?? "Bus sin identificar"}
            </h1>
            <p className="text-xs text-muted-foreground lg:text-sm">
              {fmtDateTime(event.eventAt ?? event.receivedAt)} · {STATUS_LABEL[event.status]}
            </p>
            <VideoModuleTabs active="panic" showPanic />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link className="sts-btn-ghost text-sm" href="/video-requests/panic">
              Volver
            </Link>
          </div>
        </div>
      </header>

      <div className="mobile-page-content max-w-6xl lg:px-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <section className="sts-card p-5">
              <div className="panic-upload__head">
                <div className="min-w-0">
                  <h2 className="panic-upload__title">Cargue de clips</h2>
                  <p className="panic-upload__subtitle">
                    Dos archivos por cámara: el minuto previo y los cinco minutos posteriores a la activación.
                  </p>
                </div>
                <span className={`panic-upload__badge panic-upload__badge--${cargueCompleto ? "ok" : "parcial"}`}>
                  {completos.length}/{esperado} clips
                  {faltantes > 0 ? ` · faltan ${faltantes}` : ""}
                </span>
              </div>

              <div className="panic-progress" role="presentation">
                <div
                  className={`panic-progress__fill${cargueCompleto ? " panic-progress__fill--ok" : ""}`}
                  style={{ width: `${avance}%` }}
                />
              </div>
              <div className="panic-progress__legend">
                <span>
                  Avance <strong>{avance}%</strong>
                </span>
                <span>
                  Cámaras completas{" "}
                  <strong>
                    {camarasCompletas}/{camarasEsperadas}
                  </strong>
                </span>
                <span>
                  Cámaras reportando <strong>{camaras.length}</strong>
                </span>
                <span>
                  Material <strong>{fmtBytes(event.totalBytes)}</strong>
                </span>
              </div>

              {camaras.length === 0 ? (
                <p className="panic-upload__empty">
                  El evento fue registrado y todavía no llega ningún video. Se esperan {esperado} archivos: el
                  1 minuto previo y los 5 minutos posteriores de cada una de las {camarasEsperadas} cámaras.
                </p>
              ) : (
                <>
                  {camaras.length > 1 ? (
                    <nav className="panic-map" aria-label="Cámaras del evento">
                      {camaras.map((camara) => {
                        const completa = Boolean(camara.previo && camara.posterior);
                        return (
                          <a key={camara.key} className="panic-map__item" href={`#${anclaCamara(camara)}`}>
                            <span className={`panic-map__state panic-map__state--${completa ? "ok" : "parcial"}`} />
                            {etiquetaCorta(camara)}
                          </a>
                        );
                      })}
                    </nav>
                  ) : null}
                  <div className="panic-cam-grid">
                    {camaras.map((camara) => (
                      <TarjetaCamara key={camara.key} camara={camara} />
                    ))}
                  </div>
                </>
              )}
            </section>

            <section className="sts-card p-5">
              <h2 className="text-base font-semibold">Bitácora</h2>
              {event.logs.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">Sin movimientos.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {event.logs.map((log) => (
                    <li key={log.id} className="border-l-2 border-border/70 pl-3">
                      <p className="text-sm">{log.message ?? log.type}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmtDateTime(log.createdAt)}
                        {log.actor?.name ? ` · ${log.actor.name}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="space-y-6">
            <section className="sts-card p-5">
              <h2 className="text-base font-semibold">Detalle del evento</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Bus / placa</dt>
                  <dd>
                    {event.bus?.code ?? event.busCode ?? "-"} {event.plate ? `· ${event.plate}` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Activación</dt>
                  <dd>{fmtDateTime(event.eventAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Recibido en la mesa</dt>
                  <dd>{fmtDateTime(event.receivedAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Id del evento en el NVR</dt>
                  <dd className="break-all">{event.externalEventId}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Equipo</dt>
                  <dd>{event.deviceId ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Alarma</dt>
                  <dd>{event.alarmLabel ?? event.alarmCode ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Ubicación</dt>
                  <dd>
                    {event.latitude !== null && event.longitude !== null ? (
                      <a
                        className="underline"
                        href={`https://www.google.com/maps?q=${event.latitude},${event.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {event.latitude.toFixed(5)}, {event.longitude.toFixed(5)}
                      </a>
                    ) : (
                      "-"
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Material</dt>
                  <dd>{fmtBytes(event.totalBytes)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Conservar hasta</dt>
                  <dd>{fmtDateTime(conservarHasta)}</dd>
                </div>
                {event.reviewedBy ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Revisado por</dt>
                    <dd>
                      {event.reviewedBy.name} · {fmtDateTime(event.reviewedAt)}
                    </dd>
                  </div>
                ) : null}
                {event.case ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Caso vinculado</dt>
                    <dd>
                      <Link className="underline" href={`/cases/${event.case.id}`}>
                        #{event.case.caseNo ?? event.case.id} {event.case.title}
                      </Link>
                    </dd>
                  </div>
                ) : null}
                {event.resolution ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Conclusión</dt>
                    <dd className="whitespace-pre-wrap">{event.resolution}</dd>
                  </div>
                ) : null}
              </dl>
            </section>

            {puedeGestionar ? (
              <PanicManagePanel
                eventId={event.id}
                status={event.status}
                assignedToId={event.assignedToId}
                resolution={event.resolution}
                usuarios={usuarios}
              />
            ) : (
              <section className="sts-card p-5">
                <p className="text-sm text-muted-foreground">
                  Su usuario puede consultar el material, pero no registrar el tratamiento del evento.
                </p>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
