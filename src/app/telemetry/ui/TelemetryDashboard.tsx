"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  Bus,
  CheckCircle2,
  Clock3,
  Radio,
  Timer,
  WifiOff,
} from "lucide-react";
import { BusCombobox } from "@/components/BusCombobox";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/ui/data-table";
import { EVENT_CATALOG, ALARM_CATALOG, codeNumber } from "@/lib/telemetry/catalog";
import TramaQualityPanel from "./TramaQualityPanel";
import TelemetrySeriesPanel from "./TelemetrySeriesPanel";
import OdometerPanel from "./OdometerPanel";
import CoordinatesPanel from "./CoordinatesPanel";
import TelemetryBusBreakdown, { type BusBreakdownRow } from "./TelemetryBusBreakdown";
import TelemetryTypeBreakdown from "./TelemetryTypeBreakdown";

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

export type ReportStatus = {
  total: number;
  reportedToday: number;
  silent: number;
  silentBuses: Array<{ code: string; plate: string | null; lastSeenAt: string | null }>;
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
  reportStatus: ReportStatus;
  busBreakdown: BusBreakdownRow[];
};

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-CO");
}

function nfmt(n: number) {
  return new Intl.NumberFormat("es-CO").format(n ?? 0);
}

function Kpi({
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

export default function TelemetryDashboard({
  range,
  selectedBus,
  generalTotals,
  busTotals,
  points,
  busCounts,
  events,
  alarms,
  reportStatus,
  busBreakdown,
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

  const [tab, setTab] = React.useState<
    "resumen" | "eventos" | "alarmas" | "periodicas" | "calidad" | "odometro" | "coordenadas"
  >("resumen");

  const eventsByNumber = React.useMemo(() => {
    const totals = new Map<number, number>();
    for (const r of events) {
      const n = codeNumber(r.code);
      if (n != null) totals.set(n, (totals.get(n) ?? 0) + r.total);
    }
    return EVENT_CATALOG.map((c) => ({ ...c, total: totals.get(c.n) ?? 0 }));
  }, [events]);
  const eventsTotal = eventsByNumber.reduce((a, b) => a + b.total, 0);

  const alarmsByNumber = React.useMemo(() => {
    const totals = new Map<number, number>();
    const byLevel = new Map<number, Map<string, number>>();
    for (const r of alarms) {
      const n = codeNumber(r.code);
      if (n == null) continue;
      totals.set(n, (totals.get(n) ?? 0) + r.total);
      const lvl = (r.levelCode || "").toUpperCase();
      if (!byLevel.has(n)) byLevel.set(n, new Map());
      const m = byLevel.get(n)!;
      m.set(lvl, (m.get(lvl) ?? 0) + r.total);
    }
    return ALARM_CATALOG.map((c) => ({
      ...c,
      total: totals.get(c.n) ?? 0,
      levels: byLevel.get(c.n) ?? new Map<string, number>(),
    }));
  }, [alarms]);
  const alarmsTotal = alarmsByNumber.reduce((a, b) => a + b.total, 0);

  const alarmsByLevel = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const a of alarmsByNumber) {
      for (const [k, v] of a.levels.entries()) m.set(k, (m.get(k) ?? 0) + v);
    }
    return m;
  }, [alarmsByNumber]);

  const busDisplay = selectedBus
    ? `${selectedBus.code}${selectedBus.plate ? ` · ${selectedBus.plate}` : ""}`
    : null;

  const activeTotals = busTotals ?? generalTotals;
  const eventoOptions = EVENT_CATALOG.map((c) => ({ value: c.code, label: `${c.code} · ${c.label}` }));
  const alarmaOptions = ALARM_CATALOG.map((c) => ({ value: c.code, label: `${c.code} · ${c.label}` }));
  const periodicaOptions = [
    { value: "P20", label: "P20 · periódica cada 20 s" },
    { value: "P60", label: "P60 · periódica cada 60 s" },
  ];
  const ALARM_LEVEL_META = [
    { code: "N1", label: "N1 · Crítico superior", color: "#b91c1c" },
    { code: "N2", label: "N2 · Tolerable superior", color: "#ea580c" },
    { code: "N3", label: "N3 · Normal", color: "#94a3b8" },
    { code: "N4", label: "N4 · Tolerable inferior", color: "#d97706" },
    { code: "N5", label: "N5 · Crítico inferior", color: "#2563eb" },
  ];
  const alarmsDonut = ALARM_LEVEL_META.map((l) => ({
    name: l.label,
    value: alarmsByLevel.get(l.code) ?? 0,
    color: l.color,
  })).filter((d) => d.value > 0);
  const periodicasDonut = [
    { name: "P20 (cada 20 s)", value: activeTotals.p20, color: "#2563eb" },
    { name: "P60 (cada 60 s)", value: activeTotals.p60, color: "#0891b2" },
  ].filter((d) => d.value > 0);

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

      <div className="flex flex-wrap items-center gap-1 border-b border-border/60">
        {(
          [
            ["resumen", "Resumen"],
            ["eventos", "Eventos"],
            ["alarmas", "Alarmas"],
            ["periodicas", "Periódicas"],
            ["calidad", "Calidad de tramas"],
            ["odometro", "Odómetro"],
            ["coordenadas", "Coordenadas"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === key
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "resumen" ? (
        <div className="space-y-6">
      {/* Estado de reporte HOY (flota completa) */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Estado de reporte hoy</h2>
          <span className="text-xs text-muted-foreground">Flota: {nfmt(reportStatus.total)} buses</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Kpi
            label="Reportando hoy"
            value={reportStatus.reportedToday}
            color="#15803d"
            Icon={CheckCircle2}
            sub={`${reportStatus.total ? Math.round((reportStatus.reportedToday / reportStatus.total) * 100) : 0}% de la flota`}
          />
          <Kpi
            label="Sin reportar hoy"
            value={reportStatus.silent}
            color="#b91c1c"
            Icon={WifiOff}
            sub="No han enviado tramas hoy"
          />
          <Kpi label="Flota total" value={reportStatus.total} color="#334155" Icon={Bus} />
        </div>
        {reportStatus.silent > 0 ? (
          <div className="sts-card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-red-700">
              Buses sin reportar hoy ({nfmt(reportStatus.silent)})
            </h3>
            <div className="max-h-72 overflow-auto">
              <DataTable>
                <DataTableHeader>
                  <DataTableRow>
                    <DataTableHead>Bus</DataTableHead>
                    <DataTableHead>Placa</DataTableHead>
                    <DataTableHead>Última trama</DataTableHead>
                  </DataTableRow>
                </DataTableHeader>
                <DataTableBody>
                  {reportStatus.silentBuses.map((b) => (
                    <DataTableRow key={b.code}>
                      <DataTableCell className="font-medium">{b.code}</DataTableCell>
                      <DataTableCell>{b.plate ?? "—"}</DataTableCell>
                      <DataTableCell>{formatDateTime(b.lastSeenAt)}</DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
            </div>
          </div>
        ) : (
          <div className="sts-card p-4 text-sm font-medium text-green-700">
            Todos los buses de la flota han reportado hoy.
          </div>
        )}
      </section>

      {/* Tramas en el rango */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Tramas en el rango</h2>
          <span className="text-xs text-muted-foreground">
            {range.start} → {range.end}
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Kpi label="Total tramas" value={generalTotals.total} color="#1e293b" Icon={Activity} />
          <Kpi label="Periódica P20" value={generalTotals.p20} color="#2563eb" Icon={Timer} sub="cada 20 s" />
          <Kpi label="Periódica P60" value={generalTotals.p60} color="#0891b2" Icon={Clock3} sub="cada 60 s" />
          <Kpi label="Eventos" value={generalTotals.eventos} color="#b45309" Icon={Radio} />
          <Kpi label="Alarmas" value={generalTotals.alarmas} color="#b91c1c" Icon={AlertTriangle} />
        </div>
      </section>

      {busTotals ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">
            Resumen del bus {selectedBus?.code ? `· ${selectedBus.code}` : "seleccionado"}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Kpi label="Total tramas" value={busTotals.total} color="#1e293b" Icon={Activity} />
            <Kpi label="Periódica P20" value={busTotals.p20} color="#2563eb" Icon={Timer} sub="cada 20 s" />
            <Kpi label="Periódica P60" value={busTotals.p60} color="#0891b2" Icon={Clock3} sub="cada 60 s" />
            <Kpi label="Eventos" value={busTotals.eventos} color="#b45309" Icon={Radio} />
            <Kpi label="Alarmas" value={busTotals.alarmas} color="#b91c1c" Icon={AlertTriangle} />
          </div>
        </section>
      ) : null}

      <TelemetryBusBreakdown rows={busBreakdown} busLabel={busDisplay} />

      <TelemetryTypeBreakdown
        events={events}
        alarms={alarms}
        periodicas={[
          { code: "P20", label: "Periódica cada 20 s", total: activeTotals.p20 },
          { code: "P60", label: "Periódica cada 60 s", total: activeTotals.p60 },
        ]}
        busLabel={busDisplay}
        start={range.start}
        end={range.end}
        busId={selectedBus?.id ?? null}
      />

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

        </div>
      ) : null}

      {tab === "eventos" ? (
        <TelemetrySeriesPanel
          type="eventos"
          noun="eventos"
          start={range.start}
          end={range.end}
          busId={selectedBus?.id ?? null}
          busLabel={busDisplay}
          filterOptions={eventoOptions}
          breakdown={eventsByNumber}
          breakdownTitle="Por número (EV1–EV18)"
        />
      ) : null}

      {tab === "alarmas" ? (
        <TelemetrySeriesPanel
          type="alarmas"
          noun="alarmas"
          start={range.start}
          end={range.end}
          busId={selectedBus?.id ?? null}
          busLabel={busDisplay}
          filterOptions={alarmaOptions}
          breakdown={alarmsByNumber}
          breakdownTitle="Por número (ALA1–ALA7)"
          donut={alarmsDonut}
          donutTitle="Distribución por nivel (N1–N5)"
        />
      ) : null}

      {tab === "periodicas" ? (
        <TelemetrySeriesPanel
          type="periodicas"
          noun="tramas periódicas"
          start={range.start}
          end={range.end}
          busId={selectedBus?.id ?? null}
          busLabel={busDisplay}
          filterOptions={periodicaOptions}
          donut={periodicasDonut}
          donutTitle="P20 vs P60"
        />
      ) : null}

      {tab === "calidad" ? (
        <TramaQualityPanel
          start={range.start}
          end={range.end}
          busId={selectedBus?.id ?? null}
          busLabel={busDisplay}
        />
      ) : null}

      {tab === "odometro" ? <OdometerPanel /> : null}

      {tab === "coordenadas" ? <CoordinatesPanel /> : null}
    </div>
  );
}
