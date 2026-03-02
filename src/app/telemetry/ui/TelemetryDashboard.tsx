"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BusCombobox } from "@/components/BusCombobox";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/ui/data-table";

const TelemetrySatelliteMap = dynamic(() => import("./TelemetrySatelliteMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] items-center justify-center rounded-2xl border border-border bg-muted/20 text-sm text-muted-foreground">
      Cargando mapa satelital...
    </div>
  ),
});

export type TelemetryTotals = {
  total: number;
  tramas: number;
  eventos: number;
  alarmas: number;
  p20: number;
  p60: number;
};

export type TelemetryMapPoint = {
  busId: string;
  code: string;
  plate: string | null;
  lat: number;
  lng: number;
  lastSeenAt: string | null;
  lastEventType: string | null;
  lastSeverity: string | null;
  lastMessage: string | null;
};

export type BusCountRow = {
  busCode: string;
  total: number;
};

export type EventRow = {
  code: string;
  label: string;
  total: number;
};

export type AlarmRow = {
  code: string;
  label: string;
  levelCode: string;
  levelLabel: string;
  total: number;
};

type Props = {
  range: { start: string; end: string; rangeDays: number };
  selectedBus: { id: string; code: string; plate: string | null } | null;
  generalTotals: TelemetryTotals;
  busTotals: TelemetryTotals | null;
  points: TelemetryMapPoint[];
  busCounts: BusCountRow[];
  events: EventRow[];
  alarms: AlarmRow[];
};

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-CO");
}

export default function TelemetryDashboard({
  range,
  selectedBus,
  generalTotals,
  busTotals,
  points,
  busCounts,
  events,
  alarms,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [start, setStart] = React.useState(range.start);
  const [end, setEnd] = React.useState(range.end);
  const [bus, setBus] = React.useState<{ id: string; code: string; plate: string | null } | null>(null);

  React.useEffect(() => {
    setStart(range.start);
    setEnd(range.end);
  }, [range.start, range.end]);

  React.useEffect(() => {
    setBus(selectedBus);
  }, [selectedBus?.id]);

  const applyRange = (days: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("range", String(days));
    params.delete("start");
    params.delete("end");
    if (bus?.id) params.set("busId", bus.id);
    router.push(`${pathname}?${params.toString()}`);
  };

  const applyCustom = () => {
    const params = new URLSearchParams(searchParams);
    params.set("start", start);
    params.set("end", end);
    params.delete("range");
    if (bus?.id) params.set("busId", bus.id);
    router.push(`${pathname}?${params.toString()}`);
  };

  const applyBus = (next: { id: string; code: string; plate: string | null } | null) => {
    setBus(next);
    const params = new URLSearchParams(searchParams);
    if (next?.id) params.set("busId", next.id);
    else params.delete("busId");
    params.delete("range");
    params.set("start", start);
    params.set("end", end);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Telemetría</h1>
          <p className="text-sm text-muted-foreground">
            Vista independiente de tramas por rango, por bus y georreferenciación satelital.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[220px]">
            <BusCombobox value={bus} onChange={applyBus} />
          </div>
          <button className="sts-btn-ghost text-sm" onClick={() => applyBus(null)}>
            Ver general
          </button>
          <button className="sts-btn-ghost text-sm" onClick={() => applyRange(7)}>
            7 días
          </button>
          <button className="sts-btn-ghost text-sm" onClick={() => applyRange(30)}>
            30 días
          </button>
          <button className="sts-btn-ghost text-sm" onClick={() => applyRange(90)}>
            90 días
          </button>
          <div className="flex items-center gap-2 rounded-full border px-2 py-1">
            <input type="date" className="bg-transparent text-xs" value={start} onChange={(e) => setStart(e.target.value)} />
            <span className="text-xs text-muted-foreground">→</span>
            <input type="date" className="bg-transparent text-xs" value={end} onChange={(e) => setEnd(e.target.value)} />
            <button className="sts-btn-soft text-xs" onClick={applyCustom}>
              Aplicar
            </button>
          </div>
        </div>
      </div>

      {bus ? (
        <div className="sts-card p-3">
          <p className="text-xs text-muted-foreground">
            Filtro por bus: <span className="font-medium">{bus.code}</span>
            {bus.plate ? ` · ${bus.plate}` : ""}
          </p>
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Total general</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
          <div className="sts-card sts-card--interactive p-3">
            <p className="text-xs text-muted-foreground">Total tramas</p>
            <p className="mt-2 text-xl font-semibold">{generalTotals.total}</p>
          </div>
          <div className="sts-card sts-card--interactive p-3">
            <p className="text-xs text-muted-foreground">Tipo 1</p>
            <p className="mt-2 text-xl font-semibold">{generalTotals.tramas}</p>
          </div>
          <div className="sts-card sts-card--interactive p-3">
            <p className="text-xs text-muted-foreground">P20</p>
            <p className="mt-2 text-xl font-semibold">{generalTotals.p20}</p>
          </div>
          <div className="sts-card sts-card--interactive p-3">
            <p className="text-xs text-muted-foreground">P60</p>
            <p className="mt-2 text-xl font-semibold">{generalTotals.p60}</p>
          </div>
          <div className="sts-card sts-card--interactive p-3">
            <p className="text-xs text-muted-foreground">Tipo 2</p>
            <p className="mt-2 text-xl font-semibold">{generalTotals.eventos}</p>
          </div>
          <div className="sts-card sts-card--interactive p-3">
            <p className="text-xs text-muted-foreground">Tipo 3</p>
            <p className="mt-2 text-xl font-semibold">{generalTotals.alarmas}</p>
          </div>
        </div>
      </section>

      {busTotals ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Resumen del bus seleccionado</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
            <div className="sts-card sts-card--interactive p-3">
              <p className="text-xs text-muted-foreground">Total tramas</p>
              <p className="mt-2 text-xl font-semibold">{busTotals.total}</p>
            </div>
            <div className="sts-card sts-card--interactive p-3">
              <p className="text-xs text-muted-foreground">Tipo 1</p>
              <p className="mt-2 text-xl font-semibold">{busTotals.tramas}</p>
            </div>
            <div className="sts-card sts-card--interactive p-3">
              <p className="text-xs text-muted-foreground">P20</p>
              <p className="mt-2 text-xl font-semibold">{busTotals.p20}</p>
            </div>
            <div className="sts-card sts-card--interactive p-3">
              <p className="text-xs text-muted-foreground">P60</p>
              <p className="mt-2 text-xl font-semibold">{busTotals.p60}</p>
            </div>
            <div className="sts-card sts-card--interactive p-3">
              <p className="text-xs text-muted-foreground">Tipo 2</p>
              <p className="mt-2 text-xl font-semibold">{busTotals.eventos}</p>
            </div>
            <div className="sts-card sts-card--interactive p-3">
              <p className="text-xs text-muted-foreground">Tipo 3</p>
              <p className="mt-2 text-xl font-semibold">{busTotals.alarmas}</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="sts-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Mapa satelital (latitud/longitud)</h2>
          <p className="text-xs text-muted-foreground">Puntos con coordenadas: {points.length}</p>
        </div>
        <TelemetrySatelliteMap points={points} selectedBusId={bus?.id ?? null} />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="sts-card p-5 space-y-4">
          <h2 className="text-base font-semibold">Buses por volumen de tramas (rango)</h2>
          <DataTable>
            <DataTableHeader>
              <DataTableRow>
                <DataTableHead>Bus</DataTableHead>
                <DataTableHead>Total</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {busCounts.length === 0 ? (
                <DataTableRow>
                  <DataTableCell colSpan={2} className="text-sm text-muted-foreground">
                    Sin datos para el rango seleccionado.
                  </DataTableCell>
                </DataTableRow>
              ) : (
                busCounts.map((row) => (
                  <DataTableRow key={row.busCode}>
                    <DataTableCell>{row.busCode}</DataTableCell>
                    <DataTableCell>{row.total}</DataTableCell>
                  </DataTableRow>
                ))
              )}
            </DataTableBody>
          </DataTable>
        </div>

        <div className="sts-card p-5 space-y-4">
          <h2 className="text-base font-semibold">Última posición por bus</h2>
          <DataTable>
            <DataTableHeader>
              <DataTableRow>
                <DataTableHead>Bus</DataTableHead>
                <DataTableHead>Ubicación</DataTableHead>
                <DataTableHead>Última trama</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {points.length === 0 ? (
                <DataTableRow>
                  <DataTableCell colSpan={3} className="text-sm text-muted-foreground">
                    No hay coordenadas para mostrar en el rango/filtro actual.
                  </DataTableCell>
                </DataTableRow>
              ) : (
                points.map((point) => (
                  <DataTableRow key={`${point.busId}-${point.lat}-${point.lng}`}>
                    <DataTableCell>{point.code}</DataTableCell>
                    <DataTableCell>
                      {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
                    </DataTableCell>
                    <DataTableCell>{formatDateTime(point.lastSeenAt)}</DataTableCell>
                  </DataTableRow>
                ))
              )}
            </DataTableBody>
          </DataTable>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="sts-card p-5 space-y-4">
          <h2 className="text-base font-semibold">Eventos tipo 2</h2>
          <DataTable>
            <DataTableHeader>
              <DataTableRow>
                <DataTableHead>Código</DataTableHead>
                <DataTableHead>Evento</DataTableHead>
                <DataTableHead>Total</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {events.length === 0 ? (
                <DataTableRow>
                  <DataTableCell colSpan={3} className="text-sm text-muted-foreground">
                    Sin eventos en el rango seleccionado.
                  </DataTableCell>
                </DataTableRow>
              ) : (
                events.map((row, idx) => (
                  <DataTableRow key={`${row.code}-${idx}`}>
                    <DataTableCell>{row.code}</DataTableCell>
                    <DataTableCell>{row.label}</DataTableCell>
                    <DataTableCell>{row.total}</DataTableCell>
                  </DataTableRow>
                ))
              )}
            </DataTableBody>
          </DataTable>
        </div>

        <div className="sts-card p-5 space-y-4">
          <h2 className="text-base font-semibold">Alarmas tipo 3</h2>
          <DataTable>
            <DataTableHeader>
              <DataTableRow>
                <DataTableHead>Código</DataTableHead>
                <DataTableHead>Alarma</DataTableHead>
                <DataTableHead>Nivel</DataTableHead>
                <DataTableHead>Total</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {alarms.length === 0 ? (
                <DataTableRow>
                  <DataTableCell colSpan={4} className="text-sm text-muted-foreground">
                    Sin alarmas en el rango seleccionado.
                  </DataTableCell>
                </DataTableRow>
              ) : (
                alarms.map((row, idx) => (
                  <DataTableRow key={`${row.code}-${row.levelCode}-${idx}`}>
                    <DataTableCell>{row.code}</DataTableCell>
                    <DataTableCell>{row.label}</DataTableCell>
                    <DataTableCell>
                      {row.levelCode} · {row.levelLabel}
                    </DataTableCell>
                    <DataTableCell>{row.total}</DataTableCell>
                  </DataTableRow>
                ))
              )}
            </DataTableBody>
          </DataTable>
        </div>
      </section>
    </div>
  );
}
