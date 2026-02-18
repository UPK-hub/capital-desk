"use client";

import * as React from "react";
import { TechnicianRestDay, TechnicianShiftType } from "@prisma/client";
import { Select } from "@/components/Field";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/ui/data-table";

type Row = {
  id: string;
  name: string;
  email: string;
  shiftType: TechnicianShiftType | null;
  restDay: TechnicianRestDay | null;
  timezone: string | null;
};

function clsInput() {
  return "app-field-control h-9 w-full rounded-xl border px-3 text-sm focus-visible:outline-none";
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
    <section className="sts-card p-4 sm:p-5 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold">Configuración de turnos</h2>
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
        <>
          <div className="space-y-3 lg:hidden">
            {rows.map((row) => (
              <article key={row.id} className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold">{row.name}</p>
                  <p className="text-xs text-muted-foreground break-all">{row.email}</p>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Turno</label>
                  <Select
                    className={clsInput()}
                    value={row.shiftType ?? ""}
                    disabled={busyId === row.id}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r) =>
                          r.id === row.id ? { ...r, shiftType: (e.target.value || null) as any } : r
                        )
                      )
                    }
                  >
                    <option value="">Sin configurar</option>
                    <option value={TechnicianShiftType.DIURNO_AM}>Diurno 04:00-12:00</option>
                    <option value={TechnicianShiftType.DIURNO_PM}>Diurno 14:00-18:00</option>
                    <option value={TechnicianShiftType.NOCTURNO}>Nocturno 21:00-05:00</option>
                  </Select>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Descanso</label>
                  <Select
                    className={clsInput()}
                    value={row.restDay ?? ""}
                    disabled={busyId === row.id}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r) =>
                          r.id === row.id ? { ...r, restDay: (e.target.value || null) as any } : r
                        )
                      )
                    }
                  >
                    <option value={TechnicianRestDay.NONE}>Sin descanso</option>
                    <option value={TechnicianRestDay.MONDAY}>Lunes</option>
                    <option value={TechnicianRestDay.TUESDAY}>Martes</option>
                    <option value={TechnicianRestDay.WEDNESDAY}>Miércoles</option>
                    <option value={TechnicianRestDay.THURSDAY}>Jueves</option>
                    <option value={TechnicianRestDay.FRIDAY}>Viernes</option>
                    <option value={TechnicianRestDay.SATURDAY}>Sábado</option>
                    <option value={TechnicianRestDay.SUNDAY}>Domingo</option>
                  </Select>
                </div>

                <button
                  className="sts-btn-ghost h-10 w-full text-sm data-table-row-action"
                  disabled={busyId === row.id}
                  onClick={() => saveRow(row)}
                >
                  {busyId === row.id ? "Guardando..." : "Guardar"}
                </button>
              </article>
            ))}
          </div>

          <div className="hidden lg:block">
            <DataTable>
              <DataTableHeader>
                <DataTableRow>
                  <DataTableHead>Técnico</DataTableHead>
                  <DataTableHead>Turno</DataTableHead>
                  <DataTableHead>Descanso</DataTableHead>
                  <DataTableHead className="text-right">Acción</DataTableHead>
                </DataTableRow>
              </DataTableHeader>
              <DataTableBody>
                {rows.map((row) => (
                  <DataTableRow key={row.id}>
                    <DataTableCell>
                      <div className="font-medium">{row.name}</div>
                      <div className="text-xs text-muted-foreground">{row.email}</div>
                    </DataTableCell>
                    <DataTableCell>
                      <Select
                        className={clsInput()}
                        value={row.shiftType ?? ""}
                        disabled={busyId === row.id}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((r) =>
                              r.id === row.id ? { ...r, shiftType: (e.target.value || null) as any } : r
                            )
                          )
                        }
                      >
                        <option value="">Sin configurar</option>
                        <option value={TechnicianShiftType.DIURNO_AM}>Diurno 04:00-12:00</option>
                        <option value={TechnicianShiftType.DIURNO_PM}>Diurno 14:00-18:00</option>
                        <option value={TechnicianShiftType.NOCTURNO}>Nocturno 21:00-05:00</option>
                      </Select>
                    </DataTableCell>
                    <DataTableCell>
                      <Select
                        className={clsInput()}
                        value={row.restDay ?? ""}
                        disabled={busyId === row.id}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((r) =>
                              r.id === row.id ? { ...r, restDay: (e.target.value || null) as any } : r
                            )
                          )
                        }
                      >
                        <option value={TechnicianRestDay.NONE}>Sin descanso</option>
                        <option value={TechnicianRestDay.MONDAY}>Lunes</option>
                        <option value={TechnicianRestDay.TUESDAY}>Martes</option>
                        <option value={TechnicianRestDay.WEDNESDAY}>Miércoles</option>
                        <option value={TechnicianRestDay.THURSDAY}>Jueves</option>
                        <option value={TechnicianRestDay.FRIDAY}>Viernes</option>
                        <option value={TechnicianRestDay.SATURDAY}>Sábado</option>
                        <option value={TechnicianRestDay.SUNDAY}>Domingo</option>
                      </Select>
                    </DataTableCell>
                    <DataTableCell className="text-right">
                      <button
                        className="sts-btn-ghost h-9 px-3 text-sm data-table-row-action"
                        disabled={busyId === row.id}
                        onClick={() => saveRow(row)}
                      >
                        {busyId === row.id ? "Guardando..." : "Guardar"}
                      </button>
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          </div>
        </>
      )}
    </section>
  );
}
