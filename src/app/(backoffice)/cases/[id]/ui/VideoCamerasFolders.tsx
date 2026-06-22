"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Film, FolderClosed, Upload, Download } from "lucide-react";
import { useMediaPreview, mediaKindFromPath } from "@/components/MediaPreview";

type Attachment = {
  id: string;
  camera: string | null;
  kind: string;
  filePath: string;
  originalName: string | null;
  createdAt: string | Date;
};

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

export default function VideoCamerasFolders({
  requestId,
  caseNo,
  busCode,
  camerasRequested,
  attachments,
  canManage = false,
}: {
  requestId: string;
  caseNo: number | null;
  busCode: string | null;
  camerasRequested: string | null;
  attachments: Attachment[];
  canManage?: boolean;
}) {
  const router = useRouter();
  const { openPreview, previewNode } = useMediaPreview();
  const [uploadingCamera, setUploadingCamera] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const requestedCameras = parseCameras(camerasRequested);

  // Agrupar adjuntos por cámara. Los que no tengan cámara (o no esté en la lista)
  // van a un grupo "sin cámara" para no perderlos.
  const byCamera = new Map<string, Attachment[]>();
  for (const cam of requestedCameras) byCamera.set(cam, []);
  for (const att of attachments) {
    const key = att.camera && requestedCameras.includes(att.camera) ? att.camera : att.camera || SIN_CAMARA;
    if (!byCamera.has(key)) byCamera.set(key, []);
    byCamera.get(key)!.push(att);
  }

  // Orden: primero las cámaras solicitadas, luego cualquier extra, y "sin cámara" al final.
  const folderKeys = [
    ...requestedCameras,
    ...[...byCamera.keys()].filter((k) => k !== SIN_CAMARA && !requestedCameras.includes(k)),
    ...(byCamera.has(SIN_CAMARA) ? [SIN_CAMARA] : []),
  ];

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
    const parts = [busCode || "Bus", camera, caseNo ? `Caso ${caseNo}` : "Caso"];
    return parts.join(" · ");
  }

  return (
    <section className="sts-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/50 bg-muted/20 p-5">
        <h2 className="text-base font-semibold">Videos por cámara</h2>
        <span className="text-xs text-muted-foreground">{attachments.length} archivo(s)</span>
      </div>

      <div className="space-y-3 p-5">
        {error ? <p className="text-xs text-red-600">{error}</p> : null}

        {folderKeys.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay cámaras solicitadas en esta solicitud. Selecciona las cámaras al crear la solicitud.
          </p>
        ) : (
          folderKeys.map((camera) => {
            const items = byCamera.get(camera) ?? [];
            const isSinCamara = camera === SIN_CAMARA;
            const titulo = isSinCamara ? "Sin cámara" : autoLabel(camera);
            return (
              <div key={camera} className="rounded-lg border border-border/60 bg-card">
                <div className="flex items-center justify-between gap-3 border-b border-border/50 bg-muted/20 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <FolderClosed className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <p className="truncate text-sm font-medium" title={titulo}>
                      {titulo}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{items.length} video(s)</span>
                </div>

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
