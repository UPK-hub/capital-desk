import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { PanicClipStatus, Role } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManagePanic, canViewPanic } from "@/lib/panic/access";
import { PANIC_EXPECTED_CLIPS, retentionUntil } from "@/lib/panic/config";
import VideoModuleTabs from "../../VideoModuleTabs";
import PanicManagePanel from "../PanicManagePanel";
import { CLIP_STATUS_LABEL, STATUS_LABEL, fmtBytes, fmtDateTime, fmtDuration } from "../format";

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
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-semibold">Cargue de clips</h2>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                    event.complete ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600"
                  }`}
                >
                  {completos.length}/{esperado} clips
                  {faltantes > 0 ? ` · faltan ${faltantes}` : ""}
                </span>
              </div>

              {event.clips.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  El evento fue registrado pero todavía no llegó ningún video. Se esperan dos clips por cámara: el
                  1 minuto previo y los 5 minutos posteriores a la activación.
                </p>
              ) : (
                <div className="mt-4 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {event.clips.map((clip) => (
                    <div key={clip.id} className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          {clip.cameraLabel ??
                            `${clip.cameraCode ?? (clip.channel === null ? "Cámara" : `Cámara ${clip.channel}`)} · ${
                              clip.segment === "PREVIO" ? "1 minuto previo" : "5 minutos posteriores"
                            }`}
                        </p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            clip.status === PanicClipStatus.COMPLETO
                              ? "bg-emerald-500/15 text-emerald-600"
                              : "bg-red-500/15 text-red-600"
                          }`}
                        >
                          {CLIP_STATUS_LABEL[clip.status]}
                        </span>
                      </div>
                      <video
                        className="aspect-video w-full rounded-md bg-black"
                        controls
                        preload="metadata"
                        src={`/api/panic-clips/${clip.id}`}
                      />
                      <p className="text-xs text-muted-foreground">
                        {fmtDuration(clip.durationSec)} · {fmtBytes(clip.sizeBytes)} · {clip.storage.toUpperCase()}
                      </p>
                      {clip.error ? <p className="text-xs text-red-600">{clip.error}</p> : null}
                      <a className="text-xs underline" href={`/api/panic-clips/${clip.id}?dl=1`}>
                        Descargar
                      </a>
                    </div>
                  ))}
                </div>
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
