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
import { useMediaPreview, mediaKindFromPath } from "@/components/MediaPreview";
import VideoCamerasFolders from "@/app/(backoffice)/cases/[id]/ui/VideoCamerasFolders";

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
  origin: string | null;
  requestType: string | null;
  tmsaRadicado: string | null;
  tmsaFiledAt: string | null;
  concessionaireFiledAt: string | null;
  eventStart: string | null;
  eventEnd: string | null;
  camerasRequested: string | null;
  deliveryMethod: string | null;
  finSolicitud: any;
  observationsTechnician: string | null;
  createdAt: string;
  updatedAt: string;
  assignedTo: { id: string; name: string; email: string | null } | null;
case: { id: string; caseNo: number | null; title: string; description: string | null; bus: { code: string; plate: string | null } };
  attachments: Array<{
    id: string;
    kind: VideoAttachmentKind;
    camera: string | null;
    filePath: string;
    originalName: string | null;
    uploadedById: string | null;
    createdAt: string;
  }>;
  cameraResults: Array<{ camera: string; status: string; rootCause: string | null }>;
  events: Array<{
    id: string;
    type: string;
    message: string | null;
    createdAt: string;
  }>;
};

type Assignable = {
  id: string;
  name: string;
  email?: string | null;
  role?: string | null;
  isCapital?: boolean;
};

type UploadItem = {
  name: string;
  size: number;
  progress: number; // 0-100
  status: "queued" | "uploading" | "done" | "error";
  etaSeconds: number | null;
  error?: string;
};

function fmtBytes(n: number) {
  if (!n || n <= 0) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

function fmtEta(s: number | null) {
  if (s == null || !isFinite(s) || s < 0) return "—";
  const sec = Math.round(s);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return `${m}m ${r}s`;
}

function fmtDate(d: string) {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(d));
}

function inputCls() {
  return "h-10 w-full rounded-md border px-3 text-sm focus-visible:outline-none";
}

export default function VideoRequestDetailClient({
  initialItem,
  canManage = true,
  currentUserId = "",
  isAdmin = false,
}: {
  initialItem: Item;
  canManage?: boolean;
  currentUserId?: string;
  isAdmin?: boolean;
}) {
  const [item, setItem] = React.useState<Item>(initialItem);
  const { openPreview, previewNode } = useMediaPreview();
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [assignables, setAssignables] = React.useState<Assignable[]>([]);

  const [status, setStatus] = React.useState<VideoCaseStatus>(item.status);
  const [downloadStatus, setDownloadStatus] = React.useState<VideoDownloadStatus>(item.downloadStatus);
  const [observations, setObservations] = React.useState(item.observationsTechnician ?? "");
  const [assignedToId, setAssignedToId] = React.useState(item.assignedTo?.id ?? "");

  const [files, setFiles] = React.useState<File[]>([]);
  const [fileKind, setFileKind] = React.useState<VideoAttachmentKind>(VideoAttachmentKind.VIDEO);
  const [uploading, setUploading] = React.useState(false);
  const [queue, setQueue] = React.useState<UploadItem[]>([]);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    if (!canManage) return;
    let alive = true;
    (async () => {
      // Candidatos para video: técnicos + usuarios de Capital (@capitalbus.).
      const res = await fetch("/api/users/assignable?context=video", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      if (!alive) return;
      const list = Array.isArray(data?.items) ? (data.items as Assignable[]) : [];
      setAssignables(list);
    })();
    return () => {
      alive = false;
    };
  }, [canManage]);

  async function refresh() {
    const res = await fetch(`/api/video-requests/${item.id}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.item) {
      setItem(data.item);
    }
  }

  async function deleteRequest() {
    if (
      !window.confirm(
        "¿Eliminar esta solicitud de video por completo? Se borrarán el caso, los adjuntos (videos) y el historial. Esta acción no se puede deshacer."
      )
    )
      return;
    setDeleting(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/video-requests/${item.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data?.error ?? "No se pudo eliminar");
        setDeleting(false);
        return;
      }
      window.location.href = "/video-requests";
    } catch {
      setMsg("No se pudo eliminar");
      setDeleting(false);
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

  function uploadOne(file: File, onProgress: (loaded: number, total: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/video-requests/${item.id}/attachments`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded, e.total);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          let m = `Error ${xhr.status}`;
          try {
            const d = JSON.parse(xhr.responseText);
            if (d?.error) m = d.error;
          } catch {
            /* respuesta no JSON */
          }
          reject(new Error(m));
        }
      };
      xhr.onerror = () => reject(new Error("Error de red"));
      const form = new FormData();
      form.append("file", file);
      form.append("kind", fileKind);
      xhr.send(form);
    });
  }

  async function uploadAll() {
    if (!files.length) {
      setMsg("Selecciona al menos un archivo");
      return;
    }
    setUploading(true);
    setMsg(null);
    setQueue(
      files.map((f) => ({ name: f.name, size: f.size, progress: 0, status: "queued" as const, etaSeconds: null }))
    );

    let okCount = 0;
    let errCount = 0;
    // Subida secuencial (en cola): un archivo a la vez.
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const startedAt = Date.now();
      setQueue((q) => q.map((it, idx) => (idx === i ? { ...it, status: "uploading" as const } : it)));
      try {
        await uploadOne(f, (loaded, total) => {
          const elapsed = (Date.now() - startedAt) / 1000;
          const speed = elapsed > 0 ? loaded / elapsed : 0; // bytes/s
          const eta = speed > 0 ? (total - loaded) / speed : null;
          const progress = total > 0 ? Math.round((loaded / total) * 100) : 0;
          setQueue((q) => q.map((it, idx) => (idx === i ? { ...it, progress, etaSeconds: eta } : it)));
        });
        okCount += 1;
        setQueue((q) =>
          q.map((it, idx) => (idx === i ? { ...it, status: "done" as const, progress: 100, etaSeconds: 0 } : it))
        );
      } catch (err: any) {
        errCount += 1;
        setQueue((q) =>
          q.map((it, idx) => (idx === i ? { ...it, status: "error" as const, error: err?.message ?? "Falló" } : it))
        );
      }
    }

    setUploading(false);
    setFiles([]);
    setMsg(`Carga finalizada: ${okCount} ok${errCount ? `, ${errCount} con error` : ""}`);
    await refresh();
  }

  async function removeAttachment(att: { id: string; originalName: string | null; kind: VideoAttachmentKind }) {
    if (!window.confirm(`¿Eliminar el adjunto "${att.originalName ?? att.kind}"? Desaparecerá de la lista.`)) return;
    setDeletingId(att.id);
    setMsg(null);
    try {
      const res = await fetch(`/api/video-requests/${item.id}/attachments/${att.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data?.error ?? "No se pudo eliminar");
        return;
      }
      setMsg("Adjunto eliminado");
      await refresh();
    } finally {
      setDeletingId(null);
    }
  }

  const requesterEmails = Array.isArray(item.requesterEmails)
    ? item.requesterEmails.filter(Boolean).join(", ")
    : "";

  return (
    <div className="mobile-page-shell">
      <header className="mobile-page-header">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 lg:flex-row lg:items-start lg:justify-between lg:px-6 lg:py-0">
          <div className="min-w-0 space-y-1">
            <h1 className="truncate text-lg font-semibold tracking-tight lg:text-3xl">
              Solicitud {item.case.caseNo ?? item.case.id}
            </h1>
            <p className="truncate text-xs text-muted-foreground lg:text-sm">
              {item.case.title} · Bus {item.case.bus.code}
              {item.case.bus.plate ? ` (${item.case.bus.plate})` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link className="sts-btn-ghost text-sm" href="/video-requests">
              Volver
            </Link>
            <Link className="sts-btn-primary text-sm" href={`/cases/${item.case.id}`}>
              Ver caso
            </Link>
            {isAdmin ? (
              <button
                type="button"
                onClick={deleteRequest}
                disabled={deleting}
                className="inline-flex h-9 items-center justify-center rounded-md border border-red-300 px-3 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
              >
                {deleting ? "Eliminando..." : "Eliminar solicitud"}
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mobile-page-content max-w-6xl lg:px-6">
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
              <div>
                <label className="text-xs text-muted-foreground">Procedencia</label>
                <p className="text-sm">{item.origin ?? "-"}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Tipo requerimiento</label>
                <p className="text-sm">{item.requestType ?? "-"}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Radicado TMSA</label>
                <p className="text-sm">{item.tmsaRadicado ?? "-"}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Fecha radicado concesionario</label>
                <p className="text-sm">{item.concessionaireFiledAt ? fmtDate(item.concessionaireFiledAt) : "-"}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Fecha evento inicio</label>
                <p className="text-sm">{item.eventStart ? fmtDate(item.eventStart) : "-"}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Fecha evento fin</label>
                <p className="text-sm">{item.eventEnd ? fmtDate(item.eventEnd) : "-"}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Camaras solicitadas</label>
                <p className="text-sm">{item.camerasRequested ?? "-"}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Medio de entrega</label>
                <p className="text-sm">{item.deliveryMethod ?? "-"}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Procedencia</label>
                <p className="text-sm">{item.origin ?? "-"}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Tipo requerimiento</label>
                <p className="text-sm">{item.requestType ?? "-"}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Radicado TMSA</label>
                <p className="text-sm">{item.tmsaRadicado ?? "-"}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Fecha radicado concesionario</label>
                <p className="text-sm">{item.concessionaireFiledAt ? fmtDate(item.concessionaireFiledAt) : "-"}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Fecha evento inicio</label>
                <p className="text-sm">{item.eventStart ? fmtDate(item.eventStart) : "-"}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Fecha evento fin</label>
                <p className="text-sm">{item.eventEnd ? fmtDate(item.eventEnd) : "-"}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Camaras solicitadas</label>
                <p className="text-sm">{item.camerasRequested ?? "-"}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Medio de entrega</label>
                <p className="text-sm">{item.deliveryMethod ?? "-"}</p>
              </div>
             <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">Descripcion</label>
                <p className="text-sm whitespace-pre-wrap">{item.case.description ?? item.descriptionNovedad ?? "-"}</p>
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
                <Select
                  className={inputCls()}
                  value={status}
                  disabled={!canManage}
                  onChange={(e) => setStatus(e.target.value as VideoCaseStatus)}
                >
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
                  disabled={!canManage}
                  onChange={(e) => setDownloadStatus(e.target.value as VideoDownloadStatus)}
                >
                  <option value={VideoDownloadStatus.PENDIENTE}>{videoDownloadStatusLabels.PENDIENTE}</option>
                  <option value={VideoDownloadStatus.DESCARGA_REALIZADA}>{videoDownloadStatusLabels.DESCARGA_REALIZADA}</option>
                  <option value={VideoDownloadStatus.DESCARGA_FALLIDA}>{videoDownloadStatusLabels.DESCARGA_FALLIDA}</option>
                  <option value={VideoDownloadStatus.BUS_NO_EN_PATIO}>{videoDownloadStatusLabels.BUS_NO_EN_PATIO}</option>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Responsable asignado</label>
                <Select
                  className={inputCls()}
                  value={assignedToId}
                  disabled={!canManage}
                  onChange={(e) => setAssignedToId(e.target.value)}
                >
                  <option value="">Sin asignar</option>
                  {assignables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.isCapital ? " — Capital" : ""}
                    </option>
                  ))}
                </Select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Técnicos y usuarios de Capital pueden ser responsables del video.
                </p>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">Observaciones tecnico</label>
                <textarea
                  className="min-h-[88px] w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none"
                  value={observations}
                  disabled={!canManage}
                  onChange={(e) => setObservations(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={save}
                disabled={saving || !canManage}
                className="sts-btn-primary text-sm disabled:opacity-60"
              >
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </section>

          <VideoCamerasFolders
            requestId={item.id}
            caseNo={item.case.caseNo}
            busCode={item.case.bus.code}
            camerasRequested={item.camerasRequested}
            attachments={item.attachments}
            cameraResults={item.cameraResults}
            canManage={canManage}
          />

          <section className="sts-card p-5">
            <h2 className="text-base font-semibold">Adjuntos</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground">Tipo</label>
                <Select
                  className={inputCls()}
                  value={fileKind}
                  disabled={!canManage}
                  onChange={(e) => setFileKind(e.target.value as VideoAttachmentKind)}
                >
                  <option value={VideoAttachmentKind.VIDEO}>{videoAttachmentLabels.VIDEO}</option>
                  <option value={VideoAttachmentKind.OTRO}>{videoAttachmentLabels.OTRO}</option>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Archivo</label>
                <input
                  className={inputCls()}
                  type="file"
                  multiple
                  // ITEM 5 (bloque 6): además de video, permitir comprimidos. El selector
                  // sugiere estos tipos pero NO se rechaza nada (el endpoint sigue siendo
                  // permisivo y acepta cualquier tipo).
                  accept="video/*,.zip,.rar,.7z,.tar,.gz,.tgz,application/zip,application/x-rar-compressed,application/x-7z-compressed"
                  disabled={!canManage || uploading}
                  onChange={(e) => setFiles(e.target.files ? Array.from(e.target.files) : [])}
                />
                {files.length > 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">{files.length} archivo(s) seleccionado(s)</p>
                ) : null}
              </div>
            </div>
            <div className="mt-3">
              <button
                type="button"
                onClick={uploadAll}
                disabled={uploading || !canManage || files.length === 0}
                className="rounded-md border px-4 py-2 text-sm disabled:opacity-60"
              >
                {uploading ? "Subiendo..." : `Subir archivo${files.length > 1 ? "s" : ""}`}
              </button>
            </div>

            {queue.length > 0 ? (
              <div className="mt-4 space-y-2">
                {queue.map((u, idx) => (
                  <div key={`${u.name}-${idx}`} className="rounded border px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{u.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{fmtBytes(u.size)}</span>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded bg-zinc-200">
                      <div
                        className={`h-full rounded transition-all ${
                          u.status === "error" ? "bg-red-600" : u.status === "done" ? "bg-green-600" : "bg-blue-600"
                        }`}
                        style={{ width: `${u.progress}%` }}
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {u.status === "queued"
                          ? "En cola"
                          : u.status === "uploading"
                          ? `Subiendo ${u.progress}%`
                          : u.status === "done"
                          ? "Completado"
                          : `Error: ${u.error ?? "falló"}`}
                      </span>
                      {u.status === "uploading" ? <span>Faltan {fmtEta(u.etaSeconds)}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-4 space-y-2">
              {item.attachments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin adjuntos.</p>
              ) : (
                item.attachments.map((a) => {
                  const canDelete =
                    canManage && (isAdmin || (!!a.uploadedById && a.uploadedById === currentUserId));
                  const url = `/api/uploads/${a.filePath}`;
                  const previewable = mediaKindFromPath(a.originalName ?? a.filePath) !== "other";
                  return (
                    <div
                      key={a.id}
                      className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{a.kind}</p>
                        <p className="truncate text-xs text-muted-foreground">{a.originalName ?? a.filePath}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        {previewable ? (
                          <button
                            type="button"
                            onClick={() => openPreview({ url, name: a.originalName ?? a.kind })}
                            className="text-xs underline"
                          >
                            Ver
                          </button>
                        ) : null}
                        <a
                          className="text-xs underline"
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Descargar
                        </a>
                        {canDelete ? (
                          <button
                            type="button"
                            onClick={() => removeAttachment(a)}
                            disabled={deletingId === a.id}
                            className="text-xs text-red-600 underline disabled:opacity-60"
                          >
                            {deletingId === a.id ? "Eliminando..." : "Eliminar"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })
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
      {previewNode}
    </div>
  );
}
