"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  workOrderId: string;
  disabled: boolean;
  startedAt: string | null;
};

export default function StartWorkOrderCard({ workOrderId, disabled, startedAt }: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);

    try {
      const fd = new FormData();
      fd.set("notes", notes);
      if (photo) fd.set("photo", photo);

      const res = await fetch(`/api/work-orders/${workOrderId}/start`, {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `${res.status} ${res.statusText}`);
      }

      setNotes("");
      setPhoto(null);
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Error iniciando OT");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold">Iniciar OT</h2>

      {startedAt ? (
        <p className="mt-2 text-sm text-muted-foreground">Iniciada: {startedAt}</p>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Registra nota y evidencia de inicio.</p>
      )}

      {error ? (
        <div className="mt-3 rounded-lg border p-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3">
        <textarea
          className="min-h-[90px] rounded-md border p-3 text-sm"
          placeholder="Notas de inicio..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={disabled || saving}
        />

        <input
          type="file"
          accept="image/*"
          onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
          disabled={disabled || saving}
        />

        <button
          type="button"
          onClick={submit}
          disabled={disabled || saving || !notes.trim() || !photo}
          className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          {saving ? "Guardando..." : "Iniciar"}
        </button>

        {disabled ? (
          <p className="text-xs text-muted-foreground">
            No disponible si ya fue iniciada o finalizada.
          </p>
        ) : null}
      </div>
    </section>
  );
}
