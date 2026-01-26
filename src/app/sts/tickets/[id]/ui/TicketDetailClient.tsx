"use client";

import * as React from "react";
import { StsTicketStatus } from "@prisma/client";

type UserRow = { id: string; name: string; email: string; role: string };
type Ticket = {
  id: string;
  description: string;
  status: StsTicketStatus;
  severity: string;
  channel: string;
  openedAt: string;
  firstResponseAt?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  breachResponse: boolean;
  breachResolution: boolean;
  component: { name: string };
  assignedToId?: string | null;
  assignedTo?: { id: string; name: string } | null;
  caseId?: string | null;
  events: { id: string; type: string; status?: string | null; message?: string | null; createdAt: string }[];
};

type SlaInfo = {
  responseMinutes: number | null;
  resolutionMinutes: number | null;
  breachResponse: boolean;
  breachResolution: boolean;
  responseProgress: number | null;
  resolutionProgress: number | null;
};

export default function TicketDetailClient({ ticketId }: { ticketId: string }) {
  const [ticket, setTicket] = React.useState<Ticket | null>(null);
  const [sla, setSla] = React.useState<SlaInfo | null>(null);
  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [status, setStatus] = React.useState<StsTicketStatus>(StsTicketStatus.OPEN);
  const [assignedToId, setAssignedToId] = React.useState<string>("");
  const [comment, setComment] = React.useState("");
  const [isResponse, setIsResponse] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    setMsg(null);

    const [ticketRes, usersRes] = await Promise.all([
      fetch(`/api/sts/tickets/${ticketId}`, { cache: "no-store" }),
      fetch("/api/sts/users", { cache: "no-store" }),
    ]);

    const ticketData = await ticketRes.json().catch(() => ({}));
    const usersData = await usersRes.json().catch(() => ({}));
    setLoading(false);

    if (!ticketRes.ok) {
      setError(ticketData?.error ?? "No se pudo cargar ticket");
      return;
    }

    setTicket(ticketData.ticket as Ticket);
    setSla(ticketData.sla as SlaInfo);
    setStatus((ticketData.ticket?.status ?? StsTicketStatus.OPEN) as StsTicketStatus);
    setAssignedToId(ticketData.ticket?.assignedToId ?? "");
    setUsers((usersData?.items ?? []) as UserRow[]);
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveChanges() {
    if (!ticket) return;
    setSaving(true);
    setError(null);
    setMsg(null);

    const res = await fetch(`/api/sts/tickets/${ticket.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, assignedToId: assignedToId || null }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      setError(data?.error ?? "No se pudo guardar");
      return;
    }

    setMsg("Cambios guardados.");
    await load();
  }

  async function addComment() {
    if (!ticket) return;
    setSaving(true);
    setError(null);
    setMsg(null);

    const res = await fetch(`/api/sts/tickets/${ticket.id}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: comment, isResponse }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      setError(data?.error ?? "No se pudo registrar comentario");
      return;
    }

    setComment("");
    setIsResponse(false);
    setMsg("Comentario registrado.");
    await load();
  }

  if (loading) return <p className="text-sm text-muted-foreground">Cargando...</p>;
  if (!ticket) return <p className="text-sm text-muted-foreground">Ticket no encontrado.</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="lg:col-span-2 space-y-4">
        <div className="sts-card p-5 space-y-2 fade-up">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">{ticket.component.name}</h2>
            <span className="sts-chip">{ticket.status}</span>
          </div>
          <p className="text-sm text-muted-foreground">{ticket.description}</p>
          <p className="text-xs text-muted-foreground">
            {ticket.severity} | {ticket.channel} | Abierto {new Date(ticket.openedAt).toLocaleString("es-CO")}
          </p>
          {ticket.caseId ? (
            <p className="text-xs text-muted-foreground">
              Caso: <a className="underline" href={`/cases/${ticket.caseId}`}>{ticket.caseId}</a>
            </p>
          ) : null}
        </div>

        <div className="sts-card p-5 space-y-3 fade-up">
          <h3 className="text-sm font-semibold">Timeline</h3>
          <div className="space-y-2">
            {ticket.events.map((e) => (
              <div key={e.id} className="sts-card p-3">
                <p className="text-xs text-muted-foreground">
                  {new Date(e.createdAt).toLocaleString("es-CO")} | {e.type} {e.status ? `-> ${e.status}` : ""}
                </p>
                {e.message ? <p className="text-sm">{e.message}</p> : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="sts-card p-5 space-y-3 fade-up">
          <h3 className="text-sm font-semibold">SLA</h3>
          <p className="text-xs text-muted-foreground">
            Respuesta: {sla?.responseMinutes ?? "-"} min {sla?.breachResponse ? "(breach)" : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            Resolucion: {sla?.resolutionMinutes ?? "-"} min {sla?.breachResolution ? "(breach)" : ""}
          </p>
          {sla?.responseProgress !== null ? (
            <p className="text-xs text-muted-foreground">
              Progreso respuesta: {Math.round((sla?.responseProgress ?? 0) * 100)}%
            </p>
          ) : null}
          {sla?.resolutionProgress !== null ? (
            <p className="text-xs text-muted-foreground">
              Progreso resolucion: {Math.round((sla?.resolutionProgress ?? 0) * 100)}%
            </p>
          ) : null}
          {sla?.responseProgress !== null && sla.responseProgress >= 0.8 ? (
            <p className="text-xs text-amber-600">Alerta: respuesta cerca de vencer.</p>
          ) : null}
          {sla?.resolutionProgress !== null && sla.resolutionProgress >= 0.8 ? (
            <p className="text-xs text-amber-600">Alerta: resolucion cerca de vencer.</p>
          ) : null}
        </div>

        <div className="sts-card p-5 space-y-3 fade-up">
          <h3 className="text-sm font-semibold">Gestion</h3>
          {error ? <div className="rounded-md border p-3 text-sm text-red-600">{error}</div> : null}
          {msg ? <div className="rounded-md border p-3 text-sm">{msg}</div> : null}

          <div>
            <label className="text-xs text-muted-foreground">Estado</label>
            <select className="h-9 w-full rounded-md border px-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value as any)}>
              <option value={StsTicketStatus.OPEN}>Open</option>
              <option value={StsTicketStatus.IN_PROGRESS}>In Progress</option>
              <option value={StsTicketStatus.WAITING_VENDOR}>Waiting Vendor</option>
              <option value={StsTicketStatus.RESOLVED}>Resolved</option>
              <option value={StsTicketStatus.CLOSED}>Closed</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Asignar a</label>
            <select
              className="h-9 w-full rounded-md border px-2 text-sm"
              value={assignedToId}
              onChange={(e) => setAssignedToId(e.target.value)}
            >
              <option value="">Sin asignar</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role})
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="sts-btn-primary"
            disabled={saving}
            onClick={saveChanges}
          >
            Guardar cambios
          </button>
        </div>

        <div className="sts-card p-5 space-y-3 fade-up">
          <h3 className="text-sm font-semibold">Agregar comentario</h3>
          <textarea
            className="min-h-24 w-full rounded-md border px-3 py-2 text-sm"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={isResponse} onChange={(e) => setIsResponse(e.target.checked)} />
            Marcar como primera respuesta
          </label>
          <button
            type="button"
            className="sts-btn-ghost"
            disabled={saving || comment.trim().length === 0}
            onClick={addComment}
          >
            Enviar comentario
          </button>
        </div>
      </section>
    </div>
  );
}
