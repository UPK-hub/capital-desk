"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Image as ImageIcon, AtSign, User, X, FileText } from "lucide-react";

type Attachment = { filePath: string; fileName: string; mimeType: string; size: number };

type CommentItem = {
  id: string;
  message: string;
  createdAt: string;
  author?: string | null;
  attachments?: Attachment[];
};

function fmtDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function isImage(a: { mimeType?: string; fileName?: string }) {
  if (a.mimeType && a.mimeType.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(a.fileName ?? "");
}

export default function CaseCommentsCard({
  caseId,
  comments,
  composerOnly = false,
}: {
  caseId: string;
  comments: CommentItem[];
  composerOnly?: boolean;
}) {
  const router = useRouter();
  const [comment, setComment] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const imageInputRef = React.useRef<HTMLInputElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list || !list.length) return;
    const next = Array.from(list);
    setFiles((prev) => [...prev, ...next].slice(0, 10));
    setMsg(null);
  }
  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submit() {
    const value = comment.trim();
    if ((!value && files.length === 0) || saving) return;
    setSaving(true);
    setMsg(null);
    try {
      let res: Response;
      if (files.length > 0) {
        const fd = new FormData();
        fd.set("comment", value);
        for (const f of files) fd.append("files", f);
        res = await fetch(`/api/cases/${caseId}/comments`, { method: "POST", body: fd });
      } else {
        res = await fetch(`/api/cases/${caseId}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comment: value }),
        });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "No se pudo guardar el comentario");
      if (Array.isArray(data?.skipped) && data.skipped.length) {
        setMsg(`Se guardó, pero estos archivos no se pudieron subir: ${data.skipped.join(", ")}`);
      }
      setComment("");
      setFiles([]);
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "No se pudo guardar el comentario");
    } finally {
      setSaving(false);
    }
  }

  const composer = (
    <div className="flex gap-2.5">
      <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-blue-600/10 text-blue-700">
        <User className="h-3.5 w-3.5" />
      </span>
      <div className="flex-1 rounded-[10px] border border-border/60 transition focus-within:border-blue-300 focus-within:ring-1 focus-within:ring-blue-200">
        <textarea
          className="block min-h-[44px] w-full resize-none bg-transparent px-3 py-2 text-[12.5px] text-slate-700 placeholder:text-muted-foreground focus-visible:outline-none"
          placeholder="Escribe un comentario…"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          disabled={saving}
          rows={2}
        />

        {/* Previsualización de archivos seleccionados */}
        {files.length ? (
          <div className="flex flex-wrap gap-2 px-3 pb-2">
            {files.map((f, i) => {
              const isImg = f.type.startsWith("image/");
              const url = isImg ? URL.createObjectURL(f) : null;
              return (
                <span
                  key={`${f.name}-${i}`}
                  className="group relative flex items-center gap-1.5 rounded-lg border border-border/60 bg-slate-50 py-1 pl-1 pr-2 text-[11px] text-slate-600"
                >
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={f.name} className="h-8 w-8 rounded object-cover" />
                  ) : (
                    <FileText className="h-4 w-4 text-slate-400" />
                  )}
                  <span className="max-w-[120px] truncate">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="ml-0.5 rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                    aria-label="Quitar archivo"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        ) : null}

        <div className="flex items-center justify-between px-3 pb-2">
          <span className="flex items-center gap-3 text-muted-foreground">
            <button
              type="button"
              title="Adjuntar archivo (cualquier tipo)"
              onClick={() => fileInputRef.current?.click()}
              className="transition hover:text-blue-600"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Adjuntar foto"
              onClick={() => imageInputRef.current?.click()}
              className="transition hover:text-blue-600"
            >
              <ImageIcon className="h-4 w-4" />
            </button>
            <AtSign className="h-3.5 w-3.5 text-muted-foreground/40" />
            <input
              ref={imageInputRef}
              type="file"
              accept="*/*"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </span>
          <button
            type="button"
            className="rounded-[7px] bg-blue-600 px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
            disabled={saving || (!comment.trim() && files.length === 0)}
            onClick={submit}
          >
            {saving ? "..." : files.length ? `Enviar (${files.length})` : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  );

  const attachmentList = (atts?: Attachment[]) => {
    if (!atts || !atts.length) return null;
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        {atts.map((a, i) =>
          isImage(a) ? (
            <a
              key={`${a.filePath}-${i}`}
              href={`/api/uploads/${a.filePath}`}
              target="_blank"
              rel="noreferrer"
              className="block"
              title={a.fileName}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/uploads/${a.filePath}`}
                alt={a.fileName}
                className="h-20 w-20 rounded-lg border border-border/60 object-cover transition hover:opacity-90"
              />
            </a>
          ) : (
            <a
              key={`${a.filePath}-${i}`}
              href={`/api/uploads/${a.filePath}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-slate-50 px-2 py-1 text-xs text-slate-600 transition hover:bg-slate-100"
            >
              <FileText className="h-3.5 w-3.5 text-slate-400" /> {a.fileName}
            </a>
          )
        )}
      </div>
    );
  };

  if (composerOnly) {
    return (
      <div>
        {composer}
        {msg ? <p className="mt-2 text-[11px] text-red-600">{msg}</p> : null}
      </div>
    );
  }

  return (
    <section className="sts-card overflow-hidden">
      <div className="border-b border-border/50 bg-muted/20 p-5">
        <h2 className="text-base font-semibold">Comentarios del caso</h2>
      </div>

      <div className="space-y-3 p-5">
        {composer}
        {msg ? <p className="text-xs text-red-600">{msg}</p> : null}

        <div className="space-y-2">
          {comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin comentarios manuales registrados.</p>
          ) : (
            comments.map((c) => (
              <article key={c.id} className="rounded-lg border border-border/60 bg-card p-3">
                <p className="text-xs text-muted-foreground">
                  {fmtDate(c.createdAt)}
                  {c.author ? ` · ${c.author}` : ""}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{c.message}</p>
                {attachmentList(c.attachments)}
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
