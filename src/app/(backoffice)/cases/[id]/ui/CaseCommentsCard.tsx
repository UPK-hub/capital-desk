"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

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
}: {
  caseId: string;
  comments: CommentItem[];
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
      setMsg("Comentario guardado.");
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "No se pudo guardar el comentario");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="sts-card overflow-hidden">
      <div className="border-b border-border/50 bg-muted/20 p-5">
        <h2 className="text-base font-semibold">Comentarios del caso</h2>
      </div>

      <div className="space-y-3 p-5">
        <textarea
          className="app-field-control min-h-[88px] w-full rounded-xl border p-3 text-sm focus-visible:outline-none"
          placeholder="Escribe un comentario para este caso..."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={saving}
        />
        <button
          type="button"
          className="sts-btn-primary w-full text-sm disabled:opacity-60"
          disabled={saving || !comment.trim()}
          onClick={submit}
        >
          {saving ? "Guardando..." : "Guardar comentario"}
        </button>
        {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}

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

