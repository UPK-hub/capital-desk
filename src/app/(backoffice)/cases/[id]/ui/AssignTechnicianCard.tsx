"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/Field";

type Technician = { id: string; name: string; email: string };
type Slot = { start: string; end: string; label: string };

type Props = {
  caseId: string;
  workOrderId: string | null;
  currentAssignedToId: string | null;
  caseType: string;
  currentScheduledAt: string | null;
  technicians: Technician[];
};

function toBogotaDateKey(value: string | Date | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function fmtBogotaDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "full",
    timeZone: "America/Bogota",
  }).format(d);
}

export default function AssignTechnicianCard({
  caseId,
  workOrderId,
  currentAssignedToId,
  caseType,
  currentScheduledAt,
  technicians,
}: Props) {
  const router = useRouter();

  const isPreventive = caseType === "PREVENTIVO";
  const [technicianId, setTechnicianId] = useState<string>(currentAssignedToId ?? "");
  const [saving, setSaving] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [slotErr, setSlotErr] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlotStart, setSelectedSlotStart] = useState<string>("");
  const [allowReprogram, setAllowReprogram] = useState(false);
  const [reprogramReason, setReprogramReason] = useState("");

  const programmedDateKey = useMemo(() => toBogotaDateKey(currentScheduledAt), [currentScheduledAt]);
  const programmedDateLabel = useMemo(() => fmtBogotaDate(currentScheduledAt), [currentScheduledAt]);

  const selected = useMemo(
    () => technicians.find((t) => t.id === technicianId) ?? null,
    [technicianId, technicians]
  );

  const visibleSlots = useMemo(() => {
    if (!isPreventive || allowReprogram || !programmedDateKey) return slots;
    return slots.filter((s) => toBogotaDateKey(s.start) === programmedDateKey);
  }, [allowReprogram, isPreventive, programmedDateKey, slots]);

  const selectedSlot = useMemo(
    () => visibleSlots.find((s) => s.start === selectedSlotStart) ?? null,
    [visibleSlots, selectedSlotStart]
  );

  useEffect(() => {
    if (!selectedSlotStart) return;
    if (!visibleSlots.some((s) => s.start === selectedSlotStart)) {
      setSelectedSlotStart("");
    }
  }, [selectedSlotStart, visibleSlots]);

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
      const days = isPreventive ? 30 : 14;
      const res = await fetch(`/api/technicians/${technicianId}/availability?days=${days}`, {
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
  }, [isPreventive, technicianId]);

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
          reprogram: isPreventive ? allowReprogram : false,
          reprogramReason: isPreventive && allowReprogram ? reprogramReason.trim() : null,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error ?? `${res.status} ${res.statusText}`);
      }

      const json = await res.json().catch(() => ({}));
      const reprogrammed = Boolean(json?.reprogrammed);
      setMsg(selected ? `Asignado a ${selected.name}.${reprogrammed ? " Fecha reprogramada." : ""}` : "Asignación realizada.");

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

        {isPreventive ? (
          <div className="sts-card p-3 space-y-2">
            <p className="text-xs text-muted-foreground">Fecha programada</p>
            <p className="text-sm font-medium">{programmedDateLabel}</p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allowReprogram}
                onChange={(e) => setAllowReprogram(e.target.checked)}
                disabled={saving}
              />
              Reprogramar antes de asignar
            </label>
            {allowReprogram ? (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Motivo (opcional)</label>
                <textarea
                  value={reprogramReason}
                  onChange={(e) => setReprogramReason(e.target.value)}
                  rows={2}
                  className="app-field-control w-full rounded-xl border px-3 py-2 text-sm"
                  placeholder="Ej: cambio operativo, disponibilidad de técnico, ventana de patio."
                />
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Para cambiar la fecha, activa reprogramación.
              </p>
            )}
          </div>
        ) : null}

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Seleccionar técnico</label>
          <Select
            value={technicianId}
            onChange={(e) => setTechnicianId(e.target.value)}
            className="app-field-control h-10 w-full rounded-xl border px-3 text-sm"
            disabled={saving}
          >
            <option value="">— Selecciona —</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>

          <div className="sts-card p-3 space-y-2">
            <p className="text-xs text-muted-foreground">Horarios disponibles (America/Bogota)</p>
            {!technicianId ? (
              <p className="text-xs text-muted-foreground">Selecciona un tecnico para ver horarios.</p>
            ) : loadingSlots ? (
              <p className="text-xs text-muted-foreground">Cargando horarios...</p>
            ) : slotErr ? (
              <p className="text-xs text-red-600">{slotErr}</p>
            ) : visibleSlots.length === 0 ? (
              isPreventive && programmedDateKey && !allowReprogram ? (
                <p className="text-xs text-amber-700">
                  No hay horarios en la fecha programada. Activa <span className="font-medium">Reprogramar</span> para asignar otra fecha.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Sin horarios disponibles.</p>
              )
            ) : (
              <div className="space-y-2">
                {visibleSlots.map((s) => (
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
            Esto crea la OT si no existe, la marca como Asignada y registra eventos/notificaciones.
          </p>
        </div>
      </div>
    </section>
  );
}
