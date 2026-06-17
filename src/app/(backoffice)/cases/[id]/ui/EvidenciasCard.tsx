"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileText, ImageIcon, Film, File as FileIcon, X, Download } from "lucide-react";

export type EvidenceKind = "image" | "pdf" | "video" | "other";
export type EvidenceSource = "chat" | "wo-file" | "wo-media" | "novedad";

export type EvidenceItem = {
  key: string;
  source: EvidenceSource;
  sourceLabel: string;
  name: string;
  filePath: string;
  kind: EvidenceKind;
  createdAt: string | null;
  // Solo para adjuntos de chat eliminables
  messageId?: string | null;
  canDelete?: boolean;
};

function fmtDate(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function uploadUrl(filePath: string) {
  return `/api/uploads/${filePath.replace(/^\/+/, "")}`;
}

function KindIcon({ kind }: { kind: EvidenceKind }) {
  if (kind === "image") return <ImageIcon className="h-4 w-4" />;
  if (kind === "pdf") return <FileText className="h-4 w-4" />;
  if (kind === "video") return <Film className="h-4 w-4" />;
  return <FileIcon className="h-4 w-4" />;
}

const KIND_LABEL: Record<EvidenceKind, string> = {
  image: "Imagen",
  pdf: "PDF",
  video: "Video",
  other: "Archivo",
};

export default function EvidenciasCard({ caseId, items: initialItems }: { caseId: string; items: EvidenceItem[] }) {
  const router = useRouter();
  const [items, setItems] = React.useState<EvidenceItem[]>(initialItems);
  const [preview, setPreview] = React.useState<EvidenceItem | null>(null);
  const [deletingKey, setDeletingKey] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  async function remove(item: EvidenceItem) {
    if (item.source !== "chat" || !item.messageId) return;
    if (!window.confirm(`Eliminar el adjunto "${item.name}"? Desaparecera del listado y del chat.`)) return;
    setDeletingKey(item.key);
    setMsg(null);
    try {
      const res = await fetch(`/api/cases/${caseId}/chat/attachments/${item.messageId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "No se pudo eliminar");
      setItems((prev) => prev.filter((it) => it.key !== item.key));
      setMsg("Adjunto eliminado.");
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "No se pudo eliminar");
    } finally {
      setDeletingKey(null);
    }
  }

  return (
    <section className="sts-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/50 bg-muted/20 p-5">
        <h2 className="text-base font-semibold">Evidencias y adjuntos</h2>
        <span className="text-xs text-muted-foreground">{items.length} archivo(s)</span>
      </div>

      <div className="space-y-2 p-5">
        {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin adjuntos en este caso.</p>
        ) : (
          items.map((item) => {
            const url = uploadUrl(item.filePath);
            const canDelete = item.source === "chat" && Boolean(item.canDelete) && Boolean(item.messageId);
            return (
              <div
                key={item.key}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card p-3 text-sm"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {item.kind === "image" ? (
                    <button
                      type="button"
                      onClick={() => setPreview(item)}
                      className="h-12 w-12 shrink-0 overflow-hidden rounded-md border border-border/60 bg-muted/30"
                      title="Ver imagen"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={item.name} className="h-full w-full object-cover" />
                    </button>
                  ) : (
                    <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/30 text-muted-foreground">
                      <KindIcon kind={item.kind} />
                    </span>
                  )}

                  <div className="min-w-0">
                    <p className="truncate font-medium" title={item.name}>
                      {item.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {KIND_LABEL[item.kind]} · {item.sourceLabel}
                      {item.createdAt ? ` · ${fmtDate(item.createdAt)}` : ""}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  {item.kind === "image" ? (
                    <button type="button" onClick={() => setPreview(item)} className="text-xs underline">
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
                    {item.kind === "image" ? "Descargar" : "Ver/Descargar"}
                  </a>
                  {canDelete ? (
                    <button
                      type="button"
                      onClick={() => remove(item)}
                      disabled={deletingKey === item.key}
                      className="text-xs text-red-600 underline disabled:opacity-60"
                    >
                      {deletingKey === item.key ? "Eliminando..." : "Eliminar"}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>

      {preview ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setPreview(null)}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-lg bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-border/50 bg-muted/20 p-3">
              <p className="truncate text-sm font-medium" title={preview.name}>
                {preview.name}
              </p>
              <div className="flex shrink-0 items-center gap-3">
                <a
                  className="inline-flex items-center gap-1 text-xs underline"
                  href={uploadUrl(preview.filePath)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Download className="h-3.5 w-3.5" />
                  Descargar
                </a>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  aria-label="Cerrar"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 text-muted-foreground hover:bg-muted/40"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex max-h-[80vh] items-center justify-center overflow-auto bg-black/5 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={uploadUrl(preview.filePath)}
                alt={preview.name}
                className="max-h-[76vh] w-auto max-w-full object-contain"
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
