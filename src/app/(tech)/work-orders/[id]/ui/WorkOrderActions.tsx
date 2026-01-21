"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  workOrderId: string;
  currentStatus: string;
  canStart: boolean;
  canFinish: boolean;
};

export default function WorkOrderActions({ workOrderId, canStart, canFinish, currentStatus }: Props) {
  const router = useRouter();

  const [notesStart, setNotesStart] = useState("");
  const [photoStart, setPhotoStart] = useState<File | null>(null);

  const [notesFinish, setNotesFinish] = useState("");
  const [photoFinish, setPhotoFinish] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function postForm(url: string, notes: string, photo: File | null) {
    const fd = new FormData();
    fd.set("notes", notes);
    if (photo) fd.set("photo", photo);

    const res = await fetch(url, { method: "POST", body: fd });
    const text = await res.text();
    if (!res.ok) throw new Error(text || `${res.status} ${res.statusText}`);
    return text ? JSON.parse(text) : {};
  }

  async function onStart() {
    setLoading(true);
    setMsg(null);
    try {
      if (!notesStart.trim()) throw new Error("La nota de inicio es requerida.");
      if (!photoStart) throw new Error("La foto de inicio es requerida.");

      await postForm(`/api/work-orders/${workOrderId}/start`, notesStart.trim(), photoStart);
      setMsg("OT iniciada correctamente.");
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Error iniciando OT");
    } finally {
      setLoading(false);
    }
  }

  async function onFinish() {
    setLoading(true);
    setMsg(null);
    try {
      if (!notesFinish.trim()) throw new Error("La nota de cierre es requerida.");
      if (!photoFinish) throw new Error("La foto de cierre es requerida.");

      await postForm(`/api/work-orders/${workOrderId}/finish`, notesFinish.trim(), photoFinish);
      setMsg("OT finalizada correctamente.");
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Error finalizando OT");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-3">
        <p className="text-xs text-muted-foreground">Estado actual</p>
        <p className="mt-1 text-sm font-medium">{currentStatus}</p>
      </div>

      {msg ? (
        <div className="rounded-lg border p-3">
          <p className="text-sm">{msg}</p>
        </div>
      ) : null}

      <div className="rounded-xl border p-4 space-y-3">
        <h3 className="text-sm font-semibold">Iniciar OT</h3>
        <textarea
          className="w-full rounded-md border p-2 text-sm"
          rows={3}
          placeholder="Notas de inicio..."
          value={notesStart}
          onChange={(e) => setNotesStart(e.target.value)}
          disabled={!canStart || loading}
        />
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setPhotoStart(e.target.files?.[0] ?? null)}
          disabled={!canStart || loading}
        />
        <button
          type="button"
          onClick={onStart}
          disabled={!canStart || loading}
          className="w-full rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          {loading ? "Procesando..." : "Iniciar"}
        </button>
        {!canStart ? (
          <p className="text-xs text-muted-foreground">Disponible cuando esté ASIGNADA/CREADA.</p>
        ) : null}
      </div>

      <div className="rounded-xl border p-4 space-y-3">
        <h3 className="text-sm font-semibold">Finalizar OT</h3>
        <textarea
          className="w-full rounded-md border p-2 text-sm"
          rows={3}
          placeholder="Notas de cierre..."
          value={notesFinish}
          onChange={(e) => setNotesFinish(e.target.value)}
          disabled={!canFinish || loading}
        />
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setPhotoFinish(e.target.files?.[0] ?? null)}
          disabled={!canFinish || loading}
        />
        <button
          type="button"
          onClick={onFinish}
          disabled={!canFinish || loading}
          className="w-full rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          {loading ? "Procesando..." : "Finalizar"}
        </button>
        {!canFinish ? (
          <p className="text-xs text-muted-foreground">Disponible cuando esté EN_CAMPO.</p>
        ) : null}
      </div>
    </div>
  );
}
