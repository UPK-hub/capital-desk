"use client";

import * as React from "react";
import Link from "next/link";
import { StsTicketChannel, StsTicketSeverity, StsTicketStatus } from "@prisma/client";
import { labelFromMap, stsChannelLabels, stsSeverityLabels, stsStatusLabels } from "@/lib/labels";

type ComponentRow = { id: string; name: string; code: string };
type TicketRow = {
  id: string;
  component: ComponentRow;
  severity: StsTicketSeverity;
  status: StsTicketStatus;
  channel: StsTicketChannel;
  openedAt: string;
  breachResponse: boolean;
  breachResolution: boolean;
};

function clsInput() {
  return "h-9 w-full rounded-md border px-2 text-sm";
}

export default function TicketsClient() {
  const [components, setComponents] = React.useState<ComponentRow[]>([]);
  const [tickets, setTickets] = React.useState<TicketRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);

  const [filterSeverity, setFilterSeverity] = React.useState("");
  const [filterStatus, setFilterStatus] = React.useState("");
  const [filterComponent, setFilterComponent] = React.useState("");
  const [filterBreach, setFilterBreach] = React.useState("");

  const [componentId, setComponentId] = React.useState("");
  const [severity, setSeverity] = React.useState<StsTicketSeverity>(StsTicketSeverity.MEDIUM);
  const [channel, setChannel] = React.useState<StsTicketChannel>(StsTicketChannel.EMAIL);
  const [description, setDescription] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    setMsg(null);

    const compsRes = await fetch("/api/sts/components", { cache: "no-store" });
    const compsData = await compsRes.json().catch(() => ({}));
    if (!compsRes.ok) {
      setLoading(false);
      setError(compsData?.error ?? "No se pudieron cargar componentes");
      return;
    }
    setComponents((compsData?.items ?? []) as ComponentRow[]);

    const qs = new URLSearchParams();
    if (filterSeverity) qs.set("severity", filterSeverity);
    if (filterStatus) qs.set("status", filterStatus);
    if (filterComponent) qs.set("componentId", filterComponent);
    if (filterBreach) qs.set("breach", filterBreach);

    const res = await fetch(`/api/sts/tickets?${qs.toString()}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data?.error ?? "No se pudieron cargar tickets");
      return;
    }
    setTickets((data?.items ?? []) as TicketRow[]);
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSeverity, filterStatus, filterComponent, filterBreach]);

  async function createTicket() {
    setSaving(true);
    setError(null);
    setMsg(null);

    const res = await fetch("/api/sts/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ componentId, severity, channel, description }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      setError(data?.error ?? "No se pudo crear ticket");
      return;
    }

    setComponentId("");
    setDescription("");
    setMsg("Ticket creado.");
    await load();
  }

  return (
    <div className="space-y-6">
      <section className="sts-card p-5 space-y-3 fade-up">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Nuevo ticket</h2>
            <p className="text-xs text-muted-foreground">Abre un incidente con prioridad y canal.</p>
          </div>
          <span className="sts-chip">SLA en vivo</span>
        </div>

        {error ? <div className="rounded-md border p-3 text-sm text-red-600">{error}</div> : null}
        {msg ? <div className="rounded-md border p-3 text-sm">{msg}</div> : null}

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs text-muted-foreground">Componente</label>
            <select className={clsInput()} value={componentId} onChange={(e) => setComponentId(e.target.value)}>
              <option value="">Selecciona</option>
              {components.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Prioridad</label>
            <select className={clsInput()} value={severity} onChange={(e) => setSeverity(e.target.value as any)}>
              <option value={StsTicketSeverity.EMERGENCY}>{stsSeverityLabels.EMERGENCY}</option>
              <option value={StsTicketSeverity.HIGH}>{stsSeverityLabels.HIGH}</option>
              <option value={StsTicketSeverity.MEDIUM}>{stsSeverityLabels.MEDIUM}</option>
              <option value={StsTicketSeverity.LOW}>{stsSeverityLabels.LOW}</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Canal</label>
            <select className={clsInput()} value={channel} onChange={(e) => setChannel(e.target.value as any)}>
              <option value={StsTicketChannel.PHONE}>{stsChannelLabels.PHONE}</option>
              <option value={StsTicketChannel.EMAIL}>{stsChannelLabels.EMAIL}</option>
              <option value={StsTicketChannel.CHAT}>{stsChannelLabels.CHAT}</option>
              <option value={StsTicketChannel.OTHER}>{stsChannelLabels.OTHER}</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-muted-foreground">Descripcion</label>
            <textarea
              className="min-h-24 w-full rounded-md border px-3 py-2 text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <button
          type="button"
          className="sts-btn-primary"
          disabled={saving || !componentId || description.trim().length < 5}
          onClick={createTicket}
        >
          {saving ? "Creando..." : "Crear ticket"}
        </button>
      </section>

      <section className="sts-card p-5 space-y-3 fade-up">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Tickets</h2>
            <p className="text-xs text-muted-foreground">Filtra por prioridad, estado o breach.</p>
          </div>
          <button className="sts-btn-ghost" onClick={load} disabled={loading}>
            {loading ? "Cargando..." : "Refrescar"}
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <select className={clsInput()} value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)}>
            <option value="">Prioridad</option>
            <option value={StsTicketSeverity.EMERGENCY}>{stsSeverityLabels.EMERGENCY}</option>
            <option value={StsTicketSeverity.HIGH}>{stsSeverityLabels.HIGH}</option>
            <option value={StsTicketSeverity.MEDIUM}>{stsSeverityLabels.MEDIUM}</option>
            <option value={StsTicketSeverity.LOW}>{stsSeverityLabels.LOW}</option>
          </select>
          <select className={clsInput()} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">Estado</option>
            <option value={StsTicketStatus.OPEN}>{stsStatusLabels.OPEN}</option>
            <option value={StsTicketStatus.IN_PROGRESS}>{stsStatusLabels.IN_PROGRESS}</option>
            <option value={StsTicketStatus.WAITING_VENDOR}>{stsStatusLabels.WAITING_VENDOR}</option>
            <option value={StsTicketStatus.RESOLVED}>{stsStatusLabels.RESOLVED}</option>
            <option value={StsTicketStatus.CLOSED}>{stsStatusLabels.CLOSED}</option>
          </select>
          <select className={clsInput()} value={filterComponent} onChange={(e) => setFilterComponent(e.target.value)}>
            <option value="">Componente</option>
            {components.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select className={clsInput()} value={filterBreach} onChange={(e) => setFilterBreach(e.target.value)}>
            <option value="">Breaches</option>
            <option value="response">Respuesta</option>
            <option value="resolution">Resolucion</option>
          </select>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : tickets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay tickets.</p>
        ) : (
          <div className="overflow-auto sts-card">
            <table className="sts-table">
              <thead>
                <tr>
                  <th>Componente</th>
                  <th>Prioridad</th>
                  <th>Estado</th>
                  <th>Canal</th>
                  <th>Apertura</th>
                  <th>Breaches</th>
                  <th>Accion</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id}>
                    <td>{t.component.name}</td>
                    <td>{labelFromMap(t.severity, stsSeverityLabels)}</td>
                    <td>
                      <span className="sts-chip">{labelFromMap(t.status, stsStatusLabels)}</span>
                    </td>
                    <td>{labelFromMap(t.channel, stsChannelLabels)}</td>
                    <td>{new Date(t.openedAt).toLocaleString("es-CO")}</td>
                    <td>
                      {t.breachResponse ? "Resp" : ""} {t.breachResolution ? "Res" : ""}
                    </td>
                    <td>
                      <Link className="underline" href={`/sts/tickets/${t.id}`}>
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
