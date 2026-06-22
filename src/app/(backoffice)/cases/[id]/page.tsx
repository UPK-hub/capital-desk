import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CaseEventType, CaseType, ProcedureType, Role } from "@prisma/client";
import { CAPABILITIES } from "@/lib/capabilities";
import { buildCaseAccessWhere } from "@/lib/access-control";
import {
  caseStatusLabels,
  caseTypeLabels,
  labelFromMap,
  videoDeliveryLabels,
  videoOriginLabels,
  workOrderStatusLabels,
} from "@/lib/labels";
import AssignTechnicianCard from "./ui/AssignTechnicianCard";
import ValidateWorkOrderCard from "./ui/ValidateWorkOrderCard";
import WorkOrderFileUploadCard from "./ui/WorkOrderFileUploadCard";
import NovedadTraceCard from "./ui/NovedadTraceCard";
import LinkedCasesCard from "./ui/LinkedCasesCard";
import CaseCommentsCard from "./ui/CaseCommentsCard";
import EditCaseTitleCard from "./ui/EditCaseTitleCard";
import EvidenciasCard, { type EvidenceItem, type EvidenceKind } from "./ui/EvidenciasCard";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { StatusPill } from "@/components/ui/status-pill";
import { TypeBadge } from "@/components/ui/TypeBadge";
import { CheckCircle2, FileText } from "lucide-react";
import DeleteCaseButton from "./ui/DeleteCaseButton";
import VideoCamerasFolders from "./ui/VideoCamerasFolders";

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

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".heic", ".heif", ".svg"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".avi", ".mkv", ".webm"]);

function evidenceKindFor(name: string, mime?: string | null): EvidenceKind {
  const m = String(mime ?? "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m === "application/pdf") return "pdf";
  if (m.startsWith("video/")) return "video";
  const lower = String(name ?? "").toLowerCase();
  const dot = lower.lastIndexOf(".");
  const ext = dot >= 0 ? lower.slice(dot) : "";
  if (IMAGE_EXT.has(ext)) return "image";
  if (ext === ".pdf") return "pdf";
  if (VIDEO_EXT.has(ext)) return "video";
  return "other";
}

function mapCaseStatusForPill(status: string) {
  if (status === "NUEVO") return "nuevo" as const;
  if (status === "OT_ASIGNADA" || status === "EN_EJECUCION") return "en_ejecucion" as const;
  if (status === "RESUELTO" || status === "CERRADO") return "completado" as const;
  return "nuevo" as const;
}

const CASE_EVENT_LABELS: Record<CaseEventType, string> = {
  CREATED: "Caso creado",
  ASSIGNED: "Asignacion",
  NOTIFIED: "Notificacion",
  STATUS_CHANGE: "Cambio de estado",
  COMMENT: "Comentario",
};

type NovedadStateSnapshot = {
  batchRef: string | null;
  catalogCode: string;
  affectedEquipment: string;
  reportedNovelty: string;
  observations: string;
  evidencePath: string | null;
  evidenceName: string | null;
};

function getNovedadStateSnapshot(c: {
  type: CaseType;
  title: string;
  description: string;
  events: Array<{ meta: unknown }>;
}): NovedadStateSnapshot | null {
  for (let i = c.events.length - 1; i >= 0; i -= 1) {
    const meta = (c.events[i].meta ?? {}) as any;
    const state = meta?.noveltyState;
    if (state && typeof state === "object") {
      return {
        batchRef: state.batchRef ? String(state.batchRef) : null,
        catalogCode: String(state.catalogCode ?? ""),
        affectedEquipment: String(state.affectedEquipment ?? ""),
        reportedNovelty: String(state.reportedNovelty ?? ""),
        observations: String(state.observations ?? ""),
        evidencePath: state?.evidence?.filePath ? String(state.evidence.filePath) : null,
        evidenceName: state?.evidence?.fileName ? String(state.evidence.fileName) : null,
      };
    }
  }

  const titleParts = c.title.split(" - ");
  const fallbackReportedNovelty = titleParts.length > 1 ? titleParts.slice(1).join(" - ").trim() : c.title;
  return {
    batchRef: null,
    catalogCode: "",
    affectedEquipment: "",
    reportedNovelty: fallbackReportedNovelty,
    observations: "",
    evidencePath: null,
    evidenceName: null,
  };
}

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
  const caps = (session.user as any).capabilities as string[] | undefined;
  const userId = String((session.user as any).id ?? "");
  const isVideosOnly = role === Role.BACKOFFICE && caps?.includes(CAPABILITIES.VIDEOS_ONLY);
  const canAssign =
    role === Role.ADMIN || (role === Role.BACKOFFICE && caps?.includes(CAPABILITIES.CASE_ASSIGN));

  if (
    isVideosOnly ||
    (role !== Role.ADMIN &&
      role !== Role.BACKOFFICE &&
      role !== Role.PLANNER &&
      role !== Role.SUPERVISOR)
  ) {
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
    where: buildCaseAccessWhere({
      caseId: params.id,
      tenantId,
      role,
      capabilities: caps,
      userId,
    }),
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
          correctiveReport: {
            select: {
              procedureType: true,
              photoBodyworkDismount: true,
              photoSerialCurrent: true,
              photoSerialNew: true,
            },
          },
          preventiveReport: { select: { activities: true } },
          renewalTechReport: { select: { photosOld: true, photosNew: true, photosChecklist: true } },
          steps: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              stepType: true,
              createdAt: true,
              media: { select: { id: true, kind: true, filePath: true, createdAt: true } },
            },
          },
        },
      },
      events: { orderBy: { createdAt: "asc" }, take: 200 },
      videoDownloadRequest: {
        include: {
          attachments: {
            where: { active: true },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              camera: true,
              kind: true,
              filePath: true,
              originalName: true,
              createdAt: true,
            },
          },
          cameraResults: {
            orderBy: { camera: "asc" },
            select: { camera: true, status: true, rootCause: true },
          },
        },
      },
      chatMessages: {
        orderBy: { createdAt: "asc" },
        take: 300,
        select: { id: true, senderId: true, meta: true, createdAt: true },
      },
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

  const technicians = canAssign
    ? await prisma.user.findMany({
        where: { tenantId, active: true, role: Role.TECHNICIAN },
        orderBy: { name: "asc" },
        select: { id: true, name: true, email: true },
      })
    : [];

  const users = await prisma.user.findMany({
    where: { tenantId, active: true },
    select: { id: true, name: true, role: true, email: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));
  const caseComments = c.events
    .filter((event) => {
      if (event.type !== CaseEventType.COMMENT) return false;
      const meta = (event.meta ?? {}) as any;
      return Boolean(meta?.manualComment);
    })
    .slice()
    .reverse()
    .map((event) => {
      const meta = (event.meta ?? {}) as any;
      const actorId = String(meta.userId ?? meta.by ?? "").trim();
      const actor = actorId ? userById.get(actorId) : null;
      return {
        id: event.id,
        message: event.message ?? "",
        createdAt: event.createdAt.toISOString(),
        author: actor ? actor.name : null,
      };
    });

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
  const renewalActaLabel = "Descargar acta de cambios";
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

  const canEditNovedad =
    role === Role.ADMIN ||
    role === Role.BACKOFFICE ||
    role === Role.PLANNER ||
    role === Role.SUPERVISOR;
  const hasNovedadMeta = c.events.some((event) => {
    const meta = (event.meta ?? {}) as any;
    return Boolean(meta?.noveltyState);
  });
  const showNovedadCard = c.type === CaseType.NOVEDAD || hasNovedadMeta;
  const novedadSnapshot = showNovedadCard ? getNovedadStateSnapshot(c) : null;
  const linkedCorrectiveForNovedad =
    showNovedadCard && c.type === CaseType.NOVEDAD
      ? await prisma.case.findFirst({
          where: {
            tenantId,
            type: CaseType.CORRECTIVO,
            events: {
              some: {
                meta: { path: ["sourceCaseId"], equals: c.id },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            workOrder: { select: { id: true } },
          },
        })
      : null;

  const linkedCasesForNovedad =
    c.type === CaseType.NOVEDAD
      ? await prisma.case.findMany({
          where: {
            tenantId,
            type: { in: [CaseType.CORRECTIVO, CaseType.PREVENTIVO] },
            events: {
              some: {
                meta: { path: ["sourceCaseId"], equals: c.id },
              },
            },
          },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            caseNo: true,
            type: true,
            status: true,
            workOrder: { select: { id: true } },
            events: { orderBy: { createdAt: "asc" }, select: { meta: true } },
          },
        })
      : [];

  const linkedCasesView = linkedCasesForNovedad.map((lc) => {
    const manual = lc.events.some((ev) => {
      const meta = (ev.meta ?? {}) as any;
      return Boolean(meta?.sourceCaseId === c.id && meta?.manual);
    });
    return {
      id: lc.id,
      caseNo: lc.caseNo,
      type: lc.type as "CORRECTIVO" | "PREVENTIVO",
      typeLabel: labelFromMap(lc.type, caseTypeLabels),
      status: lc.status,
      statusLabel: labelFromMap(lc.status, caseStatusLabels),
      workOrderId: lc.workOrder?.id ?? null,
      manual,
    };
  });

  // ---- MEJORA 4: permiso para editar el titulo ----
  const canEditTitle =
    role === Role.ADMIN ||
    role === Role.BACKOFFICE ||
    role === Role.SUPERVISOR ||
    role === Role.PLANNER;

  // ---- MEJORAS 1 y 5: consolidar evidencias/adjuntos del caso ----
  const evidenceItems: EvidenceItem[] = [];

  // 1) Adjuntos del chat del caso (CaseChatMessage.meta), excluye los borrados.
  for (const m of c.chatMessages ?? []) {
    const meta = (m.meta ?? {}) as any;
    const filePath = meta?.filePath ? String(meta.filePath) : "";
    if (!filePath || meta?.deleted) continue;
    const name = String(meta?.filename ?? meta?.fileName ?? filePath.split("/").pop() ?? "Adjunto");
    const ownerId = String(meta?.userId ?? meta?.uploadedById ?? m.senderId ?? "");
    const canDelete = role === Role.ADMIN || (Boolean(ownerId) && ownerId === userId);
    evidenceItems.push({
      key: `chat-${m.id}`,
      source: "chat",
      sourceLabel: "Chat del caso",
      name,
      filePath,
      kind: evidenceKindFor(name, meta?.mime ?? meta?.mimeType),
      createdAt: m.createdAt.toISOString(),
      messageId: m.id,
      canDelete,
    });
  }

  // 2) Archivo de la OT (workOrder.orderFilePath / orderFileName).
  if (c.workOrder?.orderFilePath) {
    const name = String((c.workOrder as any).orderFileName ?? c.workOrder.orderFilePath.split("/").pop() ?? "Archivo OT");
    evidenceItems.push({
      key: `wo-file-${c.workOrder.id}`,
      source: "wo-file",
      sourceLabel: "Orden de trabajo",
      name,
      filePath: String(c.workOrder.orderFilePath),
      kind: evidenceKindFor(name, (c.workOrder as any).orderFileMimeType),
      createdAt: (c.workOrder as any).orderFileUpdatedAt
        ? new Date((c.workOrder as any).orderFileUpdatedAt).toISOString()
        : null,
    });
  }

  // 3) Medios de pasos de la OT (WorkOrderStep.media -> WorkOrderMedia).
  for (const step of c.workOrder?.steps ?? []) {
    for (const media of step.media ?? []) {
      if (!media.filePath) continue;
      const name = String(media.filePath.split("/").pop() ?? "Evidencia OT");
      evidenceItems.push({
        key: `wo-media-${media.id}`,
        source: "wo-media",
        sourceLabel: `OT · ${labelFromMap(media.kind, { FOTO_INICIO: "Foto inicio", FOTO_FIN: "Foto fin" })}`,
        name,
        filePath: String(media.filePath),
        kind: evidenceKindFor(name),
        createdAt: media.createdAt ? new Date(media.createdAt).toISOString() : null,
      });
    }
  }

  // 3b) Fotos de los informes (preventivo / correctivo / renovación).
  const woRep = c.workOrder as any;
  const prevActivities = Array.isArray(woRep?.preventiveReport?.activities) ? woRep.preventiveReport.activities : [];
  prevActivities.forEach((act: any, ai: number) => {
    const label = String(act?.activity ?? act?.key ?? "Actividad").trim() || "Actividad";
    const paths = Array.isArray(act?.photoPaths) ? act.photoPaths : [];
    paths.forEach((p: any, pi: number) => {
      const fp = String(p ?? "").trim();
      if (!fp) return;
      const name = String(fp.split("/").pop() ?? "Foto preventivo");
      evidenceItems.push({
        key: `prev-${ai}-${pi}`,
        source: "preventive-report",
        sourceLabel: `Preventivo · ${label}`,
        name,
        filePath: fp,
        kind: evidenceKindFor(name),
        createdAt: null,
      });
    });
  });
  const corrRep = woRep?.correctiveReport ?? null;
  const corrPhotos: Array<[string, unknown]> = [
    ["Desmonte / carrocería", corrRep?.photoBodyworkDismount],
    ["Serial actual", corrRep?.photoSerialCurrent],
    ["Serial nuevo", corrRep?.photoSerialNew],
  ];
  corrPhotos.forEach(([lbl, p], i) => {
    const fp = String(p ?? "").trim();
    if (!fp) return;
    const name = String(fp.split("/").pop() ?? "Foto correctivo");
    evidenceItems.push({
      key: `corr-${i}`,
      source: "corrective-report",
      sourceLabel: `Correctivo · ${lbl}`,
      name,
      filePath: fp,
      kind: evidenceKindFor(name),
      createdAt: null,
    });
  });
  const renRep = woRep?.renewalTechReport ?? null;
  const renGroups: Array<[string, unknown]> = [
    ["Antes", renRep?.photosOld],
    ["Después", renRep?.photosNew],
    ["Checklist", renRep?.photosChecklist],
  ];
  renGroups.forEach(([lbl, arr], gi) => {
    const list = Array.isArray(arr) ? arr : [];
    list.forEach((p: any, pi: number) => {
      const fp = String(p ?? "").trim();
      if (!fp) return;
      const name = String(fp.split("/").pop() ?? "Foto renovación");
      evidenceItems.push({
        key: `ren-${gi}-${pi}`,
        source: "renewal-report",
        sourceLabel: `Renovación · ${lbl}`,
        name,
        filePath: fp,
        kind: evidenceKindFor(name),
        createdAt: null,
      });
    });
  });

  // 4) Evidencia de novedad (noveltyState.evidence en CaseEvent.meta).
  const seenNoveltyEvidence = new Set<string>();
  for (const ev of c.events) {
    const meta = (ev.meta ?? {}) as any;
    const evidence = meta?.noveltyState?.evidence ?? meta?.evidence ?? null;
    const filePath = evidence?.filePath ? String(evidence.filePath) : "";
    if (!filePath || seenNoveltyEvidence.has(filePath)) continue;
    seenNoveltyEvidence.add(filePath);
    const name = String(evidence?.fileName ?? filePath.split("/").pop() ?? "Evidencia");
    evidenceItems.push({
      key: `novedad-${ev.id}`,
      source: "novedad",
      sourceLabel: "Evidencia novedad",
      name,
      filePath,
      kind: evidenceKindFor(name, evidence?.mimeType),
      createdAt: ev.createdAt.toISOString(),
    });
  }

  // Mas recientes primero.
  evidenceItems.sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });

  // Tarjeta de evidencias: visible para PREVENTIVO/CORRECTIVO y en general si hay adjuntos.
  const showEvidenceCard = evidenceItems.length > 0 || c.type === CaseType.PREVENTIVO || c.type === CaseType.CORRECTIVO;

  // ---- MEJORA 2: datos de la solicitud de video ----
  const vdr = c.videoDownloadRequest;

  return (
    <div className="mobile-page-shell">
      <header className="mobile-page-header sticky top-16 lg:static lg:top-auto">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 px-4 py-4 lg:flex-row lg:items-start lg:justify-between lg:px-6 lg:py-0">
          <div className="min-w-0 space-y-2">
            <EditCaseTitleCard caseId={c.id} initialTitle={c.title} canEdit={canEditTitle} />
            <p className="truncate text-xs leading-tight text-muted-foreground lg:text-sm">
              {fmtCaseNo(c.caseNo)} | Caso <span className="font-mono">{c.id}</span> | Creado {fmtDate(c.createdAt)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={c.type} label={labelFromMap(c.type, caseTypeLabels)} />
            <StatusPill
              status={mapCaseStatusForPill(c.status)}
              label={labelFromMap(c.status, caseStatusLabels)}
            />
            <PriorityBadge priority={c.priority} />
          </div>
        </div>
      </header>

      <div className="mobile-page-content max-w-[1600px] lg:px-6">
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
                  <div
                    className={`mt-1 inline-flex h-9 w-9 items-center justify-center rounded-xl ${
                      it.kind === "CASE" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {it.kind === "CASE" ? <FileText className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 rounded-2xl border border-border/65 bg-white p-4 shadow-[var(--shadow-card)]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium ${
                              it.kind === "CASE"
                                ? "border-blue-200/90 bg-blue-50 text-blue-700"
                                : "border-emerald-200/90 bg-emerald-50 text-emerald-700"
                            }`}
                          >
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

          {showEvidenceCard ? <EvidenciasCard caseId={c.id} items={evidenceItems} /> : null}
        </div>

        <div className="space-y-6">
          {isVideoCase ? (
            <>
              <section className="sts-card overflow-hidden">
                <div className="border-b border-border/50 bg-muted/20 p-5">
                  <h2 className="text-base font-semibold">Solicitud de video</h2>
                </div>

                {vdr ? (
                  <div className="grid gap-3 p-5 sm:grid-cols-2">
                    <div className="sm:col-span-2 rounded-lg border-2 border-border/60 bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">Cámaras solicitadas</p>
                      <p className="mt-1 text-sm font-medium whitespace-pre-wrap">{vdr.camerasRequested ?? "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Medio de entrega</p>
                      <p className="mt-1 text-sm font-medium">
                        {vdr.deliveryMethod ? labelFromMap(vdr.deliveryMethod, videoDeliveryLabels) : "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Procedencia</p>
                      <p className="mt-1 text-sm font-medium">
                        {vdr.origin ? labelFromMap(vdr.origin, videoOriginLabels) : "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Fecha evento inicio</p>
                      <p className="mt-1 text-sm font-medium">{vdr.eventStart ? fmtDate(vdr.eventStart) : "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Fecha evento fin</p>
                      <p className="mt-1 text-sm font-medium">{vdr.eventEnd ? fmtDate(vdr.eventEnd) : "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Solicitante</p>
                      <p className="mt-1 text-sm font-medium">{vdr.requesterName ?? "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Cargo</p>
                      <p className="mt-1 text-sm font-medium">{vdr.requesterRole ?? "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Vehículo</p>
                      <p className="mt-1 text-sm font-medium">{vdr.vehicleId ?? "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Tipo requerimiento</p>
                      <p className="mt-1 text-sm font-medium">{vdr.requestType ?? "-"}</p>
                    </div>
                    {vdr.tmsaRadicado ? (
                      <div>
                        <p className="text-xs text-muted-foreground">Radicado TMSA</p>
                        <p className="mt-1 text-sm font-medium">{vdr.tmsaRadicado}</p>
                      </div>
                    ) : null}
                    {vdr.tmsaFiledAt ? (
                      <div>
                        <p className="text-xs text-muted-foreground">Fecha radicado TMSA</p>
                        <p className="mt-1 text-sm font-medium">{fmtDate(vdr.tmsaFiledAt)}</p>
                      </div>
                    ) : null}
                    {vdr.concessionaireFiledAt ? (
                      <div>
                        <p className="text-xs text-muted-foreground">Fecha radicado concesionario</p>
                        <p className="mt-1 text-sm font-medium">{fmtDate(vdr.concessionaireFiledAt)}</p>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="p-5">
                    <p className="text-xs text-muted-foreground">Solicitud de video no disponible.</p>
                  </div>
                )}
              </section>

              {vdr ? (
                <VideoCamerasFolders
                  requestId={vdr.id}
                  caseNo={c.caseNo}
                  busCode={c.bus?.code ?? null}
                  camerasRequested={vdr.camerasRequested}
                  attachments={vdr.attachments}
                  cameraResults={vdr.cameraResults}
                  canManage={canEditNovedad}
                />
              ) : null}

              <section className="sts-card overflow-hidden">
                <div className="border-b border-border/50 bg-muted/20 p-5">
                  <h2 className="text-base font-semibold">Gestión de video</h2>
                </div>

                <div className="space-y-2 p-5">
                  <div className="sts-card p-3">
                    <p className="text-xs text-muted-foreground">Estado solicitud</p>
                    <p className="mt-1 text-sm font-medium">{vdr?.status ?? "-"}</p>
                  </div>

                  <div className="sts-card p-3">
                    <p className="text-xs text-muted-foreground">Estado descarga</p>
                    <p className="mt-1 text-sm font-medium">{vdr?.downloadStatus ?? "-"}</p>
                  </div>

                  {vdr ? (
                    <Link
                      href={`/video-requests/${vdr.id}`}
                      className="inline-flex w-full items-center justify-center sts-btn-primary text-sm"
                    >
                      Abrir gestion
                    </Link>
                  ) : (
                    <p className="text-xs text-muted-foreground">Solicitud de video no disponible.</p>
                  )}
                </div>
              </section>
            </>
          ) : (
            <>
              <section className="sts-card overflow-hidden">
                <div className="border-b border-border/50 bg-muted/20 p-5">
                  <h2 className="text-xl font-semibold">Orden de trabajo</h2>
                </div>

                <div className="space-y-2 p-5">
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
                          className="inline-flex w-full items-center justify-center sts-btn-ghost text-sm"
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
                          className="inline-flex w-full items-center justify-center sts-btn-ghost text-sm"
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
                          className="inline-flex w-full items-center justify-center sts-btn-ghost text-sm"
                          href={`/api/work-orders/${c.workOrder!.id}/corrective-acta`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Descargar acta de cambio de equipo
                        </a>
                      ) : null}
                      {c.type === "CORRECTIVO" &&
                      c.workOrder?.status === "FINALIZADA" ? (
                        <a
                          className="inline-flex w-full items-center justify-center sts-btn-ghost text-sm"
                          href={`/api/work-orders/${c.workOrder!.id}/corrective-docx`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Descargar correctivo (Word STS)
                        </a>
                      ) : null}

                      <WorkOrderFileUploadCard
                        workOrderId={c.workOrder!.id}
                        currentFilePath={(c.workOrder as any).orderFilePath ?? null}
                        currentFileName={(c.workOrder as any).orderFileName ?? null}
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Este tipo de caso no requiere OT (segun registry) o aun no se genero.
                    </p>
                  )}
                </div>
              </section>

              {showNovedadCard && novedadSnapshot ? (
                <NovedadTraceCard
                  caseId={c.id}
                  canEdit={canEditNovedad}
                  batchRef={novedadSnapshot.batchRef}
                  initialPriority={c.priority}
                  catalogCode={novedadSnapshot.catalogCode}
                  affectedEquipment={novedadSnapshot.affectedEquipment}
                  reportedNovelty={novedadSnapshot.reportedNovelty}
                  observations={novedadSnapshot.observations}
                  evidencePath={novedadSnapshot.evidencePath}
                  evidenceName={novedadSnapshot.evidenceName}
                  relatedCorrectiveCaseId={
                    c.type === CaseType.CORRECTIVO ? c.id : linkedCorrectiveForNovedad?.id ?? null
                  }
                  relatedWorkOrderId={
                    c.type === CaseType.CORRECTIVO
                      ? c.workOrder?.id ?? null
                      : linkedCorrectiveForNovedad?.workOrder?.id ?? null
                  }
                  busCode={c.bus?.code ?? null}
                  busPlate={c.bus?.plate ?? null}
                />
              ) : null}

              {c.type === CaseType.NOVEDAD ? (
                <LinkedCasesCard
                  novedadId={c.id}
                  novedadCaseNo={c.caseNo}
                  novedadStatus={c.status}
                  busId={c.bus?.id ?? null}
                  canManage={canEditNovedad}
                  linked={linkedCasesView}
                />
              ) : null}

              {c.stsTicket ? (
                <section className="sts-card overflow-hidden">
                  <div className="border-b border-border/50 bg-muted/20 p-5">
                    <h2 className="text-xl font-semibold">Ticket STS</h2>
                  </div>
                  <div className="space-y-2 p-5">
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
                      className="inline-flex w-full items-center justify-center sts-btn-primary text-sm"
                    >
                      Ver ticket STS
                    </Link>
                  </div>
                </section>
              ) : null}

              {c.stsTicket?.events?.length ? (
                <section className="sts-card overflow-hidden">
                  <div className="border-b border-border/50 bg-muted/20 p-5">
                    <h2 className="text-base font-semibold">Timeline STS</h2>
                  </div>
                  <div className="space-y-2 p-5">
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
                <section className="sts-card overflow-hidden">
                  <div className="border-b border-border/50 bg-muted/20 p-5">
                    <h2 className="text-base font-semibold">Asignación</h2>
                  </div>
                  <div className="p-5">
                    <p className="text-sm text-muted-foreground">Solo planner o admin pueden asignar técnicos.</p>
                  </div>
                </section>
              )}

              {c.workOrder?.id &&
              c.workOrder.status === ("EN_VALIDACION" as any) &&
              (role === Role.ADMIN || role === Role.BACKOFFICE) ? (
                <ValidateWorkOrderCard workOrderId={c.workOrder.id} />
              ) : null}
            </>
          )}

          <CaseCommentsCard caseId={c.id} comments={caseComments} />

          <section className="sts-card overflow-hidden">
            <div className="border-b border-border/50 bg-muted/20 p-5">
              <h2 className="text-base font-semibold">Acciones</h2>
            </div>
            <div className="space-y-2 p-5">
              <Link
                href="/cases"
                className="inline-flex w-full items-center justify-center sts-btn-ghost text-sm"
              >
                Volver a bandeja
              </Link>
              <Link
                href={`/cases/new`}
                className="inline-flex w-full items-center justify-center sts-btn-ghost text-sm"
              >
                Crear otro caso
              </Link>
              {role === Role.ADMIN ? (
                <DeleteCaseButton caseId={c.id} caseTitle={c.title} />
              ) : null}
            </div>
          </section>
        </div>
      </div>
      </div>
    </div>
  );
}
