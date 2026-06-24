"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Image as ImageIcon, AtSign, User } from "lucide-react";

type CommentItem = {
  id: string;
  message: string;
  createdAt: string;
  author?: string | null;
};

function fmtDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(d);
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
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  async function submit() {
    const value = comment.trim();
    if (!value || saving) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/cases/${caseId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "No se pudo guardar el comentario");
      setComment("");
      setMsg(null);
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
        <div className="flex items-center justify-between px-3 pb-2">
          <span className="flex items-center gap-3 text-muted-foreground/60">
            <Paperclip className="h-3.5 w-3.5" />
            <ImageIcon className="h-3.5 w-3.5" />
            <AtSign className="h-3.5 w-3.5" />
          </span>
          <button
            type="button"
            className="rounded-[7px] bg-blue-600 px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
            disabled={saving || !comment.trim()}
            onClick={submit}
          >
            {saving ? "..." : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  );

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
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
