"use client";

import * as React from "react";
import Link from "next/link";
import { VideoAttachmentKind, VideoCaseStatus, VideoDownloadStatus } from "@prisma/client";
import {
  labelFromMap,
  videoAttachmentLabels,
  videoCaseStatusLabels,
  videoDownloadStatusLabels,
} from "@/lib/labels";
import { Select } from "@/components/Field";

type Item = {
  id: string;
  status: VideoCaseStatus;
  downloadStatus: VideoDownloadStatus;
  requesterName: string | null;
  requesterRole: string | null;
  requesterPhone: string | null;
  requesterEmail: string | null;
  requesterEmails: any;
  vehicleId: string | null;
  descriptionNovedad: string | null;
  finSolicitud: any;
  observationsTechnician: string | null;
  createdAt: string;
  updatedAt: string;
  assignedTo: { id: string; name: string; email: string | null } | null;
  case: { id: string; caseNo: number | null; title: string; bus: { code: string; plate: string | null } };
  attachments: Array<{
    id: string;
    kind: VideoAttachmentKind;
    filePath: string;
    originalName: string | null;
    createdAt: string;
  }>;
  events: Array<{
    id: string;
    type: string;
    message: string | null;
    createdAt: string;
  }>;
};

type Tech = { id: string; name: string; email?: string | null };

function fmtDate(d: string) {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(d));
}

function inputCls() {
  return "h-10 w-full rounded-md border px-3 text-sm outline-none focus:ring-2 focus:ring-black/10";
}

export default function VideoRequestDetailClient({ initialItem }: { initialItem: Item }) {
  const [item, setItem] = React.useState<Item>(initialItem);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [techs, setTechs] = React.useState<Tech[]>([]);

  const [status, setStatus] = React.useState<VideoCaseStatus>(item.status);
  const [downloadStatus, setDownloadStatus] = React.useState<VideoDownloadStatus>(item.downloadStatus);
  const [observations, setObservations] = React.useState(item.observationsTechnician ?? "");
  const [assignedToId, setAssignedToId] = React.useState(item.assignedTo?.id ?? "");

  const [file, setFile] = React.useState<File | null>(null);
  const [fileKind, setFileKind] = React.useState<VideoAttachmentKind>(VideoAttachmentKind.VIDEO);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch("/api/technicians");
      if (!res.ok) return;
      const data = await res.json().catch(() => []);
      if (!alive) return;
      setTechs(Array.isArray(data) ? data : []);
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function refresh() {
    const res = await fetch(`/api/video-requests/${item.id}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.item) {
      setItem(data.item);
    }
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    const res = await fetch(`/api/video-requests/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        downloadStatus,
        observationsTechnician: observations,
        assignedToId: assignedToId || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setMsg(data?.error ?? "No se pudo guardar");
      return;
    }
    setMsg("Guardado");
    await refresh();
  }

  async function upload() {
    if (!file) {
      setMsg("Selecciona un archivo");
      return;
    }
    setSaving(true);
    setMsg(null);
    const form = new FormData();
    form.append("file", file);
    form.append("kind", fileKind);
    const res = await fetch(`/api/video-requests/${item.id}/attachments`, { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setMsg(data?.error ?? "No se pudo subir");
      return;
    }
    setFile(null);
    setMsg("Archivo cargado");
    await refresh();
  }

  const requesterEmails = Array.isArray(item.requesterEmails)
    ? item.requesterEmails.filter(Boolean).join(", ")
    : "";

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">
            Solicitud {item.case.caseNo ?? item.case.id}
          </h1>
          <p className="text-sm text-muted-foreground">
            {item.case.title} · Bus {item.case.bus.code}
            {item.case.bus.plate ? ` (${item.case.bus.plate})` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link className="sts-btn-ghost text-sm" href="/video-requests">
            Volver
          </Link>
          <Link className="sts-btn-primary text-sm" href={`/cases/${item.case.id}`}>
            Ver caso
          </Link>
        </div>
      </div>

      {msg ? <div className="sts-card p-3 text-sm">{msg}</div> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <section className="sts-card p-5">
            <h2 className="text-base font-semibold">Datos de la solicitud</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground">Solicitante</label>
                <p className="text-sm">{item.requesterName ?? "-"}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Cargo</label>
                <p className="text-sm">{item.requesterRole ?? "-"}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Telefono</label>
                <p className="text-sm">{item.requesterPhone ?? "-"}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Email</label>
                <p className="text-sm">{item.requesterEmail ?? "-"}</p>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">Correos envio</label>
                <p className="text-sm">{requesterEmails || "-"}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Vehiculo</label>
                <p className="text-sm">{item.vehicleId ?? "-"}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Creado</label>
                <p className="text-sm">{fmtDate(item.createdAt)}</p>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">Descripcion</label>
                <p className="text-sm whitespace-pre-wrap">{item.descriptionNovedad ?? "-"}</p>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">Fin solicitud</label>
                <p className="text-sm">
                  {Array.isArray(item.finSolicitud) && item.finSolicitud.length
                    ? item.finSolicitud.join(", ")
                    : "-"}
                </p>
              </div>
            </div>
          </section>

          <section className="sts-card p-5">
            <h2 className="text-base font-semibold">Gestion</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground">Estado caso</label>
                <Select className={inputCls()} value={status} onChange={(e) => setStatus(e.target.value as VideoCaseStatus)}>
                  <option value={VideoCaseStatus.EN_ESPERA}>{videoCaseStatusLabels.EN_ESPERA}</option>
                  <option value={VideoCaseStatus.EN_CURSO}>{videoCaseStatusLabels.EN_CURSO}</option>
                  <option value={VideoCaseStatus.COMPLETADO}>{videoCaseStatusLabels.COMPLETADO}</option>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Estado descarga</label>
                <Select
                  className={inputCls()}
                  value={downloadStatus}
                  onChange={(e) => setDownloadStatus(e.target.value as VideoDownloadStatus)}
                >
                  <option value={VideoDownloadStatus.PENDIENTE}>{videoDownloadStatusLabels.PENDIENTE}</option>
                  <option value={VideoDownloadStatus.DESCARGA_REALIZADA}>{videoDownloadStatusLabels.DESCARGA_REALIZADA}</option>
                  <option value={VideoDownloadStatus.DESCARGA_FALLIDA}>{videoDownloadStatusLabels.DESCARGA_FALLIDA}</option>
                  <option value={VideoDownloadStatus.BUS_NO_EN_PATIO}>{videoDownloadStatusLabels.BUS_NO_EN_PATIO}</option>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Tecnico asignado</label>
                <Select className={inputCls()} value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}>
                  <option value="">Sin asignar</option>
                  {techs.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">Observaciones tecnico</label>
                <textarea
                  className="min-h-[88px] w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="sts-btn-primary text-sm disabled:opacity-60"
              >
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </section>

          <section className="sts-card p-5">
            <h2 className="text-base font-semibold">Adjuntos</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground">Tipo</label>
                <Select className={inputCls()} value={fileKind} onChange={(e) => setFileKind(e.target.value as VideoAttachmentKind)}>
                  <option value={VideoAttachmentKind.VIDEO}>{videoAttachmentLabels.VIDEO}</option>
                  <option value={VideoAttachmentKind.OTRO}>{videoAttachmentLabels.OTRO}</option>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Archivo</label>
                <input className={inputCls()} type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </div>
            </div>
            <div className="mt-3">
              <button
                type="button"
                onClick={upload}
                disabled={saving}
                className="rounded-md border px-4 py-2 text-sm disabled:opacity-60"
              >
                Subir archivo
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {item.attachments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin adjuntos.</p>
              ) : (
                item.attachments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium">{a.kind}</p>
                      <p className="text-xs text-muted-foreground">{a.originalName ?? a.filePath}</p>
                    </div>
                    <a className="text-xs underline" href={`/api/uploads/${a.filePath}`} target="_blank" rel="noreferrer">
                      Descargar
                    </a>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="sts-card p-5">
            <h2 className="text-base font-semibold">Historial</h2>
            <div className="mt-3 space-y-2 text-sm">
              {item.events.length === 0 ? (
                <p className="text-muted-foreground">Sin eventos.</p>
              ) : (
                item.events.map((e) => (
                  <div key={e.id} className="rounded border p-3">
                    <p className="text-xs text-muted-foreground">{fmtDate(e.createdAt)}</p>
                    <p className="mt-1 font-medium">{e.type}</p>
                    {e.message ? <p className="text-sm text-muted-foreground">{e.message}</p> : null}
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
