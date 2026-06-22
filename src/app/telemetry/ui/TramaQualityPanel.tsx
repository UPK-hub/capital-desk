"use client";

import * as React from "react";
import { AlertTriangle, Copy, Download, RefreshCw, Repeat } from "lucide-react";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/ui/data-table";

type RetransmittedRow = {
  id: string;
  busCode: string;
  idRegistro: string | null;
  tramaType: number | null;
  kind: string;
  eventAt: string | null;
  receivedAt: string;
};

type DuplicatedGroup = {
  idRegistro: string;
  count: number;
  busCode: string | null;
  firstAt: string | null;
  lastAt: string | null;
};

type QualityData = {
  retransmitted: RetransmittedRow[];
  duplicated: DuplicatedGroup[];
  counts: {
    retransmittedTotal: number;
    duplicatedGroups: number;
    duplicatedExtraRows: number;
  };
  limit: number;
};

function nfmt(n: number) {
  return new Intl.NumberFormat("es-CO").format(n ?? 0);
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("es-CO");
}

function Stat({
  label,
  value,
  sub,
  color,
  Icon,
}: {
  label: string;
  value: number;
  sub?: string;
  color: string;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="sts-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${color}1f`, color }}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums" style={{ color }}>
        {nfmt(value)}
      </p>
      {sub ? <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export default function TramaQualityPanel({
  start,
  end,
  busId,
  busLabel,
}: {
  start: string;
  end: string;
  busId: string | null;
  busLabel?: string | null;
}) {
  const [data, setData] = React.useState<QualityData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const qs = React.useMemo(() => {
    const p = new URLSearchParams();
    if (start) p.set("start", start);
    if (end) p.set("end", end);
    if (busId) p.set("busId", busId);
    return p.toString();
  }, [start, end, busId]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/telemetry/quality?${qs}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = (await res.json()) as QualityData;
      setData(json);
    } catch (e: any) {
      setError(e?.message || "No se pudo cargar la información");
    } finally {
      setLoading(false);
    }
  }, [qs]);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Calidad de tramas</h2>
          <p className="text-xs text-muted-foreground">
            Retransmitidas y duplicadas (mismo idRegistro) · {busLabel ? busLabel : "toda la flota"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="sts-btn-ghost text-sm inline-flex items-center gap-1" onClick={load}>
            <RefreshCw className="h-4 w-4" /> Actualizar
          </button>
          <a
            className="sts-btn-primary text-sm inline-flex items-center gap-1"
            href={`/api/telemetry/quality/export?${qs}`}
          >
            <Download className="h-4 w-4" /> Exportar a Excel
          </a>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Tramas retransmitidas"
          value={data?.counts.retransmittedTotal ?? 0}
          color="#b45309"
          Icon={Repeat}
          sub="retransmision = verdadero"
        />
        <Stat
          label="Grupos duplicados"
          value={data?.counts.duplicatedGroups ?? 0}
          color="#b91c1c"
          Icon={Copy}
          sub="mismo idRegistro"
        />
        <Stat
          label="Duplicadas adicionales"
          value={data?.counts.duplicatedExtraRows ?? 0}
          color="#7c3aed"
          Icon={AlertTriangle}
          sub="repeticiones por encima de 1"
        />
      </div>

      {error ? (
        <div className="sts-card p-4 text-sm text-red-700">No se pudo cargar: {error}</div>
      ) : null}

      {loading ? (
        <div className="sts-card p-6 text-sm text-muted-foreground">Cargando calidad de tramas…</div>
      ) : (
        <>
          <div className="sts-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Tramas retransmitidas</h3>
              <span className="text-xs text-muted-foreground">
                Mostrando {nfmt(data?.retransmitted.length ?? 0)}
                {data && data.counts.retransmittedTotal > data.retransmitted.length
                  ? ` de ${nfmt(data.counts.retransmittedTotal)}`
                  : ""}
              </span>
            </div>
            <div className="max-h-[420px] overflow-auto">
              <DataTable>
                <DataTableHeader>
                  <DataTableRow>
                    <DataTableHead>Bus</DataTableHead>
                    <DataTableHead>idRegistro</DataTableHead>
                    <DataTableHead>Tipo</DataTableHead>
                    <DataTableHead>Clase</DataTableHead>
                    <DataTableHead>Fecha lectura</DataTableHead>
                    <DataTableHead>Recibido</DataTableHead>
                  </DataTableRow>
                </DataTableHeader>
                <DataTableBody>
                  {(data?.retransmitted.length ?? 0) === 0 ? (
                    <DataTableRow>
                      <DataTableCell colSpan={6} className="text-sm text-muted-foreground">
                        Sin tramas retransmitidas en el rango seleccionado.
                      </DataTableCell>
                    </DataTableRow>
                  ) : (
                    data!.retransmitted.map((r) => (
                      <DataTableRow key={r.id}>
                        <DataTableCell className="font-medium">{r.busCode}</DataTableCell>
                        <DataTableCell className="tabular-nums">{r.idRegistro ?? "—"}</DataTableCell>
                        <DataTableCell>{r.tramaType ?? "—"}</DataTableCell>
                        <DataTableCell>{r.kind}</DataTableCell>
                        <DataTableCell>{fmtDate(r.eventAt)}</DataTableCell>
                        <DataTableCell>{fmtDate(r.receivedAt)}</DataTableCell>
                      </DataTableRow>
                    ))
                  )}
                </DataTableBody>
              </DataTable>
            </div>
          </div>

          <div className="sts-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Tramas duplicadas (mismo idRegistro)</h3>
              <span className="text-xs text-muted-foreground">
                {nfmt(data?.duplicated.length ?? 0)} grupos
              </span>
            </div>
            <div className="max-h-[420px] overflow-auto">
              <DataTable>
                <DataTableHeader>
                  <DataTableRow>
                    <DataTableHead>idRegistro</DataTableHead>
                    <DataTableHead>Repeticiones</DataTableHead>
                    <DataTableHead>Bus</DataTableHead>
                    <DataTableHead>Primera</DataTableHead>
                    <DataTableHead>Última</DataTableHead>
                  </DataTableRow>
                </DataTableHeader>
                <DataTableBody>
                  {(data?.duplicated.length ?? 0) === 0 ? (
                    <DataTableRow>
                      <DataTableCell colSpan={5} className="text-sm text-muted-foreground">
                        Sin tramas duplicadas por idRegistro en el rango seleccionado.
                      </DataTableCell>
                    </DataTableRow>
                  ) : (
                    data!.duplicated.map((r) => (
                      <DataTableRow key={r.idRegistro}>
                        <DataTableCell className="font-medium tabular-nums">{r.idRegistro}</DataTableCell>
                        <DataTableCell className="font-semibold tabular-nums">{nfmt(r.count)}</DataTableCell>
                        <DataTableCell>{r.busCode ?? "—"}</DataTableCell>
                        <DataTableCell>{fmtDate(r.firstAt)}</DataTableCell>
                        <DataTableCell>{fmtDate(r.lastAt)}</DataTableCell>
                      </DataTableRow>
                    ))
                  )}
                </DataTableBody>
              </DataTable>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
