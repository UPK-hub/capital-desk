"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Film, FolderClosed, Upload, Download, FileText } from "lucide-react";
import { useMediaPreview, mediaKindFromPath } from "@/components/MediaPreview";
import { VIDEO_ROOT_CAUSES } from "@/lib/video-root-causes";

type Attachment = {
  id: string;
  camera: string | null;
  kind: string;
  filePath: string;
  originalName: string | null;
  createdAt: string | Date;
};

type CameraResult = {
  camera: string;
  status: string;
  rootCause: string | null;
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "PENDIENTE", label: "Pendiente" },
  { value: "DESCARGA_REALIZADA", label: "Descarga realizada" },
  { value: "DESCARGA_FALLIDA", label: "Descarga fallida" },
];

const STATUS_LABEL: Record<string, string> = {
  PENDIENTE: "Pendiente",
  DESCARGA_REALIZADA: "Descarga realizada",
  DESCARGA_FALLIDA: "Descarga fallida",
  BUS_NO_EN_PATIO: "Bus no está en patio",
};

function statusTone(status: string) {
  if (status === "DESCARGA_REALIZADA") return "bg-green-50 text-green-700 border-green-200";
  if (status === "DESCARGA_FALLIDA") return "bg-red-50 text-red-700 border-red-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

function uploadUrl(filePath: string) {
  return `/api/uploads/${filePath.replace(/^\/+/, "")}`;
}

function parseCameras(camerasRequested: string | null): string[] {
  if (!camerasRequested) return [];
  return camerasRequested
    .split(/[,;]/)
    .map((c) => c.trim())
    .filter(Boolean);
}

const SIN_CAMARA = "__SIN_CAMARA__";
const selectCls = "h-9 w-full rounded-md border px-2 text-sm focus-visible:outline-none";

export default function VideoCamerasFolders({
  requestId,
  caseNo,
  busCode,
  camerasRequested,
  attachments,
  cameraResults = [],
  canManage = false,
}: {
  requestId: string;
  caseNo: number | null;
  busCode: string | null;
  camerasRequested: string | null;
  attachments: Attachment[];
  cameraResults?: CameraResult[];
  canManage?: boolean;
}) {
  const router = useRouter();
  const { openPreview, previewNode } = useMediaPreview();
  const [uploadingCamera, setUploadingCamera] = React.useState<string | null>(null);
  const [savingCamera, setSavingCamera] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);

  const requestedCameras = parseCameras(camerasRequested);

  const resultByCamera = new Map<string, CameraResult>();
  for (const r of cameraResults) resultByCamera.set(r.camera, r);

  // Borrador editable por cámara (estado + causa raíz).
  const [draft, setDraft] = React.useState<Record<string, { status: string; rootCause: string }>>(() => {
    const d: Record<string, { status: string; rootCause: string }> = {};
    for (const cam of requestedCameras) {
      const r = resultByCamera.get(cam);
      d[cam] = { status: r?.status ?? "PENDIENTE", rootCause: r?.rootCause ?? "" };
    }
    return d;
  });

  const [bulkStatus, setBulkStatus] = React.useState("DESCARGA_REALIZADA");
  const [bulkCause, setBulkCause] = React.useState("");
  const [bulkSaving, setBulkSaving] = React.useState(false);

  function setDraftFor(cam: string, patch: Partial<{ status: string; rootCause: string }>) {
    setDraft((d) => ({ ...d, [cam]: { ...(d[cam] ?? { status: "PENDIENTE", rootCause: "" }), ...patch } }));
  }

  // Agrupar adjuntos por cámara.
  const byCamera = new Map<string, Attachment[]>();
  for (const cam of requestedCameras) byCamera.set(cam, []);
  for (const att of attachments) {
    const key = att.camera && requestedCameras.includes(att.camera) ? att.camera : att.camera || SIN_CAMARA;
    if (!byCamera.has(key)) byCamera.set(key, []);
    byCamera.get(key)!.push(att);
  }
  const extraKeys = [...byCamera.keys()].filter((k) => k !== SIN_CAMARA && !requestedCameras.includes(k));
  const folderKeys = [...requestedCameras, ...extraKeys, ...(byCamera.has(SIN_CAMARA) ? [SIN_CAMARA] : [])];

  async function saveCameras(cameras: string[], status: string, rootCause: string) {
    const res = await fetch(`/api/video-requests/${requestId}/camera-results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cameras, status, rootCause: rootCause || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? "No se pudo guardar");
    return data as { correctiveCaseNo?: number | null };
  }

  function successMessage(resp: { correctiveCaseNo?: number | null } | undefined) {
    if (resp?.correctiveCaseNo) {
      return `Guardado. Correctivo automático: CASO-${resp.correctiveCaseNo}.`;
    }
    return "Guardado.";
  }

  async function saveOne(camera: string) {
    const d = draft[camera] ?? { status: "PENDIENTE", rootCause: "" };
    if (d.status === "DESCARGA_FALLIDA" && !d.rootCause) {
      setError(`Selecciona la causa raíz para ${camera}.`);
      return;
    }
    setSavingCamera(camera);
    setError(null);
    setMsg(null);
    try {
      const resp = await saveCameras([camera], d.status, d.status === "DESCARGA_FALLIDA" ? d.rootCause : "");
      setMsg(successMessage(resp));
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "No se pudo guardar");
    } finally {
      setSavingCamera(null);
    }
  }

  async function applyAll() {
    if (!requestedCameras.length) return;
    if (bulkStatus === "DESCARGA_FALLIDA" && !bulkCause) {
      setError("Selecciona la causa raíz para aplicar a todas.");
      return;
    }
    setBulkSaving(true);
    setError(null);
    setMsg(null);
    try {
      const resp = await saveCameras(requestedCameras, bulkStatus, bulkStatus === "DESCARGA_FALLIDA" ? bulkCause : "");
      setMsg(successMessage(resp));
      // Reflejar en el borrador local de inmediato.
      setDraft((prev) => {
        const next = { ...prev };
        for (const cam of requestedCameras) {
          next[cam] = {
            status: bulkStatus,
            rootCause: bulkStatus === "DESCARGA_FALLIDA" ? bulkCause : "",
          };
        }
        return next;
      });
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "No se pudo aplicar a todas");
    } finally {
      setBulkSaving(false);
    }
  }

  async function uploadToCamera(camera: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadingCamera(camera);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        form.append("kind", "VIDEO");
        if (camera !== SIN_CAMARA) form.append("camera", camera);
        const res = await fetch(`/api/video-requests/${requestId}/attachments`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error ?? "No se pudo subir el archivo");
        }
      }
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "No se pudo subir el archivo");
    } finally {
      setUploadingCamera(null);
    }
  }

  function autoLabel(camera: string) {
    return [busCode || "Bus", camera, caseNo ? `Caso ${caseNo}` : "Caso"].join(" · ");
  }

  return (
    <section className="sts-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 bg-muted/20 p-5">
        <h2 className="text-base font-semibold">Videos por cámara</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{attachments.length} archivo(s)</span>
          {requestedCameras.length ? (
            <a
              className="inline-flex items-center gap-1 text-xs underline"
              href={`/api/video-requests/${requestId}/root-cause-report`}
              target="_blank"
              rel="noreferrer"
            >
              <FileText className="h-3.5 w-3.5" />
              Informe del caso (PDF)
            </a>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 p-5">
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        {msg ? <p className="text-xs text-green-700">{msg}</p> : null}

        {canManage && requestedCameras.length ? (
          <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Aplicar a todas las cámaras</p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[180px] flex-1">
                <label className="text-[11px] text-muted-foreground">Estado</label>
                <select className={selectCls} value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              {bulkStatus === "DESCARGA_FALLIDA" ? (
                <div className="min-w-[220px] flex-[2]">
                  <label className="text-[11px] text-muted-foreground">Causa raíz</label>
                  <select className={selectCls} value={bulkCause} onChange={(e) => setBulkCause(e.target.value)}>
                    <option value="">Selecciona una causa…</option>
                    {VIDEO_ROOT_CAUSES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <button
                type="button"
                onClick={applyAll}
                disabled={bulkSaving}
                className="sts-btn-primary text-sm disabled:opacity-60"
              >
                {bulkSaving ? "Aplicando..." : "Aplicar a todas"}
              </button>
            </div>
          </div>
        ) : null}

        {folderKeys.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay cámaras solicitadas en esta solicitud. Selecciona las cámaras al crear la solicitud.
          </p>
        ) : (
          folderKeys.map((camera) => {
            const items = byCamera.get(camera) ?? [];
            const isSinCamara = camera === SIN_CAMARA;
            const titulo = isSinCamara ? "Sin cámara" : autoLabel(camera);
            const saved = resultByCamera.get(camera);
            const d = draft[camera] ?? { status: "PENDIENTE", rootCause: "" };
            return (
              <div key={camera} className="rounded-lg border border-border/60 bg-card">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 bg-muted/20 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <FolderClosed className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <p className="truncate text-sm font-medium" title={titulo}>
                      {titulo}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {saved ? (
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] ${statusTone(saved.status)}`}>
                        {STATUS_LABEL[saved.status] ?? saved.status}
                      </span>
                    ) : null}
                    <span className="text-xs text-muted-foreground">{items.length} video(s)</span>
                  </div>
                </div>

                {!isSinCamara && saved?.status === "DESCARGA_FALLIDA" && saved.rootCause ? (
                  <p className="px-3 pt-2 text-xs text-red-700">Causa raíz: {saved.rootCause}</p>
                ) : null}

                {canManage && !isSinCamara ? (
                  <div className="flex flex-wrap items-end gap-2 px-3 pt-3">
                    <div className="min-w-[160px] flex-1">
                      <label className="text-[11px] text-muted-foreground">Estado de descarga</label>
                      <select
                        className={selectCls}
                        value={d.status}
                        onChange={(e) => setDraftFor(camera, { status: e.target.value })}
                      >
                        {STATUS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {d.status === "DESCARGA_FALLIDA" ? (
                      <div className="min-w-[220px] flex-[2]">
                        <label className="text-[11px] text-muted-foreground">Causa raíz</label>
                        <select
                          className={selectCls}
                          value={d.rootCause}
                          onChange={(e) => setDraftFor(camera, { rootCause: e.target.value })}
                        >
                          <option value="">Selecciona una causa…</option>
                          {VIDEO_ROOT_CAUSES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => saveOne(camera)}
                      disabled={savingCamera === camera}
                      className="rounded-md border px-3 py-2 text-sm disabled:opacity-60"
                    >
                      {savingCamera === camera ? "Guardando..." : "Guardar"}
                    </button>
                    {saved?.status === "DESCARGA_FALLIDA" ? (
                      <a
                        className="inline-flex items-center gap-1 text-xs underline"
                        href={`/api/video-requests/${requestId}/root-cause-report?camera=${encodeURIComponent(camera)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Informe (PDF)
                      </a>
                    ) : null}
                  </div>
                ) : null}

                <div className="space-y-2 p-3">
                  {items.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sin videos en esta cámara.</p>
                  ) : (
                    items.map((att) => {
                      const url = uploadUrl(att.filePath);
                      const previewable = mediaKindFromPath(att.originalName ?? att.filePath) !== "other";
                      return (
                        <div
                          key={att.id}
                          className="flex items-center justify-between gap-3 rounded-md border border-border/50 px-3 py-2 text-sm"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <Film className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="truncate" title={att.originalName ?? att.filePath}>
                              {att.originalName ?? "Video"}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            {previewable ? (
                              <button
                                type="button"
                                onClick={() => openPreview({ url, name: att.originalName ?? titulo })}
                                className="text-xs underline"
                              >
                                Ver
                              </button>
                            ) : null}
                            <a
                              className="inline-flex items-center gap-1 text-xs underline"
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <Download className="h-3.5 w-3.5" />
                              Descargar
                            </a>
                          </div>
                        </div>
                      );
                    })
                  )}

                  {canManage && !isSinCamara ? (
                    <label className="mt-1 inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted/30">
                      <Upload className="h-3.5 w-3.5" />
                      {uploadingCamera === camera ? "Subiendo..." : "Adjuntar video a esta cámara"}
                      <input
                        type="file"
                        className="hidden"
                        multiple
                        accept="video/*,.zip,.rar,.7z"
                        disabled={uploadingCamera !== null}
                        onChange={(e) => uploadToCamera(camera, e.target.files)}
                      />
                    </label>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>

      {previewNode}
    </section>
  );
}
