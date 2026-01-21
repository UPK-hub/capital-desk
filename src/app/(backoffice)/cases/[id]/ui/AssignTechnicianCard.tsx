"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Technician = { id: string; name: string; email: string };

type Props = {
  caseId: string;
  workOrderId: string | null;
  currentAssignedToId: string | null;
  technicians: Technician[];
};

export default function AssignTechnicianCard({
  caseId,
  workOrderId,
  currentAssignedToId,
  technicians,
}: Props) {
  const router = useRouter();

  const [technicianId, setTechnicianId] = useState<string>(currentAssignedToId ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const selected = useMemo(
    () => technicians.find((t) => t.id === technicianId) ?? null,
    [technicianId, technicians]
  );

  async function assign() {
    setSaving(true);
    setMsg(null);
    setErr(null);

    try {
      const id = String(technicianId ?? "").trim();
      if (!id) throw new Error("Selecciona un técnico.");

      const res = await fetch(`/api/cases/${caseId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ technicianId: id }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `${res.status} ${res.statusText}`);
      }

      const json = await res.json().catch(() => ({}));
      setMsg(
        selected
          ? `Asignado a ${selected.name}.`
          : `Asignación realizada.`
      );

      // refrescar data server component
      router.refresh();

      // opcional: si ya existe OT, llevarlo directo
      // (si prefieres quedarse en el caso, comenta estas 2 líneas)
      const woId = json?.workOrderId ?? workOrderId;
      if (woId) router.push(`/work-orders/${woId}`);
    } catch (e: any) {
      setErr(e?.message ?? "Error asignando técnico");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold">Asignación</h2>

      <div className="mt-3 space-y-3">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Técnico actual</p>
          <p className="mt-1 text-sm font-medium">
            {currentAssignedToId
              ? technicians.find((t) => t.id === currentAssignedToId)?.name ?? currentAssignedToId
              : "—"}
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Seleccionar técnico</label>
          <select
            value={technicianId}
            onChange={(e) => setTechnicianId(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
            disabled={saving}
          >
            <option value="">— Selecciona —</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} {t.email ? `(${t.email})` : ""}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={assign}
            disabled={saving || !technicianId}
            className="inline-flex w-full items-center justify-center rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {saving ? "Asignando…" : "Asignar a técnico"}
          </button>

          {msg ? (
            <div className="rounded-md border p-3 text-sm">{msg}</div>
          ) : null}

          {err ? (
            <div className="rounded-md border p-3 text-sm text-red-600">{err}</div>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Esto crea la OT si no existe, la marca como ASIGNADA y registra eventos.
          </p>
        </div>
      </div>
    </section>
  );
}
