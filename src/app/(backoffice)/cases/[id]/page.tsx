import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CaseEventType, ProcedureType, Role } from "@prisma/client";
import { caseStatusLabels, caseTypeLabels, labelFromMap, workOrderStatusLabels } from "@/lib/labels";
import AssignTechnicianCard from "./ui/AssignTechnicianCard";
import ValidateWorkOrderCard from "./ui/ValidateWorkOrderCard";
import { CheckCircle2, FileText } from "lucide-react";

function badgeClass(kind: "status" | "type" | "priority", value: string | number) {
  const base = "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium";
  if (kind === "status") {
    const v = String(value);
    if (v === "NUEVO") return `${base} bg-blue-50 text-blue-700 border-blue-200`;
    if (v === "OT_ASIGNADA") return `${base} bg-amber-50 text-amber-800 border-amber-200`;
    if (v === "EN_EJECUCION") return `${base} bg-purple-50 text-purple-800 border-purple-200`;
    if (v === "RESUELTO") return `${base} bg-green-50 text-green-700 border-green-200`;
    if (v === "CERRADO") return `${base} bg-zinc-50 text-zinc-700 border-zinc-200`;
    return `${base} bg-zinc-50 text-zinc-700 border-zinc-200`;
  }
  if (kind === "priority") {
    const p = Number(value);
    if (p <= 2) return `${base} bg-red-50 text-red-700 border-red-200`;
    if (p === 3) return `${base} bg-amber-50 text-amber-800 border-amber-200`;
    return `${base} bg-emerald-50 text-emerald-700 border-emerald-200`;
  }
  return `${base} bg-zinc-50 text-zinc-700 border-zinc-200`;
}

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function fmtCaseNo(n?: number | null) {
  if (!n) return "CASO--";
  return `CASO-${String(n).padStart(3, "0")}`;
}

function fmtWoNo(n?: number | null) {
  if (!n) return "OT--";
  return `OT-${String(n).padStart(3, "0")}`;
}

const CASE_EVENT_LABELS: Record<CaseEventType, string> = {
  CREATED: "Caso creado",
  ASSIGNED: "Asignacion",
  NOTIFIED: "Notificacion",
  STATUS_CHANGE: "Cambio de estado",
  COMMENT: "Comentario",
};

type PageProps = { params: { id: string }; searchParams?: { debug?: string } };

export default async function CaseDetailPage({ params, searchParams }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <div className="sts-card p-4">
          <p className="text-sm">Debes iniciar sesion.</p>
          <Link className="text-sm underline" href="/login">
            Ir a login
          </Link>
        </div>
      </div>
    );
  }

  const role = (session.user as any).role as Role;
  if (role !== Role.ADMIN && role !== Role.BACKOFFICE && role !== Role.PLANNER) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <div className="sts-card p-4">
          <p className="text-sm">No autorizado.</p>
        </div>
      </div>
    );
  }

  const tenantId = (session.user as any).tenantId as string;
  const debug = String(searchParams?.debug ?? "") === "1";

  const c = await prisma.case.findFirst({
    where: { id: params.id, tenantId },
    include: {
      bus: { select: { id: true, code: true, plate: true } },
      busEquipment: {
        select: {
          id: true,
          serial: true,
          location: true,
          active: true,
          equipmentType: { select: { name: true } },
        },
      },
      caseEquipments: {
        select: {
          busEquipment: {
            select: {
              id: true,
              serial: true,
              location: true,
              equipmentType: { select: { name: true } },
            },
          },
        },
      },
      workOrder: {
        include: {
          assignedTo: { select: { id: true, name: true, email: true, role: true } },
          interventionReceipt: true,
          correctiveReport: { select: { procedureType: true } },
        },
      },
      events: { orderBy: { createdAt: "asc" }, take: 200 },
      videoDownloadRequest: true,
      stsTicket: {
        include: { events: { orderBy: { createdAt: "asc" } } },
      },
    },
  });

  if (!c) return notFound();

  const lifecycle = await prisma.busLifecycleEvent.findMany({
    where: {
      busId: c.busId,
      OR: [{ caseId: c.id }, ...(c.workOrder?.id ? [{ workOrderId: c.workOrder.id }] : [])],
    },
    orderBy: { occurredAt: "asc" },
    take: 200,
  });

  const technicians = await prisma.user.findMany({
    where: { tenantId, active: true, role: Role.TECHNICIAN },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });

  const users = await prisma.user.findMany({
    where: { tenantId, active: true },
    select: { id: true, name: true, role: true, email: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  const equipmentList = c.caseEquipments?.length
    ? c.caseEquipments.map((item) => item.busEquipment)
    : c.busEquipment
    ? [c.busEquipment]
    : [];
  const equipmentLabel =
    equipmentList.length > 0
      ? equipmentList
          .map(
            (eq) =>
              `${eq.equipmentType.name}${eq.serial ? ` | ${eq.serial}` : ""}${eq.location ? ` | ${eq.location}` : ""}`
          )
          .join(" | ")
      : "No aplica / No seleccionado";

  const hasWo = Boolean(c.workOrder?.id);
  const isVideoCase = c.type === "SOLICITUD_DESCARGA_VIDEO";
  const contextBoxClass = "rounded-lg border-2 border-border/60 bg-muted/30 p-4";

  const refs = `${fmtCaseNo(c.caseNo)}${c.workOrder?.workOrderNo ? ` | ${fmtWoNo(c.workOrder.workOrderNo)}` : ""}`;
  const isProductImprovement = c.type === "MEJORA_PRODUCTO";
  const renewalActaLabel =
    isProductImprovement ? "Descargar acta de mejora de producto" : "Descargar acta de cambios";
  const equipmentItems = equipmentLabel
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

  const timeline = [
    ...c.events.map((e) => {
      const meta = (e.meta ?? {}) as any;
      const actorId = String(meta.by ?? meta.userId ?? meta.actorUserId ?? "");
      const actor = actorId ? userById.get(actorId) : null;

      const techId = String(meta.technicianId ?? "");
      const tech = techId ? userById.get(techId) : null;

      const label = CASE_EVENT_LABELS[e.type] ?? e.type;
      const extra =
        e.type === CaseEventType.ASSIGNED && tech
          ? `Tecnico: ${tech.name}${tech.email ? ` (${tech.email})` : ""}`
          : null;

      return {
        kind: "CASE" as const,
        at: e.createdAt,
        title: label,
        message: e.message ?? "",
        extra,
        actor: actor ? `${actor.name} (${actor.role})` : null,
        meta,
      };
    }),
    ...lifecycle.map((e) => {
      const label =
        e.eventType === "WO_ASSIGNED"
          ? "OT asignada a tecnico"
          : e.eventType === "WO_STARTED"
          ? "OT iniciada"
          : e.eventType === "WO_FINISHED"
          ? "OT finalizada"
          : e.eventType;

      return {
        kind: "BUS" as const,
        at: e.occurredAt,
        title: label,
        message: e.summary ?? "",
        extra: null as string | null,
        actor: null as string | null,
        meta: { caseId: e.caseId, workOrderId: e.workOrderId, busEquipmentId: e.busEquipmentId },
      };
    }),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  const caps = (session.user as any).capabilities as string[] | undefined;
  const canAssign =
    role === Role.ADMIN || (role === Role.BACKOFFICE && caps?.includes("CASE_ASSIGN"));

  return (
    <div className="mobile-page-shell">
      <header className="mobile-page-header sticky top-16 lg:static lg:top-auto">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 lg:flex-row lg:items-start lg:justify-between lg:px-6 lg:py-0">
          <div className="min-w-0 space-y-2">
            <h1 className="text-base font-semibold leading-tight break-words lg:text-3xl">{c.title}</h1>
            <p className="text-xs leading-tight text-muted-foreground break-all lg:text-sm lg:break-normal">
              {fmtCaseNo(c.caseNo)} | Caso <span className="font-mono">{c.id}</span> | Creado {fmtDate(c.createdAt)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className={badgeClass("type", c.type)}>{labelFromMap(c.type, caseTypeLabels)}</span>
            <span className={badgeClass("status", c.status)}>{labelFromMap(c.status, caseStatusLabels)}</span>
            <span className={badgeClass("priority", c.priority)}>Prioridad {c.priority}</span>
          </div>
        </div>
      </header>

      <div className="mobile-page-content max-w-6xl lg:px-6">
        <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4 lg:space-y-6">
          <section className="sts-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border/50 bg-muted/20 p-4 lg:p-5">
              <h2 className="text-base font-semibold">Contexto</h2>
              <Link className="text-xs underline lg:text-sm" href={`/buses/${c.bus.id}`}>
                Ver hoja de vida del bus
              </Link>
            </div>

            <div className="divide-y divide-border/30 lg:hidden">
              <div className="p-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Bus</p>
                <p className="text-sm font-medium">
                  {c.bus.code} {c.bus.plate ? `| ${c.bus.plate}` : ""}
                </p>
              </div>

              <div className="p-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Equipos</p>
                {equipmentItems.length === 0 ? (
                  <p className="text-sm font-medium">No aplica / No seleccionado</p>
                ) : (
                  <div className="max-h-40 overflow-y-auto rounded-lg bg-muted/30 p-3">
                    <ul className="space-y-1 text-xs">
                      {equipmentItems.map((item, idx) => (
                        <li key={`${item}-${idx}`} className="flex items-start gap-2">
                          <span className="mt-0.5 text-muted-foreground">•</span>
                          <span className="break-all">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="p-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Descripción</p>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{c.description}</p>
              </div>
            </div>

            <div className="hidden gap-4 p-5 md:grid md:grid-cols-2">
              <div className={contextBoxClass}>
                <p className="text-xs text-muted-foreground">Bus</p>
                <p className="mt-1 text-sm font-medium">
                  {c.bus.code} {c.bus.plate ? `| ${c.bus.plate}` : ""}
                </p>
              </div>

              <div className={contextBoxClass}>
                <p className="text-xs text-muted-foreground">Equipo</p>
                {equipmentItems.length === 0 ? (
                  <p className="mt-1 text-sm font-medium">No aplica / No seleccionado</p>
                ) : (
                  <div className="mt-2 max-h-32 space-y-1 overflow-y-auto rounded-lg border border-border/60 bg-card/80 p-2">
                    {equipmentItems.map((item, idx) => (
                      <p key={`${item}-${idx}`} className="text-xs leading-relaxed">
                        • {item}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              <div className={`${contextBoxClass} md:col-span-2`}>
                <p className="text-xs text-muted-foreground">Descripcion</p>
                <p className="mt-1 text-sm whitespace-pre-wrap">{c.description}</p>
              </div>
            </div>
          </section>

          <section className="sts-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border/50 bg-muted/20 p-4 lg:p-5">
              <h2 className="text-base font-semibold">Trazabilidad</h2>
              <p className="text-xs text-muted-foreground">
                {c.events.length} eventos de caso | {lifecycle.length} eventos de bus
              </p>
            </div>

            <div className="divide-y divide-border/30 lg:hidden">
              {timeline.map((it, idx) => (
                <div key={`${it.kind}-${idx}`} className="relative">
                  {idx !== timeline.length - 1 ? (
                    <div className="absolute bottom-0 left-7 top-12 w-px bg-border/80" />
                  ) : null}

                  <div className="flex items-start gap-3 p-4">
                    <div
                      className={`relative z-10 mt-1 rounded-full p-1.5 ${
                        it.kind === "CASE" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {it.kind === "CASE" ? <FileText className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium ${
                            it.kind === "CASE" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {it.kind}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">{fmtDate(it.at)}</span>
                      </div>

                      <p className="text-sm font-semibold leading-snug">{it.title}</p>
                      {it.message ? <p className="text-xs leading-relaxed text-muted-foreground">{it.message}</p> : null}
                      {it.extra ? <p className="text-xs leading-relaxed text-muted-foreground">{it.extra}</p> : null}
                      {it.actor ? (
                        <p className="text-xs text-muted-foreground">
                          Por: <span className="font-medium text-foreground">{it.actor}</span>
                        </p>
                      ) : null}

                      {debug && it.meta ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-muted-foreground">Ver detalles tecnicos</summary>
                          <pre className="mt-2 max-h-56 overflow-auto rounded bg-zinc-50 p-2 text-xs">
                            {JSON.stringify(it.meta, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden space-y-3 p-5 lg:block">
              {timeline.map((it, idx) => (
                <div key={`${it.kind}-${idx}`} className="flex gap-3">
                  <div className="mt-1 h-2 w-2 rounded-full bg-zinc-400" />
                  <div className="flex-1 sts-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {it.kind}
                          </span>
                          <p className="text-sm font-semibold">{it.title}</p>
                          <span className="text-xs text-muted-foreground">{refs}</span>
                        </div>

                        {it.message ? <p className="mt-1 text-sm text-muted-foreground">{it.message}</p> : null}
                        {it.extra ? <p className="mt-1 text-sm text-muted-foreground">{it.extra}</p> : null}

                        {it.actor ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Por: <span className="font-medium text-foreground">{it.actor}</span>
                          </p>
                        ) : null}
                      </div>

                      <p className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(it.at)}</p>
                    </div>

                    {debug && it.meta ? (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs text-muted-foreground">Ver detalles tecnicos</summary>
                        <pre className="mt-2 max-h-56 overflow-auto rounded bg-zinc-50 p-2 text-xs">
                          {JSON.stringify(it.meta, null, 2)}
                        </pre>
                      </details>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            {!debug ? (
              <p className="p-4 text-xs text-muted-foreground lg:px-5 lg:pb-5 lg:pt-0">
                Detalles tecnicos ocultos. Para ver meta: agrega <span className="font-mono">?debug=1</span> a la URL.
              </p>
            ) : null}
          </section>
        </div>

        <div className="space-y-6">
          {isVideoCase ? (
            <section className="sts-card p-5">
              <h2 className="text-base font-semibold">Gestion de video</h2>

              <div className="mt-3 space-y-2">
                <div className="sts-card p-3">
                  <p className="text-xs text-muted-foreground">Estado solicitud</p>
                  <p className="mt-1 text-sm font-medium">{c.videoDownloadRequest?.status ?? "-"}</p>
                </div>

                <div className="sts-card p-3">
                  <p className="text-xs text-muted-foreground">Estado descarga</p>
                  <p className="mt-1 text-sm font-medium">{c.videoDownloadRequest?.downloadStatus ?? "-"}</p>
                </div>

                {c.videoDownloadRequest ? (
                  <Link
                    href={`/video-requests/${c.videoDownloadRequest.id}`}
                    className="inline-flex w-full items-center justify-center sts-btn-primary text-sm"
                  >
                    Abrir gestion
                  </Link>
                ) : (
                  <p className="text-xs text-muted-foreground">Solicitud de video no disponible.</p>
                )}
              </div>
            </section>
          ) : (
            <>
              <section className="sts-card p-5">
                <h2 className="text-base font-semibold">Orden de trabajo</h2>

                <div className="mt-3 space-y-2">
                  <div className="sts-card p-3">
                    <p className="text-xs text-muted-foreground">OT</p>
                    <p className="mt-1 text-sm font-medium">
                      {c.workOrder?.workOrderNo ? fmtWoNo(c.workOrder.workOrderNo) : "-"}
                    </p>
                  </div>

                  <div className="sts-card p-3">
                    <p className="text-xs text-muted-foreground">Estado OT</p>
                    <p className="mt-1 text-sm font-medium">
                      {c.workOrder?.status ? labelFromMap(c.workOrder.status, workOrderStatusLabels) : "- (no aplica)"}
                    </p>
                  </div>

                  <div className="sts-card p-3">
                    <p className="text-xs text-muted-foreground">Tecnico asignado</p>
                    <p className="mt-1 text-sm font-medium">
                      {c.workOrder?.assignedTo?.name ?? (c.workOrder?.assignedToId ? c.workOrder.assignedToId : "-")}
                    </p>
                    {c.workOrder?.assignedAt ? (
                      <p className="mt-1 text-xs text-muted-foreground">Asignada: {fmtDate(c.workOrder.assignedAt)}</p>
                    ) : null}
                  </div>

                  {hasWo ? (
                    <div className="space-y-2">
                      <Link
                        href={`/work-orders/${c.workOrder!.id}`}
                        className="inline-flex w-full items-center justify-center sts-btn-primary text-sm"
                      >
                        Abrir OT
                      </Link>
                      {c.workOrder?.interventionReceipt ? (
                        <a
                          className="inline-flex w-full items-center justify-center rounded-md border px-4 py-2 text-sm"
                          href={`/api/work-orders/${c.workOrder!.id}/receipt-pdf`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Descargar recibo de intervención
                        </a>
                      ) : null}
                      {(c.type === "RENOVACION_TECNOLOGICA" || c.type === "MEJORA_PRODUCTO") &&
                      c.workOrder?.status === "FINALIZADA" ? (
                        <a
                          className={
                            isProductImprovement
                              ? "inline-flex w-full items-center justify-center sts-btn-primary text-sm"
                              : "inline-flex w-full items-center justify-center rounded-md border px-4 py-2 text-sm"
                          }
                          href={`/api/work-orders/${c.workOrder!.id}/renewal-acta`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {renewalActaLabel}
                        </a>
                      ) : null}
                      {c.type === "CORRECTIVO" &&
                      c.workOrder?.status === "FINALIZADA" &&
                      c.workOrder.correctiveReport?.procedureType === ProcedureType.CAMBIO_COMPONENTE ? (
                        <a
                          className="inline-flex w-full items-center justify-center rounded-md border px-4 py-2 text-sm"
                          href={`/api/work-orders/${c.workOrder!.id}/corrective-acta`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Descargar acta de cambio de equipo
                        </a>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Este tipo de caso no requiere OT (segun registry) o aun no se genero.
                    </p>
                  )}
                </div>
              </section>

              {c.stsTicket ? (
                <section className="sts-card p-5">
                  <h2 className="text-base font-semibold">Ticket STS</h2>
                  <div className="mt-3 space-y-2">
                    <div className="sts-card p-3">
                      <p className="text-xs text-muted-foreground">Estado</p>
                      <p className="mt-1 text-sm font-medium">{c.stsTicket.status}</p>
                    </div>
                    <div className="sts-card p-3">
                      <p className="text-xs text-muted-foreground">Prioridad</p>
                      <p className="mt-1 text-sm font-medium">{c.stsTicket.severity}</p>
                    </div>
                    <Link
                      href={`/sts/tickets/${c.stsTicket.id}`}
                      className="inline-flex w-full items-center justify-center rounded-md border px-4 py-2 text-sm"
                    >
                      Ver ticket STS
                    </Link>
                  </div>
                </section>
              ) : null}

              {c.stsTicket?.events?.length ? (
                <section className="sts-card p-5">
                  <h2 className="text-base font-semibold">Timeline STS</h2>
                  <div className="mt-3 space-y-2">
                    {c.stsTicket.events.map((e) => (
                      <div key={e.id} className="sts-card p-3">
                        <p className="text-xs text-muted-foreground">
                          {fmtDate(e.createdAt)} | {e.type} {e.status ? `-> ${e.status}` : ""}
                        </p>
                        {e.message ? <p className="mt-1 text-sm text-muted-foreground">{e.message}</p> : null}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {canAssign ? (
                <AssignTechnicianCard
                  caseId={c.id}
                  workOrderId={c.workOrder?.id ?? null}
                  currentAssignedToId={c.workOrder?.assignedToId ?? null}
                  caseType={c.type}
                  currentScheduledAt={c.workOrder?.scheduledAt ? c.workOrder.scheduledAt.toISOString() : null}
                  technicians={technicians}
                />
              ) : (
                <section className="sts-card p-5">
                  <h2 className="text-base font-semibold">Asignacion</h2>
                  <p className="mt-2 text-sm text-muted-foreground">Solo planner o admin pueden asignar tecnicos.</p>
                </section>
              )}

              {c.workOrder?.id &&
              c.workOrder.status === ("EN_VALIDACION" as any) &&
              (role === Role.ADMIN || role === Role.BACKOFFICE) ? (
                <ValidateWorkOrderCard workOrderId={c.workOrder.id} />
              ) : null}
            </>
          )}

          <section className="sts-card p-5">
            <h2 className="text-base font-semibold">Acciones</h2>
            <div className="mt-3 space-y-2">
              <Link
                href="/cases"
                className="inline-flex w-full items-center justify-center rounded-md border px-4 py-2 text-sm"
              >
                Volver a bandeja
              </Link>
              <Link
                href={`/cases/new`}
                className="inline-flex w-full items-center justify-center rounded-md border px-4 py-2 text-sm"
              >
                Crear otro caso
              </Link>
            </div>
          </section>
        </div>
      </div>
      </div>
    </div>
  );
}
