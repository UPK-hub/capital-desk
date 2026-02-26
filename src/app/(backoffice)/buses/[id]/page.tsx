import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CaseType, ProcedureType, Role } from "@prisma/client";
import { caseStatusLabels, caseTypeLabels, labelFromMap, stsStatusLabels, workOrderStatusLabels } from "@/lib/labels";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/ui/data-table";
import { StatusPill, StatusPillStatus } from "@/components/ui/status-pill";
import { TypeBadge } from "@/components/ui/TypeBadge";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import BusCommentsCard from "./ui/BusCommentsCard";
import BusTimelineCaseFilter from "./ui/BusTimelineCaseFilter";

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

function mapCaseStatus(status: string): StatusPillStatus {
  if (status === "NUEVO") return "nuevo";
  if (status === "OT_ASIGNADA" || status === "EN_EJECUCION") return "en_ejecucion";
  if (status === "RESUELTO" || status === "CERRADO") return "completado";
  return "nuevo";
}

function mapWorkOrderStatus(status: string): StatusPillStatus {
  if (status === "FINALIZADA") return "completado";
  if (status === "CREADA") return "nuevo";
  if (status === "ASIGNADA" || status === "EN_CAMPO" || status === "EN_VALIDACION") return "en_ejecucion";
  return "nuevo";
}

function cleanInventoryText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/\uFFFD/g, "")
    .replace(/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/g, "")
    .replace(/\(\s*\?+\s*\)/g, "")
    .replace(/\?{2,}/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function displayInventoryText(value: string | null | undefined): string {
  const cleaned = cleanInventoryText(value);
  return cleaned || "—";
}

function displayBrandModel(brand: string | null | undefined, model: string | null | undefined): string {
  const parts = [cleanInventoryText(brand), cleanInventoryText(model)].filter(Boolean);
  return parts.length ? parts.join(" ") : "—";
}

function toExternalHttpUrl(raw: string | null | undefined): string | null {
  const cleaned = cleanInventoryText(raw);
  if (!cleaned) return null;
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  return `https://${cleaned}`;
}

function shortUrlLabel(rawUrl: string | null | undefined): string {
  const normalized = toExternalHttpUrl(rawUrl);
  if (!normalized) return "—";
  try {
    const parsed = new URL(normalized);
    const path = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "";
    const shortPath = path.length > 48 ? `${path.slice(0, 48)}...` : path;
    return `${parsed.hostname}${shortPath}`;
  } catch {
    return cleanInventoryText(rawUrl) || "—";
  }
}

function isImageFilePath(filePath: string | null | undefined): boolean {
  const value = String(filePath ?? "").toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(value);
}

type NovedadStateSnapshot = {
  batchRef: string | null;
  catalogCode: string;
  affectedEquipment: string;
  reportedNovelty: string;
};

function extractSourceCaseIdFromMeta(meta: unknown): string | null {
  const sourceCaseId = (meta as any)?.sourceCaseId;
  if (!sourceCaseId) return null;
  const normalized = String(sourceCaseId).trim();
  return normalized || null;
}

function extractLatestNovedadState(events: Array<{ meta: unknown }>, fallbackTitle: string): NovedadStateSnapshot {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const state = (events[i].meta as any)?.noveltyState;
    if (state && typeof state === "object") {
      return {
        batchRef: state.batchRef ? String(state.batchRef) : null,
        catalogCode: String(state.catalogCode ?? ""),
        affectedEquipment: String(state.affectedEquipment ?? ""),
        reportedNovelty: String(state.reportedNovelty ?? ""),
      };
    }
  }

  return {
    batchRef: null,
    catalogCode: "",
    affectedEquipment: "",
    reportedNovelty: fallbackTitle.replace(/^Novedad\s+[^\-]+-\s*/i, "").trim(),
  };
}

type PageProps = {
  params: { id: string };
  searchParams?: { caseId?: string | string[] };
};

export default async function BusLifePage({ params, searchParams }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="sts-card p-6">
          <p className="text-sm">Debes iniciar sesión.</p>
          <Link className="underline text-sm" href="/login">
            Ir a login
          </Link>
        </div>
      </div>
    );
  }

  const role = (session.user as any).role as Role;
  if (role !== Role.ADMIN && role !== Role.BACKOFFICE) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="sts-card p-6">
          <p className="text-sm">No autorizado.</p>
        </div>
      </div>
    );
  }

  const tenantId = (session.user as any).tenantId as string;
  const busId = String(params.id);

  const bus = await prisma.bus.findFirst({
    where: { id: busId, tenantId },
    select: {
      id: true,
      code: true,
      plate: true,
      linkSmartHelios: true,
      ipSimcard: true,
      active: true,
      createdAt: true,
      equipments: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          deviceCode: true,
          ipAddress: true,
          brand: true,
          model: true,
          serial: true,
          location: true,
          active: true,
          equipmentType: { select: { name: true } },
        },
      },
      cases: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          caseNo: true,
          type: true,
          status: true,
          priority: true,
          title: true,
          createdAt: true,
          busEquipmentId: true,
          workOrder: {
            select: {
              id: true,
              workOrderNo: true,
              status: true,
              assignedToId: true,
              assignedAt: true,
              startedAt: true,
              finishedAt: true,
              orderFilePath: true,
              orderFileName: true,
              orderFileUpdatedAt: true,
              interventionReceipt: { select: { id: true } },
              correctiveReport: { select: { procedureType: true } },
              assignedTo: { select: { id: true, name: true, email: true } },
            },
          },
          stsTicket: {
            select: {
              id: true,
              status: true,
            },
          },
        },
      },
      lifecycle: {
        orderBy: { occurredAt: "desc" },
        take: 200,
        select: {
          id: true,
          eventType: true,
          summary: true,
          occurredAt: true,
          caseId: true,
          workOrderId: true,
          busEquipmentId: true,
        },
      },
    },
  });

  if (!bus) return notFound();

  const requestedCaseIdRaw = Array.isArray(searchParams?.caseId)
    ? searchParams?.caseId[0]
    : searchParams?.caseId;
  const selectedCaseId =
    requestedCaseIdRaw && bus.cases.some((c) => c.id === requestedCaseIdRaw) ? requestedCaseIdRaw : null;
  const selectedCase = selectedCaseId ? bus.cases.find((c) => c.id === selectedCaseId) ?? null : null;
  const selectedWorkOrderId = selectedCase?.workOrder?.id ?? null;

  const caseIds = bus.cases.map((c) => c.id);
  const woIds = bus.cases.map((c) => c.workOrder?.id).filter(Boolean) as string[];
  const smartHeliosUrl = toExternalHttpUrl(bus.linkSmartHelios);
  const smartHeliosText = shortUrlLabel(bus.linkSmartHelios);

  const caseEvents = caseIds.length
    ? await prisma.caseEvent.findMany({
        where: { caseId: { in: caseIds } },
        orderBy: { createdAt: "asc" },
        take: 300,
        select: {
          id: true,
          caseId: true,
          type: true,
          message: true,
          meta: true,
          createdAt: true,
        },
      })
    : [];

  const woSteps = woIds.length
    ? await prisma.workOrderStep.findMany({
        where: { workOrderId: { in: woIds } },
        orderBy: { createdAt: "asc" },
        take: 200,
        select: {
          id: true,
          workOrderId: true,
          stepType: true,
          notes: true,
          createdAt: true,
          media: { select: { id: true, kind: true, filePath: true, createdAt: true } },
        },
      })
    : [];

  // ✅ Helpers tipados (sin map/filter que rompe tuplas)
  const equipmentNameById = new Map<string, string>();
  for (const e of bus.equipments) equipmentNameById.set(e.id, displayInventoryText(e.equipmentType.name));

  const caseTitleById = new Map<string, string>();
  for (const c of bus.cases) caseTitleById.set(c.id, c.title);
  const caseEventsByCaseId = new Map<string, typeof caseEvents>();
  for (const event of caseEvents) {
    const list = caseEventsByCaseId.get(event.caseId) ?? [];
    list.push(event);
    caseEventsByCaseId.set(event.caseId, list);
  }

  type WO = NonNullable<(typeof bus.cases)[number]["workOrder"]>;
  const woById = new Map<string, WO>();
  for (const c of bus.cases) {
    if (c.workOrder?.id) woById.set(c.workOrder.id, c.workOrder as WO);
  }
  type BusCase = (typeof bus.cases)[number];
  const correctiveBySourceCaseId = new Map<string, BusCase>();
  for (const c of bus.cases) {
    if (c.type !== CaseType.CORRECTIVO) continue;
    const events = caseEventsByCaseId.get(c.id) ?? [];
    for (const event of events) {
      const sourceCaseId = extractSourceCaseIdFromMeta(event.meta);
      if (sourceCaseId && !correctiveBySourceCaseId.has(sourceCaseId)) {
        correctiveBySourceCaseId.set(sourceCaseId, c);
      }
    }
  }

  const novedadRows = bus.cases
    .filter((c) => c.type === CaseType.NOVEDAD)
    .map((novedadCase) => {
      const events = caseEventsByCaseId.get(novedadCase.id) ?? [];
      const state = extractLatestNovedadState(events, novedadCase.title);
      const linkedCorrective = correctiveBySourceCaseId.get(novedadCase.id) ?? null;
      const fallbackBatchRef = `NVD-${String(novedadCase.caseNo ?? 0).padStart(4, "0")}`;
      return {
        noveltyCase: novedadCase,
        batchRef: state.batchRef || fallbackBatchRef,
        reportedNovelty: state.reportedNovelty || novedadCase.title,
        affectedEquipment: state.affectedEquipment || "No especificado",
        catalogCode: state.catalogCode || "",
        linkedCorrective,
      };
    });

  const timelineLifecycle = selectedCaseId
    ? bus.lifecycle.filter(
        (e) => e.caseId === selectedCaseId || (selectedWorkOrderId ? e.workOrderId === selectedWorkOrderId : false)
      )
    : bus.lifecycle;
  const timelineCaseEvents = selectedCaseId
    ? caseEvents.filter((e) => e.caseId === selectedCaseId)
    : caseEvents;
  const timelineWoSteps = selectedCaseId
    ? selectedWorkOrderId
      ? woSteps.filter((s) => s.workOrderId === selectedWorkOrderId)
      : []
    : woSteps;

  const timeline: Array<{
    at: Date;
    kind: "BUS" | "CASE" | "WO_STEP";
    title: string;
    message?: string;
    meta?: any;
    href?: string | null;
  }> = [];

  for (const e of timelineLifecycle) {
    timeline.push({
      at: e.occurredAt,
      kind: "BUS",
      title: e.eventType,
      message: e.summary,
      meta: { caseId: e.caseId, workOrderId: e.workOrderId, busEquipmentId: e.busEquipmentId },
      href: e.workOrderId ? `/work-orders/${e.workOrderId}` : e.caseId ? `/cases/${e.caseId}` : null,
    });
  }

  for (const e of timelineCaseEvents) {
    timeline.push({
      at: e.createdAt,
      kind: "CASE",
      title: `CASE:${e.type}`,
      message: e.message ?? "",
      meta: { caseId: e.caseId, ...(typeof e.meta === "object" && e.meta ? (e.meta as any) : {}) },
      href: `/cases/${e.caseId}`,
    });
  }

  for (const s of timelineWoSteps) {
    const wo = woById.get(s.workOrderId);
    timeline.push({
      at: s.createdAt,
      kind: "WO_STEP",
      title: `OT:${s.stepType}`,
      message: s.notes,
      meta: {
        workOrderId: s.workOrderId,
        media: s.media?.map((m) => ({ kind: m.kind, filePath: m.filePath })) ?? [],
      },
      href: wo?.id ? `/work-orders/${wo.id}` : `/work-orders/${s.workOrderId}`,
    });
  }

  timeline.sort((a, b) => a.at.getTime() - b.at.getTime());

  const activeEquipments = bus.equipments.filter((e) => e.active).length;
  const totalEquipments = bus.equipments.length;

  const totalCases = bus.cases.length;
  const casesWithWo = bus.cases.filter((c) => Boolean(c.workOrder?.id)).length;
  const busComments = bus.lifecycle
    .filter((e) => e.eventType === "BUS_COMMENT")
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  const stepsByWorkOrder = new Map<
    string,
    Array<{
      id: string;
      stepType: string;
      createdAt: Date;
      media: Array<{ id: string; kind: string; filePath: string; createdAt: Date }>;
    }>
  >();
  for (const step of woSteps) {
    const list = stepsByWorkOrder.get(step.workOrderId) ?? [];
    list.push(step);
    stepsByWorkOrder.set(step.workOrderId, list);
  }

  const caseFolders = bus.cases.map((c) => {
    const wo = c.workOrder;
    const attachments: Array<{ label: string; href: string; at?: Date | null }> = [];

    if (wo?.orderFilePath) {
      attachments.push({
        label: wo.orderFileName?.trim() || "Archivo de OT",
        href: `/api/uploads/${wo.orderFilePath}`,
        at: wo.orderFileUpdatedAt ?? null,
      });
    }

    const finalizada = wo?.status === "FINALIZADA";
    if (
      wo?.id &&
      finalizada &&
      (c.type === "PREVENTIVO" || c.type === "CORRECTIVO" || c.type === "RENOVACION_TECNOLOGICA" || c.type === "MEJORA_PRODUCTO")
    ) {
      const kind =
        c.type === "PREVENTIVO"
          ? "PREVENTIVE"
          : c.type === "CORRECTIVO"
          ? "CORRECTIVE"
          : "RENEWAL";
      attachments.push({
        label: "Formulario OT (PDF)",
        href: `/api/work-orders/${wo.id}/report-pdf?kind=${kind}`,
        at: wo.finishedAt ?? wo.startedAt ?? wo.assignedAt ?? c.createdAt,
      });
      if (c.type === "CORRECTIVO") {
        attachments.push({
          label: "Formulario correctivo (Word STS)",
          href: `/api/work-orders/${wo.id}/corrective-docx`,
          at: wo.finishedAt ?? wo.startedAt ?? wo.assignedAt ?? c.createdAt,
        });
      }
    }

    if (wo?.id && wo.interventionReceipt?.id) {
      attachments.push({
        label: "Recibo de intervención (PDF)",
        href: `/api/work-orders/${wo.id}/receipt-pdf`,
        at: wo.finishedAt ?? null,
      });
    }

    if (wo?.id && finalizada && (c.type === "RENOVACION_TECNOLOGICA" || c.type === "MEJORA_PRODUCTO")) {
      attachments.push({
        label: "Acta de cambios (Word)",
        href: `/api/work-orders/${wo.id}/renewal-acta`,
        at: wo.finishedAt ?? null,
      });
    }

    if (wo?.id && finalizada && c.type === "CORRECTIVO" && wo.correctiveReport?.procedureType === ProcedureType.CAMBIO_COMPONENTE) {
      attachments.push({
        label: "Acta de cambio de equipo (Word)",
        href: `/api/work-orders/${wo.id}/corrective-acta`,
        at: wo.finishedAt ?? null,
      });
    }

    const stepList = wo?.id ? (stepsByWorkOrder.get(wo.id) ?? []) : [];
    let mediaIndex = 0;
    for (const step of stepList) {
      for (const media of step.media ?? []) {
        mediaIndex += 1;
        attachments.push({
          label: `${step.stepType} · ${media.kind} · adjunto ${String(mediaIndex).padStart(2, "0")}`,
          href: `/api/uploads/${media.filePath}`,
          at: media.createdAt ?? step.createdAt,
        });
      }
    }

    return {
      caseId: c.id,
      caseNo: c.caseNo,
      caseTitle: c.title,
      caseType: c.type,
      hasWorkOrder: Boolean(wo?.id),
      workOrderId: wo?.id ?? null,
      workOrderNo: wo?.workOrderNo ?? null,
      workOrderDate: wo?.finishedAt ?? wo?.startedAt ?? wo?.assignedAt ?? c.createdAt,
      attachments,
    };
  });

  return (
    <div className="mobile-page-shell">
      <header className="mobile-page-header">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 lg:flex-row lg:items-start lg:justify-between lg:px-6 lg:py-0">
          <div className="min-w-0 space-y-1">
            <h1 className="truncate text-lg font-semibold tracking-tight lg:text-3xl">
              Hoja de vida • Bus {bus.code} {bus.plate ? `• ${bus.plate}` : ""}
            </h1>
            <p className="truncate text-xs text-muted-foreground lg:text-sm">
              Bus <span className="font-mono">{bus.id}</span> • Creado {fmtDate(bus.createdAt)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusPill
              status={bus.active ? "activo" : "cancelado"}
              label={bus.active ? "Activo" : "Inactivo"}
            />
            <a
              className="sts-btn-ghost text-sm"
              href={`/api/buses/${bus.id}/life-pdf`}
              target="_blank"
              rel="noreferrer"
            >
              Exportar PDF
            </a>
            <Link className="sts-btn-ghost text-sm" href="/buses">
              Volver
            </Link>
            <Link className="sts-btn-primary text-sm" href="/cases/new">
              Crear caso
            </Link>
          </div>
        </div>
      </header>

      <div className="mobile-page-content max-w-6xl lg:px-6">
        <div className="mobile-kpi-grid md:grid-cols-4">
          <div className="sts-card p-4">
          <p className="text-xs text-muted-foreground">Equipos</p>
          <p className="mt-1 text-lg font-semibold">{totalEquipments}</p>
          <p className="text-xs text-muted-foreground">{activeEquipments} activos</p>
        </div>
        <div className="sts-card p-4">
          <p className="text-xs text-muted-foreground">Casos recientes</p>
          <p className="mt-1 text-lg font-semibold">{totalCases}</p>
          <p className="text-xs text-muted-foreground">últimos 5</p>
        </div>
        <div className="sts-card p-4">
          <p className="text-xs text-muted-foreground">OT asociadas</p>
          <p className="mt-1 text-lg font-semibold">{casesWithWo}</p>
          <p className="text-xs text-muted-foreground">derivadas de casos</p>
        </div>
        <div className="sts-card p-4">
          <p className="text-xs text-muted-foreground">Eventos timeline</p>
          <p className="mt-1 text-lg font-semibold">{timeline.length}</p>
          <p className="text-xs text-muted-foreground">bus + casos + OT</p>
        </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
        {/* Izquierda */}
        <div className="lg:col-span-2 space-y-6">
          {/* Inventario */}
          <section className="sts-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Inventario de equipos</h2>
              <p className="text-xs text-muted-foreground">{bus.equipments.length} registros</p>
            </div>

            <div className="mt-4">
              {bus.equipments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin equipos asociados.</p>
              ) : (
                <>
                  <div className="lg:hidden">
                    <div className="mobile-list-stack">
                      {bus.equipments.map((e) => (
                        <article key={e.id} className="rounded-xl border border-border/60 bg-card p-4">
                          <div className="space-y-2 text-sm">
                            <div className="flex items-start justify-between gap-3">
                              <span className="text-xs uppercase text-muted-foreground">Tipo</span>
                              <span className="min-w-0 max-w-[72%] break-words text-right font-medium">
                                {displayInventoryText(e.equipmentType.name)}
                              </span>
                            </div>
                            <div className="flex items-start justify-between gap-3">
                              <span className="text-xs uppercase text-muted-foreground">Marca / Modelo</span>
                              <span className="min-w-0 max-w-[72%] break-words text-right">
                                {displayBrandModel(e.brand, e.model)}
                              </span>
                            </div>
                            <div className="flex items-start justify-between gap-3">
                              <span className="text-xs uppercase text-muted-foreground">Serial</span>
                              <span className="min-w-0 max-w-[72%] break-all text-right">
                                {displayInventoryText(e.serial)}
                              </span>
                            </div>
                            <div className="flex items-start justify-between gap-3">
                              <span className="text-xs uppercase text-muted-foreground">IP</span>
                              <span className="min-w-0 max-w-[72%] break-all text-right text-xs text-muted-foreground">
                                {e.ipAddress ?? "—"}
                              </span>
                            </div>
                            <div className="flex items-start justify-between gap-3">
                              <span className="text-xs uppercase text-muted-foreground">Estado</span>
                              <StatusPill
                                status={e.active ? "activo" : "cancelado"}
                                label={e.active ? "Activo" : "Inactivo"}
                                size="sm"
                              />
                            </div>
                          </div>
                          <div className="mt-3">
                            <Link className="sts-btn-ghost inline-flex h-10 w-full items-center justify-center text-sm" href={`/equipments/${e.id}`}>
                              Ver hoja de vida
                            </Link>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>

                  <div className="hidden lg:block">
                    <DataTable>
                      <DataTableHeader>
                        <DataTableRow>
                          <DataTableHead>Tipo</DataTableHead>
                          <DataTableHead>Marca</DataTableHead>
                          <DataTableHead>Modelo</DataTableHead>
                          <DataTableHead>Serial</DataTableHead>
                          <DataTableHead>IP equipo</DataTableHead>
                          <DataTableHead>Estado</DataTableHead>
                          <DataTableHead className="text-right">Acción</DataTableHead>
                        </DataTableRow>
                      </DataTableHeader>
                      <DataTableBody>
                        {bus.equipments.map((e) => (
                          <DataTableRow key={e.id}>
                            <DataTableCell>
                              <span className="block max-w-[18rem] truncate font-medium" title={displayInventoryText(e.equipmentType.name)}>
                                {displayInventoryText(e.equipmentType.name)}
                              </span>
                            </DataTableCell>
                            <DataTableCell>
                              <span className="block max-w-[12rem] truncate" title={displayInventoryText(e.brand)}>
                                {displayInventoryText(e.brand)}
                              </span>
                            </DataTableCell>
                            <DataTableCell>
                              <span className="block max-w-[12rem] truncate" title={displayInventoryText(e.model)}>
                                {displayInventoryText(e.model)}
                              </span>
                            </DataTableCell>
                            <DataTableCell>
                              <span className="block max-w-[12rem] truncate" title={displayInventoryText(e.serial)}>
                                {displayInventoryText(e.serial)}
                              </span>
                            </DataTableCell>
                            <DataTableCell className="text-xs text-muted-foreground">{e.ipAddress ?? "—"}</DataTableCell>
                            <DataTableCell>
                              <StatusPill
                                status={e.active ? "activo" : "cancelado"}
                                label={e.active ? "Activo" : "Inactivo"}
                                size="sm"
                              />
                            </DataTableCell>
                            <DataTableCell className="text-right whitespace-nowrap">
                              <Link className="sts-btn-ghost h-8 px-3 text-xs data-table-row-action" href={`/equipments/${e.id}`}>
                                Ver hoja de vida
                              </Link>
                            </DataTableCell>
                          </DataTableRow>
                        ))}
                      </DataTableBody>
                    </DataTable>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Casos */}
          <section className="sts-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Casos recientes</h2>
              <p className="text-xs text-muted-foreground">últimos {bus.cases.length}</p>
            </div>

            <div className="mt-4">
              {bus.cases.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay casos para este bus.</p>
              ) : (
                <>
                  <div className="lg:hidden">
                    <div className="mobile-list-stack">
                      {bus.cases.map((c) => (
                        <article key={c.id} className="rounded-xl border border-border/60 bg-card p-4">
                          <p className="text-xs text-muted-foreground">{fmtDate(c.createdAt)}</p>
                          <p className="mt-1 text-sm font-semibold break-words">{c.title}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <TypeBadge type={c.type} />
                            <PriorityBadge priority={c.priority} size="sm" />
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <StatusPill
                              status={mapCaseStatus(c.status)}
                              label={labelFromMap(c.status, caseStatusLabels)}
                              size="sm"
                              pulse={c.status === "EN_EJECUCION" || c.status === "OT_ASIGNADA"}
                            />
                            {c.workOrder ? (
                              <StatusPill
                                status={mapWorkOrderStatus(c.workOrder.status)}
                                label={labelFromMap(c.workOrder.status, workOrderStatusLabels)}
                                size="sm"
                                pulse={c.workOrder.status === "EN_CAMPO" || c.workOrder.status === "EN_VALIDACION"}
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">Sin OT</span>
                            )}
                          </div>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <Link className="sts-btn-ghost inline-flex h-10 w-full items-center justify-center text-sm" href={`/cases/${c.id}`}>
                              Abrir caso
                            </Link>
                            {c.workOrder?.id ? (
                              <Link className="sts-btn-ghost inline-flex h-10 w-full items-center justify-center text-sm" href={`/work-orders/${c.workOrder.id}`}>
                                Abrir OT
                              </Link>
                            ) : null}
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>

                  <div className="hidden lg:block">
                    <DataTable>
                      <DataTableHeader>
                        <DataTableRow>
                          <DataTableHead>Fecha</DataTableHead>
                          <DataTableHead>Título</DataTableHead>
                          <DataTableHead>Tipo</DataTableHead>
                          <DataTableHead>Estado</DataTableHead>
                          <DataTableHead>OT</DataTableHead>
                          <DataTableHead className="text-right">Acción</DataTableHead>
                        </DataTableRow>
                      </DataTableHeader>
                      <DataTableBody>
                        {bus.cases.map((c) => (
                          <DataTableRow key={c.id}>
                            <DataTableCell className="whitespace-nowrap">{fmtDate(c.createdAt)}</DataTableCell>
                            <DataTableCell>
                              <div className="flex flex-col gap-1">
                                <span className="font-medium">{c.title}</span>
                                <PriorityBadge priority={c.priority} size="sm" />
                              </div>
                            </DataTableCell>
                            <DataTableCell>
                              <TypeBadge type={c.type} />
                            </DataTableCell>
                            <DataTableCell>
                              <StatusPill
                                status={mapCaseStatus(c.status)}
                                label={labelFromMap(c.status, caseStatusLabels)}
                                size="sm"
                                pulse={c.status === "EN_EJECUCION" || c.status === "OT_ASIGNADA"}
                              />
                            </DataTableCell>
                            <DataTableCell>
                              {c.workOrder ? (
                                <StatusPill
                                  status={mapWorkOrderStatus(c.workOrder.status)}
                                  label={labelFromMap(c.workOrder.status, workOrderStatusLabels)}
                                  size="sm"
                                  pulse={c.workOrder.status === "EN_CAMPO" || c.workOrder.status === "EN_VALIDACION"}
                                />
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </DataTableCell>
                            <DataTableCell className="text-right whitespace-nowrap">
                              <Link className="sts-btn-ghost h-8 px-3 text-xs data-table-row-action" href={`/cases/${c.id}`}>
                                Abrir caso
                              </Link>
                              {c.workOrder?.id ? (
                                <Link className="ml-2 sts-btn-ghost h-8 px-3 text-xs data-table-row-action" href={`/work-orders/${c.workOrder.id}`}>
                                  Abrir OT
                                </Link>
                              ) : null}
                            </DataTableCell>
                          </DataTableRow>
                        ))}
                      </DataTableBody>
                    </DataTable>
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="sts-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Novedades presentadas</h2>
              <p className="text-xs text-muted-foreground">{novedadRows.length} registros</p>
            </div>

            <div className="mt-4">
              {novedadRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay novedades registradas para este bus.</p>
              ) : (
                <>
                  <div className="lg:hidden">
                    <div className="mobile-list-stack">
                      {novedadRows.map((item) => (
                        <article key={item.noveltyCase.id} className="rounded-xl border border-border/60 bg-card p-4">
                          <p className="text-xs text-muted-foreground">
                            {item.batchRef} · {fmtDate(item.noveltyCase.createdAt)}
                          </p>
                          <p className="mt-1 text-sm font-semibold break-words">{item.reportedNovelty}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.affectedEquipment}
                            {item.catalogCode ? ` · ${item.catalogCode}` : ""}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <StatusPill
                              status={mapCaseStatus(item.noveltyCase.status)}
                              label={labelFromMap(item.noveltyCase.status, caseStatusLabels)}
                              size="sm"
                            />
                            {item.linkedCorrective ? (
                              <StatusPill
                                status={mapCaseStatus(item.linkedCorrective.status)}
                                label={`Correctivo: ${labelFromMap(item.linkedCorrective.status, caseStatusLabels)}`}
                                size="sm"
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">Sin correctivo asociado</span>
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {item.linkedCorrective?.workOrder ? (
                              <StatusPill
                                status={mapWorkOrderStatus(item.linkedCorrective.workOrder.status)}
                                label={`OT: ${labelFromMap(item.linkedCorrective.workOrder.status, workOrderStatusLabels)}`}
                                size="sm"
                              />
                            ) : null}
                            {item.linkedCorrective?.stsTicket ? (
                              <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                                Ticket: {labelFromMap(item.linkedCorrective.stsTicket.status, stsStatusLabels)}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <Link className="sts-btn-ghost inline-flex h-10 w-full items-center justify-center text-sm" href={`/cases/${item.noveltyCase.id}`}>
                              Abrir novedad
                            </Link>
                            {item.linkedCorrective ? (
                              <Link className="sts-btn-ghost inline-flex h-10 w-full items-center justify-center text-sm" href={`/cases/${item.linkedCorrective.id}`}>
                                Abrir correctivo
                              </Link>
                            ) : null}
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>

                  <div className="hidden lg:block">
                    <DataTable>
                      <DataTableHeader>
                        <DataTableRow>
                          <DataTableHead>Lote</DataTableHead>
                          <DataTableHead>Novedad reportada</DataTableHead>
                          <DataTableHead>Caso novedad</DataTableHead>
                          <DataTableHead>Correctivo</DataTableHead>
                          <DataTableHead>OT / Ticket</DataTableHead>
                          <DataTableHead className="text-right">Acción</DataTableHead>
                        </DataTableRow>
                      </DataTableHeader>
                      <DataTableBody>
                        {novedadRows.map((item) => (
                          <DataTableRow key={item.noveltyCase.id}>
                            <DataTableCell>
                              <div className="flex flex-col gap-1">
                                <span className="text-xs font-medium">{item.batchRef}</span>
                                <span className="text-xs text-muted-foreground">{fmtDate(item.noveltyCase.createdAt)}</span>
                              </div>
                            </DataTableCell>
                            <DataTableCell>
                              <div className="space-y-1">
                                <p className="text-sm font-medium break-words">{item.reportedNovelty}</p>
                                <p className="text-xs text-muted-foreground">
                                  {item.affectedEquipment}
                                  {item.catalogCode ? ` · ${item.catalogCode}` : ""}
                                </p>
                              </div>
                            </DataTableCell>
                            <DataTableCell>
                              <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">{fmtCaseNo(item.noveltyCase.caseNo)}</p>
                                <StatusPill
                                  status={mapCaseStatus(item.noveltyCase.status)}
                                  label={labelFromMap(item.noveltyCase.status, caseStatusLabels)}
                                  size="sm"
                                />
                              </div>
                            </DataTableCell>
                            <DataTableCell>
                              {item.linkedCorrective ? (
                                <div className="space-y-1">
                                  <p className="text-xs text-muted-foreground">{fmtCaseNo(item.linkedCorrective.caseNo)}</p>
                                  <StatusPill
                                    status={mapCaseStatus(item.linkedCorrective.status)}
                                    label={labelFromMap(item.linkedCorrective.status, caseStatusLabels)}
                                    size="sm"
                                  />
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">Pendiente</span>
                              )}
                            </DataTableCell>
                            <DataTableCell>
                              <div className="space-y-1">
                                {item.linkedCorrective?.workOrder ? (
                                  <StatusPill
                                    status={mapWorkOrderStatus(item.linkedCorrective.workOrder.status)}
                                    label={labelFromMap(item.linkedCorrective.workOrder.status, workOrderStatusLabels)}
                                    size="sm"
                                  />
                                ) : (
                                  <span className="text-xs text-muted-foreground">Sin OT</span>
                                )}
                                {item.linkedCorrective?.stsTicket ? (
                                  <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                                    {labelFromMap(item.linkedCorrective.stsTicket.status, stsStatusLabels)}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Sin ticket</span>
                                )}
                              </div>
                            </DataTableCell>
                            <DataTableCell className="text-right whitespace-nowrap">
                              <Link className="sts-btn-ghost h-8 px-3 text-xs data-table-row-action" href={`/cases/${item.noveltyCase.id}`}>
                                Abrir novedad
                              </Link>
                              {item.linkedCorrective ? (
                                <Link className="ml-2 sts-btn-ghost h-8 px-3 text-xs data-table-row-action" href={`/cases/${item.linkedCorrective.id}`}>
                                  Abrir correctivo
                                </Link>
                              ) : null}
                            </DataTableCell>
                          </DataTableRow>
                        ))}
                      </DataTableBody>
                    </DataTable>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Timeline */}
          <section className="sts-card p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-base font-semibold">Trazabilidad (timeline)</h2>
                <p className="text-xs text-muted-foreground">
                  {timelineLifecycle.length} eventos bus • {timelineCaseEvents.length} eventos caso • {timelineWoSteps.length} pasos OT
                </p>
                {selectedCase ? (
                  <p className="mt-1 text-xs text-primary">
                    Filtro activo: {fmtCaseNo(selectedCase.caseNo)} · {selectedCase.title}
                  </p>
                ) : null}
              </div>
              <BusTimelineCaseFilter
                selectedCaseId={selectedCaseId}
                cases={bus.cases.map((c) => ({ id: c.id, caseNo: c.caseNo, title: c.title }))}
              />
            </div>

            <div className="mt-4 space-y-3">
              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay eventos para mostrar.</p>
              ) : (
                timeline.map((it, idx) => (
                  <div key={`${it.kind}-${idx}`} className="sts-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {it.kind}
                          </span>
                          <p className="text-sm font-semibold">{it.title}</p>
                        </div>

                        {it.message ? (
                          <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{it.message}</p>
                        ) : null}

                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          {it.meta?.busEquipmentId ? (
                            <span>Equipo: {equipmentNameById.get(it.meta.busEquipmentId) ?? it.meta.busEquipmentId}</span>
                          ) : null}
                          {it.meta?.caseId ? (
                            <span>Caso: {caseTitleById.get(it.meta.caseId) ?? it.meta.caseId}</span>
                          ) : null}
                        </div>

                        {it.href ? (
                          <div className="mt-2">
                            <Link className="text-xs underline" href={it.href}>
                              Abrir
                            </Link>
                          </div>
                        ) : null}
                      </div>

                      <p className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(it.at)}</p>
                    </div>

                    {it.meta?.media?.length ? (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {it.meta.media.map((m: any, idx: number) =>
                          isImageFilePath(m.filePath) ? (
                            <img
                              key={`${m.filePath}-${idx}`}
                              src={`/api/uploads/${m.filePath}`}
                              alt={m.kind ?? "Evidencia"}
                              className="h-40 w-full rounded-md border object-cover"
                            />
                          ) : (
                            <a
                              key={`${m.filePath}-${idx}`}
                              href={`/api/uploads/${m.filePath}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-12 items-center justify-center rounded-md border px-3 text-sm"
                            >
                              Abrir archivo adjunto
                            </a>
                          )
                        )}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="sts-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Carpetas por caso</h2>
              <p className="text-xs text-muted-foreground">{caseFolders.length} casos</p>
            </div>

            <div className="mt-4 space-y-3">
              {caseFolders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay casos para este bus.</p>
              ) : (
                caseFolders.map((folder) => (
                  <details key={folder.caseId} className="rounded-lg border border-border/60 bg-card p-3">
                    <summary className="cursor-pointer list-none">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {fmtCaseNo(folder.caseNo)} · {folder.hasWorkOrder ? fmtWoNo(folder.workOrderNo) : "Sin OT"} · {fmtDate(folder.workOrderDate)}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {labelFromMap(folder.caseType, caseTypeLabels)} · {folder.caseTitle}
                          </p>
                        </div>
                        <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                          {folder.attachments.length} archivo(s)
                        </span>
                      </div>
                    </summary>

                    <div className="mt-3 space-y-2 border-t border-border/50 pt-3">
                      <div className="flex flex-wrap gap-2">
                        <Link className="sts-btn-ghost h-8 px-3 text-xs" href={`/cases/${folder.caseId}`}>
                          Abrir caso
                        </Link>
                        {folder.workOrderId ? (
                          <Link className="sts-btn-ghost h-8 px-3 text-xs" href={`/work-orders/${folder.workOrderId}`}>
                            Abrir OT
                          </Link>
                        ) : null}
                      </div>

                      {folder.attachments.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          {folder.hasWorkOrder ? "Sin adjuntos para esta OT." : "Caso sin OT asociada todavía."}
                        </p>
                      ) : (
                        folder.attachments.map((att, idx) => (
                          <a
                            key={`${att.href}-${idx}`}
                            href={att.href}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2 text-sm hover:bg-muted/40"
                          >
                            <span className="min-w-0 truncate">{att.label}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {att.at ? fmtDate(att.at) : ""}
                            </span>
                          </a>
                        ))
                      )}
                    </div>
                  </details>
                ))
              )}
            </div>
          </section>
        </div>

        {/* Derecha: panel rápido */}
        <div className="space-y-6">
          <section className="sts-card p-5">
            <h2 className="text-base font-semibold">Acciones rápidas</h2>
            <div className="mt-3 space-y-2">
              <Link
                className="inline-flex w-full items-center justify-center sts-btn-primary text-sm"
                href="/cases/new"
              >
                Crear caso para este bus
              </Link>
              <Link className="inline-flex w-full items-center justify-center sts-btn-ghost text-sm" href="/cases">
                Ir a bandeja de casos
              </Link>
              <Link className="inline-flex w-full items-center justify-center sts-btn-ghost text-sm" href="/buses">
                Volver a listado buses
              </Link>
            </div>
          </section>

          <section className="sts-card p-5">
            <h2 className="text-base font-semibold">Resumen</h2>
            <div className="mt-3 space-y-2 text-sm">
              <div className="sts-card p-3">
                <p className="text-xs text-muted-foreground">Bus</p>
                <p className="mt-1 font-medium">{bus.code}</p>
                <p className="text-xs text-muted-foreground">{bus.plate ?? "Sin placa"}</p>
                <p className="mt-2 text-xs text-muted-foreground">SmartHelios</p>
                {smartHeliosUrl ? (
                  <div className="mt-1 flex flex-col gap-1">
                    <a
                      href={smartHeliosUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                    >
                      Abrir enlace
                    </a>
                    <p className="text-[11px] text-muted-foreground break-all">{smartHeliosText}</p>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">—</p>
                )}
                <p className="text-xs text-muted-foreground">IP SIM: {bus.ipSimcard ?? "—"}</p>
              </div>

              <div className="sts-card p-3">
                <p className="text-xs text-muted-foreground">Estado</p>
                <p className="mt-1 font-medium">{bus.active ? "Activo" : "Inactivo"}</p>
              </div>

              <div className="sts-card p-3">
                <p className="text-xs text-muted-foreground">Equipos activos</p>
                <p className="mt-1 font-medium">
                  {activeEquipments} / {totalEquipments}
                </p>
              </div>
            </div>
          </section>

          <BusCommentsCard
            busId={bus.id}
            comments={busComments.map((c) => ({
              id: c.id,
              summary: c.summary,
              occurredAt: c.occurredAt.toISOString(),
            }))}
          />
        </div>
      </div>
      </div>
    </div>
  );
}
