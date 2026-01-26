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
  return "h-9 w-full rounded-md border px-2 text-sm outline-none focus:ring-2 focus:ring-black/10";
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

    setRows((data?.items ?? []) as Row[]);
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
                    <select
                      className={clsInput()}
                      value={row.shiftType ?? ""}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r) => (r.id === row.id ? { ...r, shiftType: e.target.value as any } : r))
                        )
                      }
                    >
                      <option value="">Sin configurar</option>
                      <option value={TechnicianShiftType.DIURNO_AM}>Diurno 04:00-12:00</option>
                      <option value={TechnicianShiftType.DIURNO_PM}>Diurno 14:00-18:00</option>
                      <option value={TechnicianShiftType.NOCTURNO}>Nocturno 21:00-05:00</option>
                    </select>
                  </td>
                  <td className="p-2">
                    <select
                      className={clsInput()}
                      value={row.restDay ?? ""}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r) => (r.id === row.id ? { ...r, restDay: e.target.value as any } : r))
                        )
                      }
                    >
                      <option value="">Sin configurar</option>
                      <option value={TechnicianRestDay.SATURDAY}>Sabado</option>
                      <option value={TechnicianRestDay.SUNDAY}>Domingo</option>
                    </select>
                  </td>
                  <td className="p-2">
                    <button
                      className="rounded-md border px-3 py-1.5 text-sm"
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
