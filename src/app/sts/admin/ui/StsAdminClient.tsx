"use client";

import * as React from "react";
import {
  StsKpiMetric,
  StsKpiPeriodicity,
  StsTicketSeverity,
  StsTicketStatus,
} from "@prisma/client";
import { labelFromMap, stsMetricLabels, stsSeverityLabels, stsStatusLabels } from "@/lib/labels";

type ComponentRow = { id: string; code: string; name: string; active: boolean };
type SlaRow = {
  id: string;
  componentId: string;
  severity: StsTicketSeverity;
  responseMinutes: number;
  resolutionMinutes: number;
  pauseStatuses: StsTicketStatus[];
};
type KpiRow = {
  id: string;
  componentId: string;
  metric: StsKpiMetric;
  periodicity: StsKpiPeriodicity;
  threshold: number;
};
type MaintRow = {
  id: string;
  componentId?: string | null;
  startAt: string;
  endAt: string;
  reason?: string | null;
};

function clsInput() {
  return "h-9 w-full rounded-md border px-2 text-sm";
}

export default function StsAdminClient() {
  const [components, setComponents] = React.useState<ComponentRow[]>([]);
  const [slaPolicies, setSlaPolicies] = React.useState<SlaRow[]>([]);
  const [kpiPolicies, setKpiPolicies] = React.useState<KpiRow[]>([]);
  const [maintenance, setMaintenance] = React.useState<MaintRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);

  const [compCode, setCompCode] = React.useState("");
  const [compName, setCompName] = React.useState("");

  const [mwComponentId, setMwComponentId] = React.useState("");
  const [mwStart, setMwStart] = React.useState("");
  const [mwEnd, setMwEnd] = React.useState("");
  const [mwReason, setMwReason] = React.useState("");

  async function load() {
    setLoading(true);
    setError(null);
    setMsg(null);

    const [compsRes, slaRes, kpiRes, mwRes] = await Promise.all([
      fetch("/api/sts/components", { cache: "no-store" }),
      fetch("/api/sts/sla-policies", { cache: "no-store" }),
      fetch("/api/sts/kpi-policies", { cache: "no-store" }),
      fetch("/api/sts/maintenance-windows", { cache: "no-store" }),
    ]);

    const [compsData, slaData, kpiData, mwData] = await Promise.all([
      compsRes.json().catch(() => ({})),
      slaRes.json().catch(() => ({})),
      kpiRes.json().catch(() => ({})),
      mwRes.json().catch(() => ({})),
    ]);

    setLoading(false);

    if (!compsRes.ok) {
      setError(compsData?.error ?? "No se pudieron cargar componentes");
      return;
    }

    setComponents((compsData?.items ?? []) as ComponentRow[]);
    setSlaPolicies((slaData?.items ?? []) as SlaRow[]);
    setKpiPolicies((kpiData?.items ?? []) as KpiRow[]);
    setMaintenance((mwData?.items ?? []) as MaintRow[]);
  }

  React.useEffect(() => {
    load();
  }, []);

  async function createComponent() {
    setSaving(true);
    setError(null);
    setMsg(null);

    const res = await fetch("/api/sts/components", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: compCode, name: compName }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      setError(data?.error ?? "No se pudo crear componente");
      return;
    }

    setCompCode("");
    setCompName("");
    setMsg("Componente creado.");
    await load();
  }

  async function saveSlaPolicies() {
    setSaving(true);
    setError(null);
    setMsg(null);

    const res = await fetch("/api/sts/sla-policies", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slaPolicies),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      setError(data?.error ?? "No se pudieron guardar SLA");
      return;
    }

    setMsg("SLA actualizado.");
  }

  async function saveKpiPolicies() {
    setSaving(true);
    setError(null);
    setMsg(null);

    const res = await fetch("/api/sts/kpi-policies", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(kpiPolicies),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      setError(data?.error ?? "No se pudieron guardar KPIs");
      return;
    }

    setMsg("KPIs actualizados.");
  }

  async function createMaintenance() {
    setSaving(true);
    setError(null);
    setMsg(null);

    const res = await fetch("/api/sts/maintenance-windows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        componentId: mwComponentId || null,
        startAt: mwStart,
        endAt: mwEnd,
        reason: mwReason || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      setError(data?.error ?? "No se pudo crear ventana");
      return;
    }

    setMwComponentId("");
    setMwStart("");
    setMwEnd("");
    setMwReason("");
    setMsg("Ventana creada.");
    await load();
  }

  const severityLabels = [
    StsTicketSeverity.EMERGENCY,
    StsTicketSeverity.HIGH,
    StsTicketSeverity.MEDIUM,
    StsTicketSeverity.LOW,
  ];

  const pauseOptions = [StsTicketStatus.WAITING_VENDOR, StsTicketStatus.IN_PROGRESS];

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-md border p-3 text-sm text-red-600">{error}</div> : null}
      {msg ? <div className="rounded-md border p-3 text-sm">{msg}</div> : null}

      <section className="sts-card p-5 space-y-3 fade-up">
        <h2 className="text-sm font-semibold">Componentes STS</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <input className={clsInput()} placeholder="Codigo" value={compCode} onChange={(e) => setCompCode(e.target.value)} />
          <input className={clsInput()} placeholder="Nombre" value={compName} onChange={(e) => setCompName(e.target.value)} />
          <button
            className="sts-btn-primary"
            onClick={createComponent}
            disabled={saving || compCode.trim().length < 2 || compName.trim().length < 2}
          >
            Crear
          </button>
        </div>

        <div className="overflow-auto sts-card">
          <table className="sts-table">
            <thead className="bg-zinc-50">
              <tr>
                <th className="text-left p-2">Codigo</th>
                <th className="text-left p-2">Nombre</th>
                <th className="text-left p-2">Activo</th>
              </tr>
            </thead>
            <tbody>
              {components.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="p-2">{c.code}</td>
                  <td className="p-2">{c.name}</td>
                  <td className="p-2">{c.active ? "Si" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="sts-card p-5 space-y-3 fade-up">
        <h2 className="text-sm font-semibold">Matriz SLA</h2>
        <div className="overflow-auto sts-card">
          <table className="sts-table">
            <thead className="bg-zinc-50">
              <tr>
                <th className="text-left p-2">Componente</th>
                <th className="text-left p-2">Prioridad</th>
                <th className="text-left p-2">Respuesta (min)</th>
                <th className="text-left p-2">Resolucion (min)</th>
                <th className="text-left p-2">Pausas</th>
              </tr>
            </thead>
            <tbody>
              {slaPolicies.map((p, idx) => (
                <tr key={p.id} className="border-t">
                  <td className="p-2">{components.find((c) => c.id === p.componentId)?.name ?? p.componentId}</td>
                  <td className="p-2">{labelFromMap(p.severity, stsSeverityLabels)}</td>
                  <td className="p-2">
                    <input
                      className={clsInput()}
                      type="number"
                      value={p.responseMinutes}
                      onChange={(e) =>
                        setSlaPolicies((prev) =>
                          prev.map((r, i) =>
                            i === idx ? { ...r, responseMinutes: Number(e.target.value) } : r
                          )
                        )
                      }
                    />
                  </td>
                  <td className="p-2">
                    <input
                      className={clsInput()}
                      type="number"
                      value={p.resolutionMinutes}
                      onChange={(e) =>
                        setSlaPolicies((prev) =>
                          prev.map((r, i) =>
                            i === idx ? { ...r, resolutionMinutes: Number(e.target.value) } : r
                          )
                        )
                      }
                    />
                  </td>
                  <td className="p-2">
                    <select
                      multiple
                      className="min-h-20 w-full rounded-md border px-2 py-1 text-xs"
                      value={p.pauseStatuses ?? [StsTicketStatus.WAITING_VENDOR]}
                      onChange={(e) => {
                        const selected = Array.from(e.target.selectedOptions).map((o) => o.value as StsTicketStatus);
                        setSlaPolicies((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, pauseStatuses: selected } : r))
                        );
                      }}
                    >
                      {pauseOptions.map((s) => (
                        <option key={s} value={s}>
                          {labelFromMap(s, stsStatusLabels)}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
              {severityLabels.length === 0 ? (
                <tr>
                  <td className="p-2 text-sm text-muted-foreground" colSpan={5}>
                    No hay politicas cargadas.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <button
          className="sts-btn-primary"
          onClick={saveSlaPolicies}
          disabled={saving}
        >
          Guardar SLA
        </button>
      </section>

      <section className="sts-card p-5 space-y-3 fade-up">
        <h2 className="text-sm font-semibold">KPIs por componente</h2>
        <div className="overflow-auto sts-card">
          <table className="sts-table">
            <thead className="bg-zinc-50">
              <tr>
                <th className="text-left p-2">Componente</th>
                <th className="text-left p-2">KPI</th>
                <th className="text-left p-2">Periodicidad</th>
                <th className="text-left p-2">Umbral (%)</th>
              </tr>
            </thead>
            <tbody>
              {kpiPolicies.map((p, idx) => (
                <tr key={p.id} className="border-t">
                  <td className="p-2">{components.find((c) => c.id === p.componentId)?.name ?? p.componentId}</td>
                  <td className="p-2">{labelFromMap(p.metric, stsMetricLabels)}</td>
                  <td className="p-2">{p.periodicity}</td>
                  <td className="p-2">
                    <input
                      className={clsInput()}
                      type="number"
                      value={p.threshold}
                      onChange={(e) =>
                        setKpiPolicies((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, threshold: Number(e.target.value) } : r))
                        )
                      }
                    />
                  </td>
                </tr>
              ))}
              {kpiPolicies.length === 0 ? (
                <tr>
                  <td className="p-2 text-sm text-muted-foreground" colSpan={4}>
                    No hay politicas KPI.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <button
          className="sts-btn-primary"
          onClick={saveKpiPolicies}
          disabled={saving}
        >
          Guardar KPIs
        </button>
      </section>

      <section className="sts-card p-5 space-y-3 fade-up">
        <h2 className="text-sm font-semibold">Ventanas de mantenimiento</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <select className={clsInput()} value={mwComponentId} onChange={(e) => setMwComponentId(e.target.value)}>
            <option value="">Todos los componentes</option>
            {components.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input className={clsInput()} type="datetime-local" value={mwStart} onChange={(e) => setMwStart(e.target.value)} />
          <input className={clsInput()} type="datetime-local" value={mwEnd} onChange={(e) => setMwEnd(e.target.value)} />
          <input className={clsInput()} placeholder="Motivo" value={mwReason} onChange={(e) => setMwReason(e.target.value)} />
        </div>
        <button
          className="sts-btn-ghost"
          onClick={createMaintenance}
          disabled={saving || !mwStart || !mwEnd}
        >
          Crear ventana
        </button>

        <div className="overflow-auto sts-card">
          <table className="sts-table">
            <thead className="bg-zinc-50">
              <tr>
                <th className="text-left p-2">Componente</th>
                <th className="text-left p-2">Inicio</th>
                <th className="text-left p-2">Fin</th>
                <th className="text-left p-2">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {maintenance.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="p-2">{components.find((c) => c.id === m.componentId)?.name ?? "Todos"}</td>
                  <td className="p-2">{new Date(m.startAt).toLocaleString("es-CO")}</td>
                  <td className="p-2">{new Date(m.endAt).toLocaleString("es-CO")}</td>
                  <td className="p-2">{m.reason ?? "-"}</td>
                </tr>
              ))}
              {maintenance.length === 0 ? (
                <tr>
                  <td className="p-2 text-sm text-muted-foreground" colSpan={4}>
                    No hay ventanas registradas.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
