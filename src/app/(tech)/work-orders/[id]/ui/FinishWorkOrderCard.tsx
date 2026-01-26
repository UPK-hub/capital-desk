"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  workOrderId: string;
  disabled: boolean;
  finishedAt: string | null;
  blockingReason: string | null;
};

export default function FinishWorkOrderCard({ workOrderId, disabled, finishedAt, blockingReason }: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [fileName, setFileName] = useState("Ningun archivo seleccionado");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  async function submit() {
    setSaving(true);
    setError(null);

    try {
      const fd = new FormData();
      fd.set("notes", notes);
      if (photo) fd.set("photo", photo);

      const res = await fetch(`/api/work-orders/${workOrderId}/finish`, {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `${res.status} ${res.statusText}`);
      }

      setNotes("");
      setPhoto(null);
      setFileName("Ningun archivo seleccionado");
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Error finalizando OT");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="sts-card p-5">
      <h2 className="text-base font-semibold">Finalizar OT</h2>

      {finishedAt ? (
        <p className="mt-2 text-sm text-muted-foreground">Finalizada: {finishedAt}</p>
      ) : blockingReason ? (
        <p className="mt-2 text-sm text-amber-700">{blockingReason}</p>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Registra nota y evidencia de finalización.</p>
      )}

      {error ? (
        <div className="mt-3 sts-card p-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3">
        <textarea
          className="min-h-[90px] w-full rounded-xl border border-zinc-200/70 bg-white/90 p-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
          placeholder="Notas de finalización..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={disabled || saving}
        />

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Evidencia</p>
          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor={inputId}
              className={`sts-btn-ghost text-sm ${disabled || saving ? "opacity-60 pointer-events-none" : ""}`}
            >
              Seleccionar archivo
            </label>
            <span className="text-xs text-muted-foreground">{fileName}</span>
          </div>
          <input
            id={inputId}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              setPhoto(file);
              setFileName(file?.name ?? "Ningun archivo seleccionado");
            }}
            disabled={disabled || saving}
          />
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={disabled || saving || !notes.trim() || !photo}
          className="sts-btn-primary text-sm disabled:opacity-60"
        >
          {saving ? "Guardando..." : "Finalizar"}
        </button>
      </div>
    </section>
  );
}
