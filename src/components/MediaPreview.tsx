"use client";

import * as React from "react";
import { X, Download, Loader2, AlertTriangle, RefreshCw } from "lucide-react";

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

/**
 * Extensiones que tratamos como video. Incluye formatos que el navegador NO
 * reproduce de forma nativa (avi, mkv, dav de DVR...): para esos la app hace
 * una conversión en el servidor y los reproduce igual, sin descargarlos.
 */
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
  "wmv",
  "asf",
  "flv",
  "ts",
  "m2ts",
  "mts",
  "mpg",
  "mpeg",
  "dav",
  "264",
  "h264",
  "ifv",
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

/** URL que fuerza la descarga con un nombre dado (Bus_Cámara_Caso, etc.). */
export function downloadUrl(u: string, name?: string | null): string {
  if (!u || !u.includes("/api/uploads/") || !name) return u;
  const sep = u.includes("?") ? "&" : "?";
  return `${u}${sep}name=${encodeURIComponent(name)}&dl=1`;
}

/**
 * Construye la consulta que identifica el archivo ante /api/media/preview,
 * a partir de la URL con la que se está reproduciendo.
 *   /api/uploads/<ruta>      -> path=<ruta>
 *   /api/panic-clips/<id>    -> clip=<id>
 */
function previewQueryFromUrl(u: string): string | null {
  if (!u) return null;
  const withoutQuery = u.split("?")[0].split("#")[0];

  const panic = /\/api\/panic-clips\/([^/]+)$/.exec(withoutQuery);
  if (panic) return `clip=${encodeURIComponent(decodeURIComponent(panic[1]))}`;

  const idx = withoutQuery.indexOf("/api/uploads/");
  if (idx < 0) return null;
  const raw = withoutQuery.slice(idx + "/api/uploads/".length);
  let clean = raw;
  try {
    clean = decodeURIComponent(raw);
  } catch {
    /* ruta sin codificar */
  }
  return `path=${encodeURIComponent(clean)}`;
}

const CODEC_LABEL: Record<string, string> = {
  hevc: "H.265 / HEVC",
  h265: "H.265 / HEVC",
  h264: "H.264",
  mpeg4: "MPEG-4",
  msmpeg4v3: "MPEG-4 (DivX)",
  vp9: "VP9",
  av1: "AV1",
};

type PreviewApi = {
  ok?: boolean;
  tools?: boolean;
  nativePlayable?: boolean | null;
  probe?: {
    videoCodec: string | null;
    audioCodec: string | null;
    durationSeconds: number | null;
    width: number | null;
    height: number | null;
  } | null;
  preview?: {
    state: "none" | "queued" | "processing" | "ready" | "error";
    progress: number;
    error: string | null;
    url: string | null;
  };
  error?: string;
};

/**
 * Reproductor con conversión automática.
 *
 * Los videos que bajan de los buses vienen en .mp4 pero con códec H.265, que el
 * navegador no sabe decodificar: el reproductor quedaba en negro y tocaba
 * descargar el archivo. Aquí se detecta ese caso, el servidor convierte el
 * video a H.264 una sola vez (queda en caché) y se reproduce en la misma app.
 */
export function InlineVideoPlayer({
  url,
  name,
  className,
}: {
  url: string;
  name?: string | null;
  className?: string;
}) {
  const query = React.useMemo(() => previewQueryFromUrl(url), [url]);
  const [src, setSrc] = React.useState(url);
  const [converted, setConverted] = React.useState(false);
  const [state, setState] = React.useState<"idle" | "checking" | "converting" | "ready" | "error" | "unsupported">(
    "idle"
  );
  const [progress, setProgress] = React.useState(0);
  const [codec, setCodec] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = React.useRef(false);

  const stopPolling = React.useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const applyInfo = React.useCallback(
    (data: PreviewApi) => {
      if (data?.probe?.videoCodec) setCodec(data.probe.videoCodec);
      const p = data?.preview;
      if (!p) return;
      if (p.state === "ready" && p.url) {
        stopPolling();
        setSrc(p.url);
        setConverted(true);
        setState("ready");
        setProgress(100);
        return;
      }
      if (p.state === "error") {
        stopPolling();
        setState("error");
        setMessage(p.error ?? "No se pudo convertir el video.");
        return;
      }
      if (p.state === "processing" || p.state === "queued") {
        setState("converting");
        setProgress(p.progress ?? 0);
      }
    },
    [stopPolling]
  );

  const startConversion = React.useCallback(async () => {
    if (!query || startedRef.current) return;
    startedRef.current = true;
    setState("converting");
    setMessage(null);
    try {
      const res = await fetch(`/api/media/preview?${query}`, { method: "POST" });
      const data: PreviewApi = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState("error");
        setMessage(data?.error ?? "No se pudo iniciar la conversión.");
        return;
      }
      if (data.tools === false) {
        setState("unsupported");
        setMessage(
          "El servidor no tiene instalado el conversor de video (ffmpeg). Mientras tanto, descarga el archivo para verlo."
        );
        return;
      }
      applyInfo(data);
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch(`/api/media/preview?${query}`, { cache: "no-store" });
          const d: PreviewApi = await r.json().catch(() => ({}));
          if (r.ok) applyInfo(d);
        } catch {
          /* reintenta en el siguiente ciclo */
        }
      }, 2500);
    } catch (e: any) {
      setState("error");
      setMessage(e?.message ?? "No se pudo iniciar la conversión.");
    }
  }, [applyInfo, query, stopPolling]);

  // Diagnóstico inicial: si el códec no es reproducible, convertir de una vez.
  React.useEffect(() => {
    let cancelled = false;
    setSrc(url);
    setConverted(false);
    setState("checking");
    setProgress(0);
    setCodec(null);
    setMessage(null);
    startedRef.current = false;

    if (!query) {
      setState("idle");
      return () => undefined;
    }

    (async () => {
      try {
        const res = await fetch(`/api/media/preview?${query}`, { cache: "no-store" });
        const data: PreviewApi = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setState("idle");
          return;
        }
        if (data?.probe?.videoCodec) setCodec(data.probe.videoCodec);
        if (data.preview?.state === "ready" && data.preview.url) {
          setSrc(data.preview.url);
          setConverted(true);
          setState("ready");
          return;
        }
        if (data.nativePlayable === false) {
          if (data.tools === false) {
            setState("unsupported");
            setMessage(
              "El servidor no tiene instalado el conversor de video (ffmpeg). Mientras tanto, descarga el archivo para verlo."
            );
            return;
          }
          void startConversion();
          return;
        }
        setState("idle");
      } catch {
        if (!cancelled) setState("idle");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [query, url, startConversion]);

  React.useEffect(() => stopPolling, [stopPolling]);

  const converting = state === "converting";
  const codecLabel = codec ? CODEC_LABEL[codec] ?? codec.toUpperCase() : null;

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="relative flex w-full items-center justify-center">
        <video
          key={src}
          className={className ?? "max-h-[70vh] w-auto max-w-full bg-black"}
          controls
          autoPlay={converted}
          preload="metadata"
          src={src}
          onError={() => {
            // El navegador no pudo decodificar: pedir la versión convertida.
            if (query && !converted && state !== "unsupported") void startConversion();
          }}
        />
        {converting ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/75 p-6 text-center text-white">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm font-medium">
              Convirtiendo el video para verlo en el navegador
              {codecLabel ? ` (viene en ${codecLabel})` : ""}...
            </p>
            <div className="h-2 w-64 max-w-full overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-white transition-all"
                style={{ width: `${Math.max(3, Math.min(100, progress))}%` }}
              />
            </div>
            <p className="text-xs text-white/80">
              {progress > 0 ? `${progress}%` : "Preparando..."} · se hace una sola vez por archivo
            </p>
          </div>
        ) : null}
      </div>

      {state === "error" || state === "unsupported" ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1">
            <p>{message ?? "No se pudo preparar la previsualización."}</p>
            {state === "error" ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 underline"
                onClick={() => {
                  startedRef.current = false;
                  void startConversion();
                }}
              >
                <RefreshCw className="h-3 w-3" />
                Reintentar
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="truncate">
          {converted
            ? `Reproduciendo versión convertida para el navegador${codecLabel ? ` (original: ${codecLabel})` : ""}. La descarga entrega el archivo original.`
            : codecLabel
            ? `Códec del archivo: ${codecLabel}.`
            : ""}
        </span>
        {query && !converted && !converting ? (
          <button
            type="button"
            className="shrink-0 underline"
            onClick={() => {
              startedRef.current = false;
              void startConversion();
            }}
          >
            ¿No se ve? Convertir para el navegador
          </button>
        ) : null}
      </div>
    </div>
  );
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
              href={downloadUrl(target.url, target.name)}
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
            <InlineVideoPlayer url={target.url} name={name} />
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
