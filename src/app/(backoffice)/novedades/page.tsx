import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CaseStatus, CaseType, Role, StsTicketStatus, WorkOrderStatus } from "@prisma/client";
import {
  caseStatusLabels,
  labelFromMap,
  stsStatusLabels,
  workOrderStatusLabels,
} from "@/lib/labels";
import { DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeader, DataTableRow } from "@/components/ui/data-table";
import { ScrollReveal } from "@/components/animations/ScrollReveal";

type NovedadState = {
  batchRef?: string | null;
  catalogCode?: string | null;
  affectedEquipment?: string | null;
  reportedNovelty?: string | null;
  affectation?: string | null;
  observations?: string | null;
};

type EventLike = { createdAt: Date; meta: unknown };

function toStr(value: unknown) {
  const v = String(value ?? "").trim();
  return v || null;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short" }).format(value);
}

function fmtCaseNo(value?: number | null) {
  if (!value) return "CASO--";
  return `CASO-${String(value).padStart(3, "0")}`;
}

function fmtWorkOrderNo(value?: number | null) {
  if (!value) return "OT--";
  return `OT-${String(value).padStart(3, "0")}`;
}

function extractLatestNovedadState(events: EventLike[]): NovedadState | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const meta = (events[i].meta ?? {}) as any;
    const state = meta?.noveltyState;
    if (state && typeof state === "object") return state as NovedadState;
  }
  return null;
}

function extractTraceabilityEdits(events: EventLike[]) {
  let count = 0;
  let lastEditedAt: Date | null = null;
  for (const event of events) {
    const meta = (event.meta ?? {}) as any;
    if (meta?.noveltyStateAfter && meta?.noveltyStateBefore) {
      count += 1;
      lastEditedAt = event.createdAt;
    }
  }
  return { count, lastEditedAt };
}

function extractSourceCaseId(events: EventLike[]) {
  for (const event of events) {
    const meta = (event.meta ?? {}) as any;
    if (meta?.sourceCaseId) return String(meta.sourceCaseId);
  }
  return null;
}

function extractBatchRefFromEvents(events: EventLike[]) {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const meta = (events[i].meta ?? {}) as any;
    if (meta?.noveltyState?.batchRef) return String(meta.noveltyState.batchRef);
    if (meta?.batchRef) return String(meta.batchRef);
  }
  return null;
}

function badgeClass(kind: "case" | "wo" | "ticket", value: string | null | undefined) {
  const base = "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium";
  if (!value) return `${base} border-border text-muted-foreground`;
  if (kind === "case") {
    if (value === CaseStatus.NUEVO) return `${base} border-blue-200 bg-blue-50 text-blue-700`;
    if (value === CaseStatus.OT_ASIGNADA || value === CaseStatus.EN_EJECUCION)
      return `${base} border-amber-200 bg-amber-50 text-amber-700`;
    if (value === CaseStatus.RESUELTO || value === CaseStatus.CERRADO)
      return `${base} border-green-200 bg-green-50 text-green-700`;
    return `${base} border-border text-muted-foreground`;
  }
  if (kind === "wo") {
    if (value === WorkOrderStatus.EN_VALIDACION)
      return `${base} border-amber-200 bg-amber-50 text-amber-700`;
    if (value === WorkOrderStatus.FINALIZADA)
      return `${base} border-green-200 bg-green-50 text-green-700`;
    if (value === WorkOrderStatus.EN_CAMPO)
      return `${base} border-blue-200 bg-blue-50 text-blue-700`;
    return `${base} border-border text-muted-foreground`;
  }
  if (value === StsTicketStatus.OPEN || value === StsTicketStatus.IN_PROGRESS)
    return `${base} border-amber-200 bg-amber-50 text-amber-700`;
  if (value === StsTicketStatus.RESOLVED || value === StsTicketStatus.CLOSED)
    return `${base} border-green-200 bg-green-50 text-green-700`;
  return `${base} border-border text-muted-foreground`;
}

type NovedadRow = {
  batchRef: string;
  novelty: {
    id: string;
    caseNo: number | null;
    status: CaseStatus;
    createdAt: Date;
    busCode: string;
    busPlate: string | null;
  };
      state: {
        catalogCode: string;
        affectedEquipment: string;
        reportedNovelty: string;
        affectation: string;
      };
  traceability: {
    edits: number;
    lastEditedAt: Date | null;
  };
  corrective: null | {
    id: string;
    caseNo: number | null;
    status: CaseStatus;
    workOrderId: string | null;
    workOrderNo: number | null;
    workOrderStatus: WorkOrderStatus | null;
    ticketId: string | null;
    ticketStatus: StsTicketStatus | null;
  };
};

export default async function NovedadesPage({ searchParams }: { searchParams: any }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="sts-card p-4">
          <p className="text-sm">Debes iniciar sesión.</p>
          <Link className="text-sm underline" href="/login">
            Ir a login
          </Link>
        </div>
      </div>
    );
  }

  const role = (session.user as any).role as Role;
  if (
    role !== Role.ADMIN &&
    role !== Role.BACKOFFICE &&
    role !== Role.SUPERVISOR &&
    role !== Role.PLANNER
  ) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="sts-card p-4">
          <p className="text-sm">No autorizado.</p>
        </div>
      </div>
    );
  }

  const tenantId = (session.user as any).tenantId as string;
  const q = toStr(searchParams?.q);
  const batchRefFilter = toStr(searchParams?.batchRef);

  const numericQuery = q && /^\d+$/.test(q) ? Number(q) : null;

  const noveltyCases = await prisma.case.findMany({
    where: {
      tenantId,
      type: CaseType.NOVEDAD,
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
              { bus: { code: { contains: q, mode: "insensitive" } } },
              { bus: { plate: { contains: q, mode: "insensitive" } } },
              ...(numericQuery ? [{ caseNo: numericQuery }] : []),
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 250,
    include: {
      bus: { select: { code: true, plate: true } },
      events: { orderBy: { createdAt: "asc" }, select: { createdAt: true, meta: true } },
    },
  });

  const since = noveltyCases.length
    ? noveltyCases[noveltyCases.length - 1].createdAt
    : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const correctiveCases = await prisma.case.findMany({
    where: {
      tenantId,
      type: CaseType.CORRECTIVO,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: 800,
    include: {
      workOrder: { select: { id: true, workOrderNo: true, status: true } },
      stsTicket: { select: { id: true, status: true } },
      events: { orderBy: { createdAt: "asc" }, select: { createdAt: true, meta: true } },
    },
  });

  const correctiveBySourceCaseId = new Map<string, typeof correctiveCases[number]>();
  const correctiveByBatchRef = new Map<string, typeof correctiveCases[number]>();

  for (const corrective of correctiveCases) {
    const sourceCaseId = extractSourceCaseId(corrective.events);
    const batchRef = extractBatchRefFromEvents(corrective.events);
    if (sourceCaseId && !correctiveBySourceCaseId.has(sourceCaseId)) {
      correctiveBySourceCaseId.set(sourceCaseId, corrective);
    }
    if (batchRef && !correctiveByBatchRef.has(batchRef)) {
      correctiveByBatchRef.set(batchRef, corrective);
    }
  }

  const rows: NovedadRow[] = noveltyCases.map((noveltyCase) => {
    const state = extractLatestNovedadState(noveltyCase.events);
    const batchRef =
      state?.batchRef?.trim() ||
      `NVD-${String(noveltyCase.caseNo ?? 0).padStart(4, "0")}`;
    const linkedCorrective =
      correctiveBySourceCaseId.get(noveltyCase.id) || correctiveByBatchRef.get(batchRef) || null;
    const traceability = extractTraceabilityEdits(noveltyCase.events);

    return {
      batchRef,
      novelty: {
        id: noveltyCase.id,
        caseNo: noveltyCase.caseNo,
        status: noveltyCase.status,
        createdAt: noveltyCase.createdAt,
        busCode: noveltyCase.bus.code,
        busPlate: noveltyCase.bus.plate,
      },
      state: {
        catalogCode: String(state?.catalogCode ?? ""),
        affectedEquipment: String(state?.affectedEquipment ?? ""),
        reportedNovelty:
          String(state?.reportedNovelty ?? "") ||
          noveltyCase.title.replace(/^Novedad\s+[^\-]+-\s*/i, "").trim(),
        affectation: String(state?.affectation ?? ""),
      },
      traceability: {
        edits: traceability.count,
        lastEditedAt: traceability.lastEditedAt,
      },
      corrective: linkedCorrective
        ? {
            id: linkedCorrective.id,
            caseNo: linkedCorrective.caseNo,
            status: linkedCorrective.status,
            workOrderId: linkedCorrective.workOrder?.id ?? null,
            workOrderNo: linkedCorrective.workOrder?.workOrderNo ?? null,
            workOrderStatus: linkedCorrective.workOrder?.status ?? null,
            ticketId: linkedCorrective.stsTicket?.id ?? null,
            ticketStatus: linkedCorrective.stsTicket?.status ?? null,
          }
        : null,
    };
  });

  const filteredRows = rows.filter((row) =>
    batchRefFilter ? row.batchRef.toUpperCase().includes(batchRefFilter.toUpperCase()) : true
  );

  const grouped = new Map<string, NovedadRow[]>();
  for (const row of filteredRows) {
    if (!grouped.has(row.batchRef)) grouped.set(row.batchRef, []);
    grouped.get(row.batchRef)!.push(row);
  }

  const groups = Array.from(grouped.entries())
    .map(([batchRef, items]) => {
      const sortedItems = [...items].sort(
        (a, b) => b.novelty.createdAt.getTime() - a.novelty.createdAt.getTime()
      );
      const createdAt = sortedItems[0]?.novelty.createdAt ?? new Date();
      const total = sortedItems.length;
      const closed = sortedItems.filter(
        (item) =>
          item.corrective?.status === CaseStatus.CERRADO ||
          item.corrective?.status === CaseStatus.RESUELTO
      ).length;
      const pendingValidation = sortedItems.filter(
        (item) => item.corrective?.workOrderStatus === WorkOrderStatus.EN_VALIDACION
      ).length;
      return {
        batchRef,
        createdAt,
        total,
        closed,
        pendingValidation,
        items: sortedItems,
      };
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <div className="mobile-page-shell">
      <header className="mobile-page-header">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col items-start gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-6 lg:py-0">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 lg:text-4xl">Novedades</h1>
            <p className="text-sm text-muted-foreground">
              Lotes reportados con seguimiento de casos y tickets asociados.
            </p>
          </div>
          <Link
            className="sts-btn-primary inline-flex h-10 items-center justify-center self-start px-4 text-sm"
            href="/cases/new?type=NOVEDAD"
          >
            Reportar novedad
          </Link>
        </div>
      </header>

      <div className="mobile-page-content max-w-[1600px] lg:px-6">
        <ScrollReveal>
          <div className="mobile-section-card mobile-section-card__body">
            <form className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap" method="get">
              <input
                name="q"
                placeholder="Buscar por bus, caso o novedad"
                className="app-field-control h-10 w-full rounded-xl px-3 text-sm sm:w-[18rem]"
                defaultValue={searchParams?.q ?? ""}
              />
              <input
                name="batchRef"
                placeholder="ID lote (ej: NVD-0048)"
                className="app-field-control h-10 w-full rounded-xl px-3 text-sm sm:w-[14rem]"
                defaultValue={searchParams?.batchRef ?? ""}
              />
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <button className="sts-btn-primary h-10 flex-1 px-4 text-sm sm:flex-none">Filtrar</button>
                <Link
                  className="sts-btn-ghost inline-flex h-10 flex-1 items-center justify-center px-4 text-sm sm:flex-none"
                  href="/novedades"
                >
                  Limpiar
                </Link>
              </div>
            </form>
          </div>
        </ScrollReveal>

        {groups.length === 0 ? (
          <div className="mobile-section-card mobile-section-card__body text-sm text-muted-foreground">
            No hay novedades para los filtros seleccionados.
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group, index) => (
              <ScrollReveal key={group.batchRef} delay={index * 0.04}>
                <section className="mobile-section-card">
                <div className="mobile-section-card__header">
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Lote</p>
                      <h2 className="text-base font-semibold lg:text-lg">{group.batchRef}</h2>
                      <p className="text-xs text-muted-foreground">
                        Creado: {formatDate(group.createdAt)} · {group.total} bus(es) reportados
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                        Cerrados: {group.closed}/{group.total}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                        Por validar: {group.pendingValidation}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="lg:hidden">
                  <div className="mobile-list-stack p-3">
                    {group.items.map((item) => (
                      <article key={item.novelty.id} className="rounded-xl border border-border/60 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">
                              {item.novelty.busCode}{" "}
                              <span className="text-xs font-normal text-muted-foreground">
                                {item.novelty.busPlate ?? "Sin placa"}
                              </span>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {fmtCaseNo(item.novelty.caseNo)} · {formatDate(item.novelty.createdAt)}
                            </p>
                          </div>
                          <span className={badgeClass("case", item.novelty.status)}>
                            {labelFromMap(item.novelty.status, caseStatusLabels)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-medium break-words">
                          {item.state.reportedNovelty || "Novedad sin detalle"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.state.affectedEquipment || "Equipo no especificado"}
                          {item.state.catalogCode ? ` · ${item.state.catalogCode}` : ""}
                        </p>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <p className="text-muted-foreground">Correctivo</p>
                            {item.corrective ? (
                              <span className={badgeClass("case", item.corrective.status)}>
                                {labelFromMap(item.corrective.status, caseStatusLabels)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">Pendiente</span>
                            )}
                          </div>
                          <div>
                            <p className="text-muted-foreground">Ticket</p>
                            {item.corrective?.ticketStatus ? (
                              <span className={badgeClass("ticket", item.corrective.ticketStatus)}>
                                {labelFromMap(item.corrective.ticketStatus, stsStatusLabels)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">Sin ticket</span>
                            )}
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <Link
                            className="sts-btn-ghost inline-flex h-8 items-center justify-center px-3 text-xs"
                            href={`/cases/${item.novelty.id}`}
                          >
                            Abrir novedad
                          </Link>
                          {item.corrective?.id ? (
                            <Link
                              className="sts-btn-ghost inline-flex h-8 items-center justify-center px-3 text-xs"
                              href={`/cases/${item.corrective.id}`}
                            >
                              Abrir correctivo
                            </Link>
                          ) : null}
                          {item.corrective?.workOrderId ? (
                            <Link
                              className="sts-btn-ghost inline-flex h-8 items-center justify-center px-3 text-xs"
                              href={`/work-orders/${item.corrective.workOrderId}`}
                            >
                              Abrir OT
                            </Link>
                          ) : null}
                          {item.corrective?.ticketId ? (
                            <Link
                              className="sts-btn-ghost inline-flex h-8 items-center justify-center px-3 text-xs"
                              href={`/sts/tickets/${item.corrective.ticketId}`}
                            >
                              Abrir ticket
                            </Link>
                          ) : null}
                        </div>

                        <p className="mt-2 text-[11px] text-muted-foreground">
                          Trazabilidad: {item.traceability.edits} cambio(s)
                          {item.traceability.lastEditedAt
                            ? ` · último ${formatDate(item.traceability.lastEditedAt)}`
                            : ""}
                        </p>
                      </article>
                    ))}
                  </div>
                </div>

                <div className="hidden lg:block p-3">
                  <DataTable tableClassName="table-fixed">
                    <DataTableHeader>
                      <DataTableRow>
                        <DataTableHead className="w-[12%]">Bus</DataTableHead>
                        <DataTableHead className="w-[28%]">Novedad reportada</DataTableHead>
                        <DataTableHead className="w-[14%]">Caso novedad</DataTableHead>
                        <DataTableHead className="w-[14%]">Correctivo</DataTableHead>
                        <DataTableHead className="w-[12%]">OT</DataTableHead>
                        <DataTableHead className="w-[12%]">Ticket STS</DataTableHead>
                        <DataTableHead className="w-[8%] text-right">Acción</DataTableHead>
                      </DataTableRow>
                    </DataTableHeader>
                    <DataTableBody>
                      {group.items.map((item) => (
                        <DataTableRow key={item.novelty.id} clickable>
                          <DataTableCell>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-sm font-medium">{item.novelty.busCode}</span>
                              <span className="text-xs text-muted-foreground">
                                {item.novelty.busPlate ?? "Sin placa"}
                              </span>
                            </div>
                          </DataTableCell>
                          <DataTableCell>
                            <div className="space-y-1">
                              <p className="text-sm font-medium break-words">
                                {item.state.reportedNovelty || "Novedad sin detalle"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {item.state.affectedEquipment || "Equipo no especificado"}
                                {item.state.catalogCode ? ` · ${item.state.catalogCode}` : ""}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Trazabilidad: {item.traceability.edits}
                                {item.traceability.lastEditedAt ? ` · ${formatDate(item.traceability.lastEditedAt)}` : ""}
                              </p>
                            </div>
                          </DataTableCell>
                          <DataTableCell>
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">{fmtCaseNo(item.novelty.caseNo)}</p>
                              <span className={badgeClass("case", item.novelty.status)}>
                                {labelFromMap(item.novelty.status, caseStatusLabels)}
                              </span>
                            </div>
                          </DataTableCell>
                          <DataTableCell>
                            {item.corrective ? (
                              <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">
                                  {fmtCaseNo(item.corrective.caseNo)}
                                </p>
                                <span className={badgeClass("case", item.corrective.status)}>
                                  {labelFromMap(item.corrective.status, caseStatusLabels)}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">Pendiente</span>
                            )}
                          </DataTableCell>
                          <DataTableCell>
                            {item.corrective?.workOrderStatus ? (
                              <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">
                                  {fmtWorkOrderNo(item.corrective.workOrderNo)}
                                </p>
                                <span className={badgeClass("wo", item.corrective.workOrderStatus)}>
                                  {labelFromMap(item.corrective.workOrderStatus, workOrderStatusLabels)}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">Sin OT</span>
                            )}
                          </DataTableCell>
                          <DataTableCell>
                            <div className="space-y-1">
                              {item.corrective?.ticketStatus ? (
                                <span className={badgeClass("ticket", item.corrective.ticketStatus)}>
                                  {labelFromMap(item.corrective.ticketStatus, stsStatusLabels)}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">Sin ticket</span>
                              )}
                              {item.corrective?.ticketId ? (
                                <Link
                                  className="inline-flex text-xs text-primary underline-offset-2 hover:underline"
                                  href={`/sts/tickets/${item.corrective.ticketId}`}
                                >
                                  Ver ticket
                                </Link>
                              ) : null}
                            </div>
                          </DataTableCell>
                          <DataTableCell className="text-right">
                            <div className="flex items-center justify-end">
                              <Link
                                className="sts-btn-ghost inline-flex h-8 items-center justify-center px-3 text-xs"
                                href={`/cases/${item.novelty.id}`}
                              >
                                Abrir
                              </Link>
                            </div>
                          </DataTableCell>
                        </DataTableRow>
                      ))}
                    </DataTableBody>
                  </DataTable>
                </div>
                </section>
              </ScrollReveal>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
