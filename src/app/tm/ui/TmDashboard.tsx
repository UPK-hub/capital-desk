"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BusCombobox } from "@/components/BusCombobox";
import { StsKpiMetric } from "@prisma/client";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/ui/data-table";
import { StatusPill } from "@/components/ui/status-pill";
import { PriorityBadge } from "@/components/ui/PriorityBadge";

type MetricRow = {
  metric: StsKpiMetric;
  average: number;
  total: number;
  okCount: number;
  compliance: number;
};

type ComponentRow = {
  component: string;
  severity: string;
  total: number;
  response: number;
  resolution: number;
  responseBreaches: number;
  resolutionBreaches: number;
};

type KpiRow = {
  component: string;
  metric: StsKpiMetric;
  periodicity: string;
  periodStart: string;
  value: number;
  threshold: number | null;
  ok: boolean | null;
};

type Totals = {
  totalTickets: number;
  openTickets: number;
  closedTickets: number;
  responseCompliance: number;
  resolutionCompliance: number;
  responseBreaches: number;
  resolutionBreaches: number;
  avgResponseMinutes: number;
  avgResolutionMinutes: number;
};

type Props = {
  range: { start: string; end: string; rangeDays: number };
  totals: Totals;
  severityLabels: string[];
  severityCounts: number[];
  componentSeverityRows: ComponentRow[];
  metricSummary: MetricRow[];
  kpiRows: KpiRow[];
  selectedBus: { id: string; code: string; plate: string | null } | null;
};

const metricLabels: Record<StsKpiMetric, string> = {
  SUPPORT_RESPONSE: "Respuesta soporte",
  AVAILABILITY: "Disponibilidad",
  PREVENTIVE_MAINTENANCE: "Mantenimiento preventivo",
  TRANSMISSION: "Transmisión",
  DATA_CAPTURE: "Captura de datos",
  RECORDING: "Grabación",
  IMAGE_QUALITY_RECORDED: "Calidad imagen grabada",
  IMAGE_QUALITY_TRANSMITTED: "Calidad imagen transmitida",
  PANIC_ALARM_GENERATION: "Alarmas pánico",
};

function severityToPriority(severity: string) {
  const s = String(severity ?? "").toUpperCase();
  if (s.includes("EMERGENCY") || s.includes("EMERGENCIA")) return 1;
  if (s.includes("HIGH") || s.includes("ALTA")) return 2;
  if (s.includes("MEDIUM") || s.includes("MEDIA")) return 3;
  if (s.includes("LOW") || s.includes("BAJA")) return 5;
  return 4;
}

export default function TmDashboard({
  range,
  totals,
  severityLabels,
  severityCounts,
  componentSeverityRows,
  metricSummary,
  kpiRows,
  selectedBus,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [start, setStart] = React.useState(range.start);
  const [end, setEnd] = React.useState(range.end);
  const [bus, setBus] = React.useState<{ id: string; code: string; plate: string | null } | null>(
    null
  );

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

  const exportHref = `/api/tm/export?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${
    bus?.id ? `&busId=${encodeURIComponent(bus.id)}` : ""
  }`;

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
          <h1 className="text-3xl font-semibold tracking-tight">Transmilenio · Panel TM</h1>
          <p className="text-sm text-muted-foreground">Métricas de SLA, KPIs y cumplimiento de servicio.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[220px]">
            <BusCombobox value={bus} onChange={applyBus} />
          </div>
          <button className="sts-btn-ghost text-sm" onClick={() => applyRange(7)}>7 días</button>
          <button className="sts-btn-ghost text-sm" onClick={() => applyRange(30)}>30 días</button>
          <button className="sts-btn-ghost text-sm" onClick={() => applyRange(90)}>90 días</button>
          <div className="flex items-center gap-2 rounded-full border px-2 py-1">
            <input type="date" className="bg-transparent text-xs" value={start} onChange={(e) => setStart(e.target.value)} />
            <span className="text-xs text-muted-foreground">→</span>
            <input type="date" className="bg-transparent text-xs" value={end} onChange={(e) => setEnd(e.target.value)} />
            <button className="sts-btn-soft text-xs" onClick={applyCustom}>Aplicar</button>
          </div>
          <Link className="sts-btn-primary text-sm" href={exportHref}>Exportar Excel</Link>
        </div>
      </div>

      {bus ? (
        <div className="sts-card p-3">
          <p className="text-xs text-muted-foreground">
            Filtro aplicado: <span className="font-medium">{bus.code}</span>
            {bus.plate ? ` · ${bus.plate}` : ""}
          </p>
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="sts-card sts-card--interactive p-4">
          <p className="text-xs text-muted-foreground">Tickets totales</p>
          <p className="mt-2 text-2xl font-semibold">{totals.totalTickets}</p>
          <p className="text-xs text-muted-foreground">Abiertos: {totals.openTickets} · Cerrados: {totals.closedTickets}</p>
        </div>
        <div className="sts-card sts-card--interactive p-4">
          <p className="text-xs text-muted-foreground">SLA Respuesta</p>
          <p className="mt-2 text-2xl font-semibold">{totals.responseCompliance}%</p>
          <p className="text-xs text-muted-foreground">Breaches: {totals.responseBreaches}</p>
        </div>
        <div className="sts-card sts-card--interactive p-4">
          <p className="text-xs text-muted-foreground">SLA Resolución</p>
          <p className="mt-2 text-2xl font-semibold">{totals.resolutionCompliance}%</p>
          <p className="text-xs text-muted-foreground">Breaches: {totals.resolutionBreaches}</p>
        </div>
        <div className="sts-card sts-card--interactive p-4">
          <p className="text-xs text-muted-foreground">Tiempos promedio</p>
          <p className="mt-2 text-sm">Respuesta: {totals.avgResponseMinutes} min</p>
          <p className="text-sm">Resolución: {totals.avgResolutionMinutes} min</p>
        </div>
      </section>

      <section className="sts-card p-5 space-y-4">
        <h2 className="text-base font-semibold">Distribución por prioridad</h2>
        <div className="grid gap-3 md:grid-cols-4">
          {severityLabels.map((label, idx) => (
            <div key={label} className="sts-card sts-card--interactive p-3">
              <div className="mb-2">
                <PriorityBadge priority={severityToPriority(label)} />
              </div>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-semibold">{severityCounts[idx]}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="sts-card p-5 space-y-4">
        <h2 className="text-base font-semibold">KPIs por métrica</h2>
        {bus ? (
          <p className="text-xs text-muted-foreground">
            KPIs calculados por componente (no por bus). El filtro de bus aplica solo a tickets/SLA.
          </p>
        ) : null}
        <div className="grid gap-4 md:grid-cols-3">
          {metricSummary.map((m) => (
            <div key={m.metric} className="sts-card sts-card--interactive p-4">
              <p className="text-xs text-muted-foreground">{metricLabels[m.metric]}</p>
              <p className="mt-2 text-xl font-semibold">{m.average}%</p>
              <p className="text-xs text-muted-foreground">Cumplimiento: {m.compliance}%</p>
            </div>
          ))}
        </div>
      </section>

      <section className="sts-card p-5 space-y-4">
        <h2 className="text-base font-semibold">SLA por componente y prioridad</h2>
        <DataTable>
          <DataTableHeader>
            <DataTableRow>
              <DataTableHead>Componente</DataTableHead>
              <DataTableHead>Prioridad</DataTableHead>
              <DataTableHead>Total</DataTableHead>
              <DataTableHead>Respuesta %</DataTableHead>
              <DataTableHead>Resolución %</DataTableHead>
              <DataTableHead>Breaches resp</DataTableHead>
              <DataTableHead>Breaches res</DataTableHead>
            </DataTableRow>
          </DataTableHeader>
          <DataTableBody>
            {componentSeverityRows.map((row, idx) => (
              <DataTableRow key={`${row.component}-${row.severity}-${idx}`}>
                <DataTableCell>{row.component}</DataTableCell>
                <DataTableCell>
                  <PriorityBadge priority={severityToPriority(row.severity)} />
                </DataTableCell>
                <DataTableCell>{row.total}</DataTableCell>
                <DataTableCell>{row.response}%</DataTableCell>
                <DataTableCell>{row.resolution}%</DataTableCell>
                <DataTableCell>{row.responseBreaches}</DataTableCell>
                <DataTableCell>{row.resolutionBreaches}</DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      </section>

      <section className="sts-card p-5 space-y-4">
        <h2 className="text-base font-semibold">Detalle KPIs (por componente)</h2>
        <DataTable>
          <DataTableHeader>
            <DataTableRow>
              <DataTableHead>Componente</DataTableHead>
              <DataTableHead>Métrica</DataTableHead>
              <DataTableHead>Periodicidad</DataTableHead>
              <DataTableHead>Periodo</DataTableHead>
              <DataTableHead>Valor</DataTableHead>
              <DataTableHead>Umbral</DataTableHead>
              <DataTableHead>Cumple</DataTableHead>
            </DataTableRow>
          </DataTableHeader>
          <DataTableBody>
            {kpiRows.map((row, idx) => (
              <DataTableRow key={`${row.component}-${row.metric}-${idx}`}>
                <DataTableCell>{row.component}</DataTableCell>
                <DataTableCell>{metricLabels[row.metric]}</DataTableCell>
                <DataTableCell>{row.periodicity}</DataTableCell>
                <DataTableCell>{row.periodStart}</DataTableCell>
                <DataTableCell>{row.value}</DataTableCell>
                <DataTableCell>{row.threshold ?? "—"}</DataTableCell>
                <DataTableCell>
                  {row.ok === null ? (
                    "—"
                  ) : row.ok ? (
                    <StatusPill status="activo" label="Sí" />
                  ) : (
                    <StatusPill status="cancelado" label="No" />
                  )}
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      </section>
    </div>
  );
}
