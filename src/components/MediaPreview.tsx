"use client";

import * as React from "react";
import { X, Download } from "lucide-react";

export type MediaKind = "image" | "video" | "pdf" | "other";

const IMAGE_EXT = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "bmp",
  "heic",
  "heif",
  "svg",
]);
const VIDEO_EXT = new Set([
  "mp4",
  "mov",
  "webm",
  "m4v",
  "ogg",
  "ogv",
  "avi",
  "mkv",
  "3gp",
]);

/** Detecta el tipo de archivo a partir de la ruta o el nombre (por extensión). */
export function mediaKindFromPath(pathOrName?: string | null): MediaKind {
  if (!pathOrName) return "other";
  const clean = String(pathOrName).split("?")[0].split("#")[0];
  const ext = (clean.split(".").pop() || "").toLowerCase();
  if (IMAGE_EXT.has(ext)) return "image";
  if (VIDEO_EXT.has(ext)) return "video";
  if (ext === "pdf") return "pdf";
  return "other";
}

/** Construye la URL de descarga/streaming a partir de una ruta relativa de uploads. */
export function uploadUrl(filePath: string): string {
  if (!filePath) return "";
  if (/^https?:\/\//i.test(filePath) || filePath.startsWith("/api/uploads/")) return filePath;
  return `/api/uploads/${filePath.replace(/^\/+/, "")}`;
}

export type PreviewTarget = {
  /** URL final del archivo (ya resuelta con uploadUrl si aplica). */
  url: string;
  /** Nombre a mostrar en el encabezado del modal. */
  name?: string | null;
  /** Tipo opcional; si no se pasa se infiere del nombre o la URL. */
  kind?: MediaKind;
};

/** Modal a pantalla completa que reproduce video, muestra imagen o PDF, con descarga. */
export function MediaPreviewModal({
  target,
  onClose,
}: {
  target: PreviewTarget | null;
  onClose: () => void;
}) {
  React.useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [target, onClose]);

  if (!target) return null;

  const name = target.name ?? "Archivo";
  const kind = target.kind ?? mediaKindFromPath(target.name ?? target.url);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/50 bg-muted/20 p-3">
          <p className="truncate text-sm font-medium" title={name}>
            {name}
          </p>
          <div className="flex shrink-0 items-center gap-3">
            <a
              className="inline-flex items-center gap-1 text-xs underline"
              href={target.url}
              target="_blank"
              rel="noreferrer"
            >
              <Download className="h-3.5 w-3.5" />
              Descargar
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 text-muted-foreground hover:bg-muted/40"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex min-h-[200px] flex-1 items-center justify-center overflow-auto bg-black/5 p-3">
          {kind === "video" ? (
            <video
              className="max-h-[78vh] w-auto max-w-full bg-black"
              controls
              preload="metadata"
              src={target.url}
            />
          ) : kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={target.url}
              alt={name}
              className="max-h-[78vh] w-auto max-w-full object-contain"
            />
          ) : kind === "pdf" ? (
            <iframe src={target.url} title={name} className="h-[78vh] w-full" />
          ) : (
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Este tipo de archivo no se puede previsualizar.
              </p>
              <a
                className="sts-btn-primary text-sm"
                href={target.url}
                target="_blank"
                rel="noreferrer"
              >
                Descargar archivo
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Hook para usar el modal en cualquier pantalla con mínimo código:
 *   const { openPreview, previewNode } = useMediaPreview();
 *   <button onClick={() => openPreview({ url, name })}>Ver</button>
 *   {previewNode}
 */
export function useMediaPreview() {
  const [target, setTarget] = React.useState<PreviewTarget | null>(null);
  const openPreview = React.useCallback((t: PreviewTarget) => setTarget(t), []);
  const closePreview = React.useCallback(() => setTarget(null), []);
  const previewNode = <MediaPreviewModal target={target} onClose={closePreview} />;
  return { openPreview, closePreview, previewNode, isOpen: target !== null };
}
