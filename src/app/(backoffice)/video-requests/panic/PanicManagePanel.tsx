"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PanicEventStatus } from "@prisma/client";
import { STATUS_LABEL } from "./format";

type Usuario = { id: string; name: string };

export default function PanicManagePanel({
  eventId,
  status,
  assignedToId,
  resolution,
  usuarios,
}: {
  eventId: string;
  status: PanicEventStatus;
  assignedToId: string | null;
  resolution: string | null;
  usuarios: Usuario[];
}) {
  const router = useRouter();
  const [nextStatus, setNextStatus] = useState<PanicEventStatus>(status);
  const [nextAssignee, setNextAssignee] = useState<string>(assignedToId ?? "");
  const [nextResolution, setNextResolution] = useState<string>(resolution ?? "");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/panic-events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          assignedToId: nextAssignee || null,
          resolution: nextResolution,
          note: note.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "No se pudo guardar");
      setNote("");
      router.refresh();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="sts-card p-5">
      <h2 className="text-base font-semibold">Tratamiento</h2>

      <div className="mt-4 space-y-3 text-sm">
        <label className="block">
          <span className="text-xs text-muted-foreground">Estado</span>
          <select
            className="mt-1 h-10 w-full rounded-md border px-3 text-sm"
            value={nextStatus}
            onChange={(e) => setNextStatus(e.target.value as PanicEventStatus)}
          >
            {Object.values(PanicEventStatus).map((value) => (
              <option key={value} value={value}>
                {STATUS_LABEL[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs text-muted-foreground">Responsable</span>
          <select
            className="mt-1 h-10 w-full rounded-md border px-3 text-sm"
            value={nextAssignee}
            onChange={(e) => setNextAssignee(e.target.value)}
          >
            <option value="">Sin asignar</option>
            {usuarios.map((usuario) => (
              <option key={usuario.id} value={usuario.id}>
                {usuario.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs text-muted-foreground">Conclusión de la revisión</span>
          <textarea
            className="mt-1 w-full rounded-md border p-3 text-sm"
            rows={3}
            value={nextResolution}
            onChange={(e) => setNextResolution(e.target.value)}
            placeholder="Qué se observó en el video y qué se hizo"
          />
        </label>

        <label className="block">
          <span className="text-xs text-muted-foreground">Nota para la bitácora</span>
          <textarea
            className="mt-1 w-full rounded-md border p-3 text-sm"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Opcional"
          />
        </label>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button className="sts-btn-primary h-10 w-full px-4 text-sm" onClick={guardar} disabled={saving}>
          {saving ? "Guardando..." : "Guardar gestión"}
        </button>
      </div>
    </section>
  );
}
