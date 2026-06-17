"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/Field";

type Technician = { id: string; name: string; email: string };
type Slot = { start: string; end: string; label: string };

// Colombia (America/Bogota) es UTC-5 fijo (sin horario de verano), igual que en
// src/lib/technician-schedule. Inline para no arrastrar @prisma/client al cliente.
const BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1000;

// Convierte un valor de <input type="datetime-local"> ("YYYY-MM-DDTHH:mm"),
// interpretado como hora local de Bogotá, a { start, end } en UTC ISO con
// duración de 60 minutos (el flujo de OT trabaja con ventanas de 1 hora).
function freeSlotFromLocalInput(value: string): { start: string; end: string } | null {
  const m = String(value ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return null;
  }
  // Hora de pared en Bogotá -> UTC (restamos el offset, igual que la lib del server).
  const startMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0) - BOGOTA_OFFSET_MS;
  const startUtc = new Date(startMs);
  if (Number.isNaN(startUtc.getTime())) return null;
  const endUtc = new Date(startUtc.getTime() + 60 * 60 * 1000);
  return { start: startUtc.toISOString(), end: endUtc.toISOString() };
}

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
  // Técnico sin turno: se asigna eligiendo fecha/hora libre.
  const [hasSchedule, setHasSchedule] = useState<boolean>(true);
  const [freeDateTime, setFreeDateTime] = useState<string>("");

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
      setHasSchedule(true);
      setFreeDateTime("");
      return;
    }

    let active = true;
    setLoadingSlots(true);
    setSlotErr(null);
    setSlots([]);
    setSelectedSlotStart("");
    setHasSchedule(true);
    setFreeDateTime("");

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

      // hasSchedule por defecto true para no romper a quienes ya tienen turno.
      setHasSchedule(data?.hasSchedule !== false);
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

      let scheduledAt: string;
      let scheduledTo: string;
      if (hasSchedule) {
        if (!selectedSlot) throw new Error("Selecciona un horario disponible.");
        scheduledAt = selectedSlot.start;
        scheduledTo = selectedSlot.end;
      } else {
        // Técnico sin turno: usar la fecha/hora libre elegida (ventana de 60 min).
        const free = freeSlotFromLocalInput(freeDateTime);
        if (!free) throw new Error("Selecciona una fecha y hora válidas.");
        scheduledAt = free.start;
        scheduledTo = free.end;
      }

      const res = await fetch(`/api/cases/${caseId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          technicianId: id,
          scheduledAt,
          scheduledTo,
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
            {!technicianId ? (
              <>
                <p className="text-xs text-muted-foreground">Horarios disponibles (America/Bogota)</p>
                <p className="text-xs text-muted-foreground">Selecciona un tecnico para ver horarios.</p>
              </>
            ) : loadingSlots ? (
              <>
                <p className="text-xs text-muted-foreground">Horarios disponibles (America/Bogota)</p>
                <p className="text-xs text-muted-foreground">Cargando horarios...</p>
              </>
            ) : slotErr ? (
              <p className="text-xs text-red-600">{slotErr}</p>
            ) : !hasSchedule ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-amber-700">
                  Este técnico no tiene turno configurado. Asígnalo eligiendo fecha y hora libre.
                </p>
                <label className="text-xs text-muted-foreground">Asignar sin turno (America/Bogota)</label>
                <input
                  type="datetime-local"
                  value={freeDateTime}
                  onChange={(e) => setFreeDateTime(e.target.value)}
                  disabled={saving}
                  className="app-field-control h-10 w-full rounded-xl border px-3 text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  Se reservará una ventana de 60 minutos desde la hora elegida.
                </p>
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">Horarios disponibles (America/Bogota)</p>
                {visibleSlots.length === 0 ? (
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
              </>
            )}
          </div>

          <button
            type="button"
            onClick={assign}
            disabled={saving || !technicianId || (hasSchedule ? !selectedSlot : !freeDateTime)}
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
