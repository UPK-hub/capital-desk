"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Technician = { id: string; name: string; email: string };
type Slot = { start: string; end: string; label: string };

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
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [slotErr, setSlotErr] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlotStart, setSelectedSlotStart] = useState<string>("");

  const selected = useMemo(
    () => technicians.find((t) => t.id === technicianId) ?? null,
    [technicianId, technicians]
  );

  const selectedSlot = useMemo(
    () => slots.find((s) => s.start === selectedSlotStart) ?? null,
    [slots, selectedSlotStart]
  );

  useEffect(() => {
    if (!technicianId) {
      setSlots([]);
      setSelectedSlotStart("");
      return;
    }

    let active = true;
    setLoadingSlots(true);
    setSlotErr(null);
    setSlots([]);
    setSelectedSlotStart("");

    (async () => {
      const res = await fetch(`/api/technicians/${technicianId}/availability?days=14`, {
        method: "GET",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!active) return;
      setLoadingSlots(false);

      if (!res.ok) {
        setSlotErr(data?.error ?? "No se pudo cargar horarios");
        return;
      }

      const list = (data?.slots ?? []) as Slot[];
      setSlots(list);
    })();

    return () => {
      active = false;
    };
  }, [technicianId]);

  async function assign() {
    setSaving(true);
    setMsg(null);
    setErr(null);

    try {
      const id = String(technicianId ?? "").trim();
      if (!id) throw new Error("Selecciona un técnico.");

      if (!selectedSlot) throw new Error("Selecciona un horario disponible.");

      const res = await fetch(`/api/cases/${caseId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          technicianId: id,
          scheduledAt: selectedSlot.start,
          scheduledTo: selectedSlot.end,
        }),
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
    <section className="sts-card p-5">
      <h2 className="text-base font-semibold">Asignación</h2>

      <div className="mt-3 space-y-3">
        <div className="sts-card p-3">
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

          <div className="sts-card p-3 space-y-2">
            <p className="text-xs text-muted-foreground">Horarios disponibles (America/Bogota)</p>
            {!technicianId ? (
              <p className="text-xs text-muted-foreground">Selecciona un tecnico para ver horarios.</p>
            ) : loadingSlots ? (
              <p className="text-xs text-muted-foreground">Cargando horarios...</p>
            ) : slotErr ? (
              <p className="text-xs text-red-600">{slotErr}</p>
            ) : slots.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin horarios disponibles.</p>
            ) : (
              <div className="space-y-2">
                {slots.map((s) => (
                  <label key={s.start} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="schedule-slot"
                      checked={selectedSlotStart === s.start}
                      onChange={() => setSelectedSlotStart(s.start)}
                    />
                    <span>{s.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={assign}
            disabled={saving || !technicianId || !selectedSlot}
            className="inline-flex w-full items-center justify-center sts-btn-primary text-sm disabled:opacity-60"
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
