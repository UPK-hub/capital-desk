"use client";

import * as React from "react";
import { AlertTriangle, Gauge, RefreshCw } from "lucide-react";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/ui/data-table";

type OdometerRow = {
  busCode: string;
  plate: string | null;
  odometer: string | null;
  eventAt: string | null;
  receivedAt: string | null;
};

function kmNumber(v: string | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Alerta: el odómetro llega en 0 (posible falla de sensor o dato incorrecto).
function isZeroKm(v: string | null): boolean {
  return kmNumber(v) === 0;
}

function fmtKm(v: string | null) {
  const n = kmNumber(v);
  if (n == null) return v ?? "—";
  return `${new Intl.NumberFormat("es-CO").format(n)} km`;
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("es-CO");
}

export default function OdometerPanel() {
  const [rows, setRows] = React.useState<OdometerRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/telemetry/odometer`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = (await res.json()) as { rows: OdometerRow[] };
      setRows(json.rows ?? []);
    } catch (e: any) {
      setError(e?.message || "No se pudo cargar la información");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const zeroBuses = React.useMemo(() => rows.filter((r) => isZeroKm(r.odometer)), [rows]);

  // Los buses en 0 (alerta) se muestran primero; el resto por código.
  const sorted = React.useMemo(() => {
    return [...rows].sort((a, b) => {
      const za = isZeroKm(a.odometer) ? 0 : 1;
      const zb = isZeroKm(b.odometer) ? 0 : 1;
      if (za !== zb) return za - zb;
      return a.busCode.localeCompare(b.busCode);
    });
  }, [rows]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Odómetro (kilometraje)</h2>
          <p className="text-xs text-muted-foreground">
            Último kilometraje reportado por cada bus (campo kilometrosOdometro de las tramas P60)
          </p>
        </div>
        <button className="sts-btn-ghost text-sm inline-flex items-center gap-1" onClick={load}>
          <RefreshCw className="h-4 w-4" /> Actualizar
        </button>
      </div>

      {error ? (
        <div className="sts-card p-4 text-sm text-red-700">No se pudo cargar: {error}</div>
      ) : null}

      {!loading && zeroBuses.length > 0 ? (
        <div className="sts-card border border-red-300 bg-red-50 p-4">
          <div className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm font-semibold">
              {zeroBuses.length} {zeroBuses.length === 1 ? "bus está" : "buses están"} reportando el
              odómetro en 0
            </p>
          </div>
          <p className="mt-1 text-xs text-red-700/80">
            Un odómetro en 0 suele indicar falla del sensor o dato incorrecto. Buses:{" "}
            {zeroBuses.map((b) => b.busCode).join(", ")}
          </p>
        </div>
      ) : null}

      {loading ? (
        <div className="sts-card p-6 text-sm text-muted-foreground">Cargando kilometraje…</div>
      ) : (
        <div className="sts-card p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold inline-flex items-center gap-1">
              <Gauge className="h-4 w-4" /> Kilometraje por bus
            </h3>
            <span className="text-xs text-muted-foreground">
              {rows.length} buses con dato
              {zeroBuses.length > 0 ? ` · ${zeroBuses.length} en 0` : ""}
            </span>
          </div>
          <div className="max-h-[560px] overflow-auto">
            <DataTable>
              <DataTableHeader>
                <DataTableRow>
                  <DataTableHead>Bus</DataTableHead>
                  <DataTableHead>Placa</DataTableHead>
                  <DataTableHead>Último odómetro</DataTableHead>
                  <DataTableHead>Fecha lectura</DataTableHead>
                  <DataTableHead>Recibido</DataTableHead>
                </DataTableRow>
              </DataTableHeader>
              <DataTableBody>
                {sorted.length === 0 ? (
                  <DataTableRow>
                    <DataTableCell colSpan={5} className="text-sm text-muted-foreground">
                      Aún no hay lecturas de odómetro.
                    </DataTableCell>
                  </DataTableRow>
                ) : (
                  sorted.map((r) => {
                    const zero = isZeroKm(r.odometer);
                    return (
                      <DataTableRow key={r.busCode}>
                        <DataTableCell className={`font-medium ${zero ? "text-red-700" : ""}`}>
                          {r.busCode}
                        </DataTableCell>
                        <DataTableCell className={zero ? "text-red-700" : undefined}>
                          {r.plate ?? "—"}
                        </DataTableCell>
                        <DataTableCell className={`font-semibold tabular-nums ${zero ? "text-red-700" : ""}`}>
                          <span className="inline-flex items-center gap-1">
                            {zero ? <AlertTriangle className="h-3.5 w-3.5" /> : null}
                            {fmtKm(r.odometer)}
                          </span>
                        </DataTableCell>
                        <DataTableCell>{fmtDate(r.eventAt)}</DataTableCell>
                        <DataTableCell>{fmtDate(r.receivedAt)}</DataTableCell>
                      </DataTableRow>
                    );
                  })
                )}
              </DataTableBody>
            </DataTable>
          </div>
        </div>
      )}
    </div>
  );
}
