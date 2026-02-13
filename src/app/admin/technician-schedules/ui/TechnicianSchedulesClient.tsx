"use client";

import * as React from "react";
import { TechnicianRestDay, TechnicianShiftType } from "@prisma/client";

type Row = {
  id: string;
  name: string;
  email: string;
  shiftType: TechnicianShiftType | null;
  restDay: TechnicianRestDay | null;
  timezone: string | null;
};

function clsInput() {
  return "app-field-control h-9 w-full rounded-xl border px-3 text-sm outline-none focus:ring-2 focus:ring-black/10";
}

type Option = { value: string; label: string };

function FancySelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  const current = options.find((o) => o.value === value);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className={`${clsInput()} flex items-center justify-between gap-2`}
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
      >
        <span className="truncate text-left">{current?.label ?? placeholder}</span>
        <svg viewBox="0 0 24 24" className="h-4 w-4 opacity-70" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div className="absolute z-50 mt-1 w-full sts-card p-1 shadow-xl">
          <button
            type="button"
            className="w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-muted"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            {placeholder}
          </button>
          <div className="max-h-56 overflow-auto">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-muted ${
                  value === opt.value ? "bg-muted font-medium" : ""
                }`}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function TechnicianSchedulesClient() {
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<Row[]>([]);

  async function load() {
    setLoading(true);
    setError(null);
    setMsg(null);

    const res = await fetch("/api/admin/technician-schedules", { method: "GET", cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setLoading(false);
      setError(data?.error ?? "No se pudo cargar horarios");
      return;
    }

    setRows(
      (data?.items ?? []).map((row: Row) => ({
        ...row,
        restDay: row.restDay ?? TechnicianRestDay.NONE,
      })) as Row[]
    );
    setLoading(false);
  }

  React.useEffect(() => {
    load();
  }, []);

  async function saveRow(row: Row) {
    if (!row.shiftType || !row.restDay) {
      setError("Debes seleccionar turno y descanso.");
      return;
    }

    setBusyId(row.id);
    setError(null);
    setMsg(null);

    const res = await fetch("/api/admin/technician-schedules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: row.id, shiftType: row.shiftType, restDay: row.restDay }),
    });

    const data = await res.json().catch(() => ({}));
    setBusyId(null);

    if (!res.ok) {
      setError(data?.error ?? "No se pudo guardar");
      return;
    }

    setMsg("Horario actualizado.");
    await load();
  }

  return (
    <section className="sts-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Configuracion de turnos</h2>
        <button className="sts-btn-ghost text-sm" disabled={loading} onClick={load}>
          {loading ? "Cargando..." : "Refrescar"}
        </button>
      </div>

      {error ? <div className="rounded-md border p-3 text-sm">{error}</div> : null}
      {msg ? <div className="rounded-md border p-3 text-sm">{msg}</div> : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay tecnicos activos.</p>
      ) : (
        <div className="overflow-auto sts-card">
          <table className="sts-table">
            <thead className="bg-zinc-50">
              <tr>
                <th className="text-left p-2">Tecnico</th>
                <th className="text-left p-2">Turno</th>
                <th className="text-left p-2">Descanso</th>
                <th className="text-left p-2">Accion</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="p-2">
                    <div className="font-medium">{row.name}</div>
                    <div className="text-xs text-muted-foreground">{row.email}</div>
                  </td>
                  <td className="p-2">
                    <FancySelect
                      value={row.shiftType ?? ""}
                      placeholder="Sin configurar"
                      options={[
                        { value: TechnicianShiftType.DIURNO_AM, label: "Diurno 04:00-12:00" },
                        { value: TechnicianShiftType.DIURNO_PM, label: "Diurno 14:00-18:00" },
                        { value: TechnicianShiftType.NOCTURNO, label: "Nocturno 21:00-05:00" },
                      ]}
                      onChange={(next) =>
                        setRows((prev) =>
                          prev.map((r) => (r.id === row.id ? { ...r, shiftType: (next || null) as any } : r))
                        )
                      }
                      disabled={busyId === row.id}
                    />
                  </td>
                  <td className="p-2">
                    <FancySelect
                      value={row.restDay ?? ""}
                      placeholder="Sin configurar"
                      options={[
                        { value: TechnicianRestDay.NONE, label: "Sin descanso" },
                        { value: TechnicianRestDay.MONDAY, label: "Lunes" },
                        { value: TechnicianRestDay.TUESDAY, label: "Martes" },
                        { value: TechnicianRestDay.WEDNESDAY, label: "Miércoles" },
                        { value: TechnicianRestDay.THURSDAY, label: "Jueves" },
                        { value: TechnicianRestDay.FRIDAY, label: "Viernes" },
                        { value: TechnicianRestDay.SATURDAY, label: "Sábado" },
                        { value: TechnicianRestDay.SUNDAY, label: "Domingo" },
                      ]}
                      onChange={(next) =>
                        setRows((prev) =>
                          prev.map((r) => (r.id === row.id ? { ...r, restDay: (next || null) as any } : r))
                        )
                      }
                      disabled={busyId === row.id}
                    />
                  </td>
                  <td className="p-2">
                    <button
                      className="sts-btn-ghost text-sm"
                      disabled={busyId === row.id}
                      onClick={() => saveRow(row)}
                    >
                      {busyId === row.id ? "Guardando..." : "Guardar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
