"use client";

import * as React from "react";
import { CalendarSlotKind } from "@prisma/client";

type Technician = { id: string; name: string; email: string };
type Slot = { start: string; end: string };
type OverrideSlot = { start: string; end: string; kind: CalendarSlotKind; note?: string | null };
type Reservation = {
  id: string;
  start: string;
  end: string;
  workOrderNo: number | null;
  caseId: string | null;
  caseTitle: string | null;
};

const BOGOTA_OFFSET_HOURS = 5;

function parseWeekStart(input: string) {
  const m = String(input ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function formatWeekStart(parts: { year: number; month: number; day: number }) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function addDays(parts: { year: number; month: number; day: number }, days: number) {
  const utc = Date.UTC(parts.year, parts.month - 1, parts.day + days, 0, 0, 0, 0);
  const d = new Date(utc);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function bogotaDateUtc(parts: { year: number; month: number; day: number }, hour: number) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, hour + BOGOTA_OFFSET_HOURS, 0, 0, 0));
}

function slotStartIso(weekStart: string, dayIndex: number, hour: number) {
  const parts = parseWeekStart(weekStart);
  if (!parts) return "";
  const dayParts = addDays(parts, dayIndex);
  return bogotaDateUtc(dayParts, hour).toISOString();
}

function formatDayLabel(weekStart: string, dayIndex: number) {
  const parts = parseWeekStart(weekStart);
  if (!parts) return "";
  const dayParts = addDays(parts, dayIndex);
  const date = bogotaDateUtc(dayParts, 0);
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "America/Bogota",
  }).format(date);
}

function formatHour(hour: number) {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? "AM" : "PM";
  return `${h} ${suffix}`;
}

export default function PlannerCalendarClient() {
  const [technicians, setTechnicians] = React.useState<Technician[]>([]);
  const [selectedTechId, setSelectedTechId] = React.useState("");
  const [weekStart, setWeekStart] = React.useState("");
  const [baseSlots, setBaseSlots] = React.useState<Slot[]>([]);
  const [overrides, setOverrides] = React.useState<Record<string, OverrideSlot>>({});
  const [reservations, setReservations] = React.useState<Reservation[]>([]);
  const [mode, setMode] = React.useState<CalendarSlotKind | "CLEAR">(CalendarSlotKind.AVAILABLE);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);

  const baseSet = React.useMemo(() => new Set(baseSlots.map((s) => s.start)), [baseSlots]);

  async function load(nextWeekStart?: string, techId?: string) {
    setLoading(true);
    setError(null);
    setMsg(null);

    const qs = new URLSearchParams();
    if (nextWeekStart) qs.set("weekStart", nextWeekStart);
    if (techId) qs.set("technicianId", techId);

    const res = await fetch(`/api/planner/calendar?${qs.toString()}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(data?.error ?? "No se pudo cargar calendario");
      return;
    }

    setTechnicians((data?.technicians ?? []) as Technician[]);
    setWeekStart(String(data?.weekStart ?? ""));
    setSelectedTechId(String(data?.selectedTechnicianId ?? techId ?? ""));
    setBaseSlots((data?.baseSlots ?? []) as Slot[]);
    setReservations((data?.reservations ?? []) as Reservation[]);

    const map: Record<string, OverrideSlot> = {};
    for (const item of (data?.overrides ?? []) as OverrideSlot[]) {
      map[item.start] = item;
    }
    setOverrides(map);
    setDirty(false);
  }

  React.useEffect(() => {
    load();
  }, []);

  function setOverride(start: string, kind: CalendarSlotKind | "CLEAR") {
    setOverrides((prev) => {
      const next = { ...prev };
      if (kind === "CLEAR") {
        delete next[start];
        return next;
      }
      next[start] = { start, end: "", kind };
      return next;
    });
    setDirty(true);
  }

  function handleCellClick(dayIndex: number, hour: number) {
    if (!weekStart) return;
    const start = slotStartIso(weekStart, dayIndex, hour);
    if (!start) return;

    const cellStart = new Date(start).getTime();
    const cellEnd = cellStart + 60 * 60 * 1000;
    const hasReservation = reservations.some((r) => {
      const rStart = new Date(r.start).getTime();
      const rEnd = new Date(r.end).getTime();
      return rStart < cellEnd && rEnd > cellStart;
    });
    if (hasReservation) return;

    if (mode === "CLEAR") {
      setOverride(start, "CLEAR");
      return;
    }

    const baseAvailable = baseSet.has(start);
    if (mode === CalendarSlotKind.AVAILABLE && baseAvailable) {
      setOverride(start, "CLEAR");
      return;
    }

    setOverride(start, mode);
  }

  async function save() {
    if (!selectedTechId || !weekStart) return;
    setSaving(true);
    setError(null);
    setMsg(null);

    const payload = Object.values(overrides).map((o) => {
      const start = new Date(o.start);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      return { start: start.toISOString(), end: end.toISOString(), kind: o.kind };
    });

    const res = await fetch("/api/planner/calendar", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ technicianId: selectedTechId, weekStart, slots: payload }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      setError(data?.error ?? "No se pudo guardar");
      return;
    }

    setMsg("Calendario guardado.");
    setDirty(false);
    await load(weekStart, selectedTechId);
  }

  function goWeek(delta: number) {
    const parts = parseWeekStart(weekStart);
    if (!parts) return;
    const next = addDays(parts, delta * 7);
    const nextStr = formatWeekStart(next);
    load(nextStr, selectedTechId);
  }

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const days = Array.from({ length: 7 }, (_, i) => i);

  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <button className="rounded-md border px-2 py-1 text-sm" onClick={() => goWeek(-1)} disabled={loading}>
            Semana anterior
          </button>
          <button className="rounded-md border px-2 py-1 text-sm" onClick={() => goWeek(1)} disabled={loading}>
            Semana siguiente
          </button>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Tecnico</label>
          <select
            className="h-9 rounded-md border px-2 text-sm"
            value={selectedTechId}
            onChange={(e) => load(weekStart, e.target.value)}
            disabled={loading}
          >
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} {t.email ? `(${t.email})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Modo</label>
          <select
            className="h-9 rounded-md border px-2 text-sm"
            value={mode}
            onChange={(e) => setMode(e.target.value as any)}
            disabled={loading}
          >
            <option value={CalendarSlotKind.AVAILABLE}>Disponible</option>
            <option value={CalendarSlotKind.BLOCKED}>Bloqueado</option>
            <option value={CalendarSlotKind.TIME_OFF}>Descanso</option>
            <option value="CLEAR">Limpiar</option>
          </select>
        </div>

        <button
          className="rounded-md bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
          onClick={save}
          disabled={saving || loading || !dirty}
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>

      {error ? <div className="rounded-md border p-3 text-sm text-red-600">{error}</div> : null}
      {msg ? <div className="rounded-md border p-3 text-sm">{msg}</div> : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando calendario...</p>
      ) : technicians.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay tecnicos activos.</p>
      ) : (
        <div className="overflow-auto border rounded-lg">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[80px_repeat(7,minmax(120px,1fr))] text-xs font-semibold bg-zinc-50 border-b">
              <div className="p-2">Hora</div>
              {days.map((d) => (
                <div key={d} className="p-2 text-center">
                  {formatDayLabel(weekStart, d)}
                </div>
              ))}
            </div>

            {hours.map((hour) => (
              <div
                key={hour}
                className="grid grid-cols-[80px_repeat(7,minmax(120px,1fr))] border-b last:border-b-0"
              >
                <div className="p-2 text-xs text-muted-foreground">{formatHour(hour)}</div>
                {days.map((day) => {
                  const start = slotStartIso(weekStart, day, hour);
                  const override = overrides[start];
                  const baseAvailable = baseSet.has(start);
                  const cellStartMs = new Date(start).getTime();
                  const cellEndMs = cellStartMs + 60 * 60 * 1000;
                  const reservation = reservations.find((r) => {
                    const rStart = new Date(r.start).getTime();
                    const rEnd = new Date(r.end).getTime();
                    return rStart < cellEndMs && rEnd > cellStartMs;
                  });

                  const status = reservation
                    ? "RESERVED"
                    : override?.kind ?? (baseAvailable ? "BASE" : "EMPTY");

                  const cls =
                    status === "RESERVED"
                      ? "bg-blue-300/70"
                      : status === CalendarSlotKind.AVAILABLE
                      ? "bg-emerald-300/70"
                      : status === CalendarSlotKind.BLOCKED
                      ? "bg-red-300/70"
                      : status === CalendarSlotKind.TIME_OFF
                      ? "bg-amber-300/70"
                      : status === "BASE"
                      ? "bg-emerald-100"
                      : "bg-zinc-50";

                  const label = reservation
                    ? `${reservation.workOrderNo ? `OT-${reservation.workOrderNo}` : "OT"}${
                        reservation.caseTitle ? ` | ${reservation.caseTitle}` : ""
                      }`
                    : "";

                  return (
                    <button
                      key={start}
                      type="button"
                      className={`h-10 border-l text-[10px] leading-tight px-1 text-left ${cls}`}
                      onClick={() => handleCellClick(day, hour)}
                      title={label || start}
                    >
                      {reservation ? <span className="line-clamp-2">{label}</span> : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-emerald-100 border" /> Base disponible
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-blue-300/70 border" /> OT asignada
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-emerald-300/70 border" /> Disponible (override)
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-red-300/70 border" /> Bloqueado
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-amber-300/70 border" /> Descanso
        </span>
      </div>
    </section>
  );
}
