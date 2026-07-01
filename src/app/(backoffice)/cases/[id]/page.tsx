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
import ResponsableCard from "./ui/ResponsableCard";
import OtNumberEditor from "./ui/OtNumberEditor";
import ChecklistCard from "./ui/ChecklistCard";
import ValidateWorkOrderCard from "./ui/ValidateWorkOrderCard";
import WorkOrderFileUploadCard from "./ui/WorkOrderFileUploadCard";
import NovedadTraceCard from "./ui/NovedadTraceCard";
import LinkedCasesCard from "./ui/LinkedCasesCard";
import DuplicateNovedadesCard from "./ui/DuplicateNovedadesCard";
import GestionCasoCard from "./ui/GestionCasoCard";
import { normalizeChecklistData } from "@/lib/preventive/checklist-template";
import { getDuplicateGroup, findSimilarOtherCreator, type DuplicateGroup } from "@/lib/novedades/duplicates-server";
import CaseCommentsCard from "./ui/CaseCommentsCard";
import EditCaseTitleCard from "./ui/EditCaseTitleCard";
import EvidenciasCard, { type EvidenceItem, type EvidenceKind } from "./ui/EvidenciasCard";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { StatusPill } from "@/components/ui/status-pill";
import { TypeBadge } from "@/components/ui/TypeBadge";
import { slaInfo, SLA_HOURS, slaHoursFor } from "@/lib/cases/sla";
import {
  ChevronLeft,
  Bus as BusIcon,
  MapPin,
  Wrench,
  Zap,
  ArrowRight,
} from "lucide-react";
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

function initials(name?: string | null) {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "··";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
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
      role !== Role.SUPERVISOR &&
      role !== Role.TECHNICIAN)
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
    where: {
      ...(await buildCaseAccessWhere({ caseId: params.id, tenantId, role, capabilities: caps, userId })),
      // El técnico solo puede abrir los casos que tiene asignados.
      ...(role === Role.TECHNICIAN ? { assignedToId: userId } : {}),
    },
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
      assignedTo: { select: { id: true, name: true } },
      checklist: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
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
        attachments: Array.isArray(meta.attachments) ? meta.attachments : undefined,
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
  const sla = slaInfo(c.createdAt.toISOString(), c.priority, c.status, c.type);
  const slaHours = slaHoursFor(c.priority, c.type);
  const slaPct =
    sla.state === "overdue" || sla.state === "done"
      ? 100
      : sla.state === "soon"
      ? 85
      : 45;
  const isVideoCase = c.type === "SOLICITUD_DESCARGA_VIDEO";
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
        eventType: e.type as CaseEventType | null,
        at: e.createdAt,
        title: label,
        message: e.message ?? "",
        extra,
        actor: actor ? `${actor.name} (${actor.role})` : null,
        actorName: actor?.name ?? null,
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
        eventType: null as CaseEventType | null,
        at: e.occurredAt,
        title: label,
        message: e.summary ?? "",
        extra: null as string | null,
        actor: null as string | null,
        actorName: null as string | null,
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

  // Novedades duplicadas (mismo caso): principal + dependientes + similares de otro usuario.
  // Defensivo: si algo falla, no debe romper el detalle del caso.
  let duplicateGroup: DuplicateGroup = { groupId: null, members: [], principalId: null };
  let duplicateSimilar: Array<{ id: string; caseNo: number | null; status: string; statusLabel: string }> = [];
  if (c.type === CaseType.NOVEDAD) {
    try {
      duplicateGroup = await getDuplicateGroup(prisma, { tenantId, caseId: c.id });
      duplicateSimilar = (await findSimilarOtherCreator(prisma, { tenantId, caseId: c.id })).map((s) => ({
        id: s.id,
        caseNo: s.caseNo,
        status: s.status,
        statusLabel: labelFromMap(s.status, caseStatusLabels),
      }));
    } catch (e) {
      console.error("DUPLICATES_DETAIL_FAILED", e);
    }
  }
  const duplicateMembers = duplicateGroup.members
    .filter((m) => m.id !== c.id)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((m) => ({
      id: m.id,
      caseNo: m.caseNo,
      status: m.status,
      statusLabel: labelFromMap(m.status, caseStatusLabels),
      createdAt: m.createdAt.toISOString(),
      busCode: m.busCode,
      isPrincipal: m.id === duplicateGroup.principalId,
    }));
  const duplicatePrincipal = duplicateGroup.members.find((m) => m.id === duplicateGroup.principalId) ?? null;

  // Panel "Gestionar caso" (preventivo / correctivo): equipos del bus + personas.
  const canGestion =
    role === Role.ADMIN ||
    role === Role.BACKOFFICE ||
    role === Role.SUPERVISOR ||
    role === Role.PLANNER ||
    role === Role.TECHNICIAN;
  const showGestion = c.type === CaseType.PREVENTIVO || c.type === CaseType.CORRECTIVO;
  // Flujo de OT antiguo oculto en backoffice (reemplazado por "Gestionar caso").
  // El código, las rutas y los datos se conservan. Poner en true para volver a mostrarlo.
  const SHOW_OT_FLOW = false;
  // Se oculta solo donde aplica el módulo nuevo (preventivo/correctivo); para otros
  // tipos (renovación/mejora) la OT sigue visible hasta migrarlos.
  const showOtSection = SHOW_OT_FLOW || !showGestion;
  const busEquipmentsView = showGestion
    ? (
        await prisma.busEquipment.findMany({
          where: { busId: c.busId, active: true },
          select: { id: true, serial: true, equipmentType: { select: { name: true } } },
          orderBy: { id: "asc" },
        })
      ).map((e) => ({
        id: e.id,
        name: `${e.equipmentType?.name ?? "Equipo"}${e.serial ? ` (${e.serial})` : ""}`,
        serial: e.serial ?? null,
      }))
    : [];
  const personasView = users.map((u) => ({ id: u.id, name: u.name ?? "" })).filter((u) => u.name);

  // Borrador del checklist del preventivo (para precargar el panel Gestionar caso).
  const preventiveChecklistRow =
    showGestion && c.type === CaseType.PREVENTIVO
      ? await prisma.casePreventiveChecklist.findUnique({ where: { caseId: c.id }, select: { data: true } })
      : null;
  const initialChecklist = preventiveChecklistRow ? normalizeChecklistData(preventiveChecklistRow.data) : null;

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
        <div className="mx-auto w-full max-w-[1600px] px-4 py-4 lg:px-6 lg:py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/cases"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground lg:text-[13px]"
            >
              <ChevronLeft className="h-3.5 w-3.5 text-blue-600" />
              <span className="font-medium text-blue-600">Casos</span>
              <span className="px-1 text-muted-foreground/60">/</span>
              <span className="font-medium">{fmtCaseNo(c.caseNo)}</span>
            </Link>

            <div className="flex flex-wrap items-center gap-2">
              <TypeBadge type={c.type} label={labelFromMap(c.type, caseTypeLabels)} />
              <StatusPill
                status={mapCaseStatusForPill(c.status)}
                label={labelFromMap(c.status, caseStatusLabels)}
              />
              <PriorityBadge priority={c.priority} />
              {sla.state !== "done" ? (
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                    sla.overdue
                      ? "bg-red-50 text-red-700"
                      : sla.state === "soon"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {sla.label}
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-3 min-w-0">
            <EditCaseTitleCard caseId={c.id} initialTitle={c.title} canEdit={canEditTitle} />
            <p className="mt-1 truncate text-xs leading-tight text-muted-foreground lg:text-[13px]">
              {fmtCaseNo(c.caseNo)} · Caso <span className="font-mono">{c.id}</span> · Creado {fmtDate(c.createdAt)}
            </p>
          </div>
        </div>
      </header>

      <div className="mobile-page-content max-w-[1600px] lg:px-6">
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4 lg:space-y-5">
          <section className="sts-card p-4 lg:p-5">
            <p className="mb-1.5 text-xs font-semibold text-slate-600">Descripción</p>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-600">{c.description}</p>
          </section>

          {showGestion ? (
            <GestionCasoCard
              caseId={c.id}
              caseType={c.type as "PREVENTIVO" | "CORRECTIVO"}
              busCode={c.bus?.code ?? null}
              busPlate={c.bus?.plate ?? null}
              canManage={canGestion}
              technicians={personasView}
              busEquipments={busEquipmentsView}
              currentAssignedId={c.assignedTo?.id ?? null}
              currentAssignedName={c.assignedTo?.name ?? null}
              currentStatus={c.status}
              initialChecklist={initialChecklist}
            />
          ) : null}

          {!isVideoCase ? (
            <ChecklistCard
              caseId={c.id}
              initial={c.checklist.map((it) => ({ id: it.id, text: it.text, done: it.done }))}
            />
          ) : null}

          <section className="sts-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border/50 bg-muted/20 px-4 py-3 lg:px-5">
              <h2 className="text-[13px] font-semibold text-slate-700">Actividad</h2>
              <p className="text-[11px] text-muted-foreground">
                {c.events.length} de caso · {lifecycle.length} de bus
              </p>
            </div>

            <div className="p-4 lg:p-5">
              <CaseCommentsCard caseId={c.id} comments={caseComments} composerOnly />

              <div className="mt-4 flex flex-col gap-3">
                {sla.state === "overdue" || sla.state === "soon" ? (
                  <div className="flex items-center gap-2.5 text-[11.5px]">
                    <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                      <Zap className="h-3 w-3" />
                    </span>
                    <span className="text-amber-700">
                      <b className="font-semibold text-amber-800">Automatización</b> · {sla.label} — objetivo de resolución P{c.priority}
                    </span>
                  </div>
                ) : null}

                {[...timeline].reverse().map((it, idx) => {
                  if (it.eventType === "COMMENT") {
                    return (
                      <div key={`act-${idx}`} className="flex gap-2.5">
                        <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-blue-600/10 text-[10px] font-semibold text-blue-700">
                          {initials(it.actorName)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 text-[11px] text-muted-foreground">
                            {it.actorName ? (
                              <b className="font-semibold text-slate-700">{it.actorName}</b>
                            ) : (
                              "Comentario"
                            )}{" "}
                            · comentario · {fmtDate(it.at)}
                          </div>
                          <div className="whitespace-pre-wrap rounded-[10px] border border-border/60 bg-slate-50/70 px-3 py-2 text-[12.5px] text-slate-700">
                            {it.message || "—"}
                          </div>
                          {(() => {
                            const atts = ((it.meta as any)?.attachments ?? []) as Array<{
                              filePath: string;
                              fileName?: string;
                              mimeType?: string;
                            }>;
                            if (!Array.isArray(atts) || !atts.length) return null;
                            return (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {atts.map((a, ai) => {
                                  const isImg =
                                    (a.mimeType && a.mimeType.startsWith("image/")) ||
                                    /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(a.fileName ?? "");
                                  return isImg ? (
                                    <a
                                      key={`${a.filePath}-${ai}`}
                                      href={`/api/uploads/${a.filePath}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      title={a.fileName ?? "foto"}
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={`/api/uploads/${a.filePath}`}
                                        alt={a.fileName ?? "foto"}
                                        className="h-20 w-20 rounded-lg border border-border/60 object-cover transition hover:opacity-90"
                                      />
                                    </a>
                                  ) : (
                                    <a
                                      key={`${a.filePath}-${ai}`}
                                      href={`/api/uploads/${a.filePath}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-slate-50 px-2 py-1 text-[11px] text-slate-600 transition hover:bg-slate-100"
                                    >
                                      {a.fileName ?? "archivo"}
                                    </a>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={`act-${idx}`} className="flex items-start gap-2.5 text-[11.5px]">
                      <span
                        className={`mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full ${
                          it.kind === "CASE" ? "bg-slate-100 text-slate-500" : "bg-emerald-50 text-emerald-600"
                        }`}
                      >
                        {it.kind === "CASE" ? <ArrowRight className="h-3 w-3" /> : <Wrench className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0 flex-1 leading-relaxed">
                        {it.actorName ? <b className="font-semibold text-slate-700">{it.actorName} </b> : null}
                        <span className="text-slate-600">{it.title}</span>
                        {it.message ? <span className="text-muted-foreground"> — {it.message}</span> : null}
                        {it.extra ? <span className="text-muted-foreground"> · {it.extra}</span> : null}
                        <span className="text-muted-foreground/70"> · {fmtDate(it.at)}</span>
                        {debug && it.meta ? (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-[11px] text-muted-foreground">meta</summary>
                            <pre className="mt-1 max-h-56 overflow-auto rounded bg-zinc-50 p-2 text-[11px]">
                              {JSON.stringify(it.meta, null, 2)}
                            </pre>
                          </details>
                        ) : null}
                      </span>
                    </div>
                  );
                })}

                {timeline.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground">Sin actividad registrada todavía.</p>
                ) : null}
              </div>
            </div>
          </section>

          {showEvidenceCard ? <EvidenciasCard caseId={c.id} items={evidenceItems} /> : null}
        </div>

        <div className="min-w-0 space-y-4 lg:space-y-5">
          {/* Propiedades */}
          <section className="sts-card p-4 lg:p-5">
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[.04em] text-slate-400">Propiedades</p>
            <div className="flex flex-col gap-2.5 text-[12.5px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Estado</span>
                <StatusPill
                  status={mapCaseStatusForPill(c.status)}
                  label={labelFromMap(c.status, caseStatusLabels)}
                  size="sm"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Prioridad</span>
                <PriorityBadge priority={c.priority} size="sm" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Tipo</span>
                <TypeBadge type={c.type} label={labelFromMap(c.type, caseTypeLabels)} size="sm" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Responsable</span>
                {c.assignedTo?.name ? (
                  <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600/10 text-[9px] font-semibold text-blue-700">
                      {initials(c.assignedTo.name)}
                    </span>
                    {c.assignedTo.name}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Sin asignar</span>
                )}
              </div>
              {isVideoCase && vdr?.requesterName ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Solicitante</span>
                  <span className="font-medium text-slate-700">{vdr.requesterName}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Bus</span>
                <Link href={`/buses/${c.bus.id}`} className="font-medium text-slate-700 transition hover:text-blue-600">
                  {c.bus.code}
                  {c.bus.plate ? ` · ${c.bus.plate}` : ""}
                </Link>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Creado</span>
                <span className="text-slate-600">{fmtDate(c.createdAt)}</span>
              </div>
            </div>
          </section>

          {/* SLA */}
          <section className="sts-card p-4 lg:p-5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[.04em] text-slate-400">SLA</p>
              <span
                className={`text-[11px] font-semibold ${
                  sla.overdue
                    ? "text-red-600"
                    : sla.state === "soon"
                    ? "text-amber-600"
                    : sla.state === "done"
                    ? "text-emerald-600"
                    : "text-slate-500"
                }`}
              >
                {sla.state === "done" ? "Sin SLA pendiente" : sla.label}
              </span>
            </div>
            <div className="mb-2.5 h-[5px] w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${
                  sla.overdue
                    ? "bg-red-500"
                    : sla.state === "soon"
                    ? "bg-amber-500"
                    : sla.state === "done"
                    ? "bg-emerald-500"
                    : "bg-blue-600"
                }`}
                style={{ width: `${slaPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11.5px] text-slate-600">
              <span>
                Resolución (P{c.priority}: {slaHours} h)
              </span>
              <span
                className={`font-semibold ${
                  sla.overdue ? "text-red-600" : sla.state === "done" ? "text-emerald-600" : "text-slate-600"
                }`}
              >
                {sla.overdue ? "Excedida" : sla.state === "done" ? "Cumplida" : "En curso"}
              </span>
            </div>
          </section>

          {/* Contexto del bus */}
          <section className="sts-card overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 lg:px-5">
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-700">
                <BusIcon className="h-4 w-4 text-blue-600" /> Bus {c.bus.code}
              </span>
              <Link href={`/buses/${c.bus.id}`} className="text-[11px] font-medium text-blue-600 hover:underline">
                Ver ficha ›
              </Link>
            </div>
            <div
              className="relative mx-4 mt-3 h-[84px] overflow-hidden rounded-[10px] lg:mx-5"
              style={{ background: "linear-gradient(135deg,#eaf0f7 0%,#dde8f3 100%)" }}
            >
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    "linear-gradient(#ffffff55 1px,transparent 1px),linear-gradient(90deg,#ffffff55 1px,transparent 1px)",
                  backgroundSize: "20px 20px",
                }}
              />
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-red-600">
                <MapPin className="h-5 w-5" />
              </div>
              {c.bus.plate ? (
                <span className="absolute bottom-1.5 left-2 rounded bg-white/80 px-1.5 py-0.5 text-[10px] text-slate-600">
                  {c.bus.plate}
                </span>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5 p-4 lg:p-5">
              {equipmentItems.length === 0 ? (
                <p className="text-[11.5px] text-muted-foreground">Sin equipos asociados.</p>
              ) : (
                equipmentItems.slice(0, 6).map((item, idx) => (
                  <div key={`eq-${idx}`} className="flex items-center gap-2 text-[11.5px] text-slate-600">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                    <span className="truncate">{item}</span>
                  </div>
                ))
              )}
              <Link
                href="/telemetry"
                className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-600 hover:underline"
              >
                <Zap className="h-3 w-3" /> Ver telemetría ›
              </Link>
            </div>
          </section>

          {isVideoCase ? (
            <>
              <section className="sts-card overflow-hidden">
                <div className="border-b border-border/50 bg-slate-50/60 p-5">
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
                <div className="border-b border-border/50 bg-slate-50/60 p-5">
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
              {showOtSection ? (
              <section className="sts-card overflow-hidden">
                <div className="flex items-center gap-1.5 border-b border-border/50 bg-muted/20 px-4 py-3 lg:px-5">
                  <Wrench className="h-4 w-4 text-indigo-500" />
                  <h2 className="text-[13px] font-semibold text-slate-700">Orden de trabajo</h2>
                </div>

                <div className="space-y-2 p-5">
                  <div className="sts-card p-3">
                    <p className="text-xs text-muted-foreground">OT</p>
                    <p className="mt-1 text-sm font-medium">
                      {c.workOrder?.workOrderNo ? fmtWoNo(c.workOrder.workOrderNo) : "-"}
                    </p>
                  </div>

                  {hasWo &&
                  (role === Role.ADMIN ||
                    role === Role.BACKOFFICE ||
                    role === Role.SUPERVISOR ||
                    role === Role.PLANNER) ? (
                    <div className="sts-card p-3">
                      <OtNumberEditor caseId={c.id} current={c.workOrder?.workOrderNo ?? null} />
                    </div>
                  ) : null}

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
                  ) : c.type === CaseType.NOVEDAD || c.type === CaseType.SOLICITUD_DESCARGA_VIDEO ? (
                    <p className="text-xs text-muted-foreground">
                      Este tipo de caso no requiere OT.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Aún no se ha generado la OT. Asigna un técnico en la tarjeta{" "}
                      <a href="#asignacion" className="font-medium text-blue-600 underline">
                        Asignación
                      </a>{" "}
                      (más abajo) para crearla; el caso pasará a “OT asignada”.
                    </p>
                  )}
                </div>
              </section>
              ) : null}

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

              {c.type === CaseType.NOVEDAD ? (
                <DuplicateNovedadesCard
                  novedadId={c.id}
                  novedadCaseNo={c.caseNo}
                  busCode={c.bus?.code ?? null}
                  canManage={canEditNovedad}
                  groupId={duplicateGroup.groupId}
                  selfIsPrincipal={duplicateGroup.principalId === c.id}
                  principalCaseNo={duplicatePrincipal?.caseNo ?? null}
                  members={duplicateMembers}
                  similar={duplicateSimilar}
                />
              ) : null}

              {c.stsTicket ? (
                <section className="sts-card overflow-hidden">
                  <div className="border-b border-border/50 bg-slate-50/60 p-5">
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
                  <div className="border-b border-border/50 bg-slate-50/60 p-5">
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

              {role === Role.ADMIN ||
              role === Role.BACKOFFICE ||
              role === Role.SUPERVISOR ||
              role === Role.PLANNER ? (
                <ResponsableCard
                  caseId={c.id}
                  currentId={c.assignedTo?.id ?? null}
                  currentName={c.assignedTo?.name ?? null}
                  users={users.map((u) => ({ id: u.id, name: u.name ?? "" }))}
                />
              ) : null}

              {showOtSection ? (
                <>
              <div id="asignacion" />
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
                  <div className="border-b border-border/50 bg-slate-50/60 p-5">
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
              ) : null}
            </>
          )}

          <section className="sts-card overflow-hidden">
            <div className="border-b border-border/50 bg-muted/20 px-4 py-3 lg:px-5">
              <h2 className="text-[13px] font-semibold text-slate-700">Acciones</h2>
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
