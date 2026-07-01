export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CaseType, Role, WorkOrderStatus } from "@prisma/client";
import { CAPABILITIES } from "@/lib/capabilities";
import { saveUpload } from "@/lib/uploads";
import {
  asDateInput,
  createDefaultRvrChecklist,
  normalizeRvrChecklist,
  normalizeRvrAspects,
  parseDateInput,
  pickNvrIpFromEquipments,
  RVR_MAX_BUSES_PER_DAY,
} from "@/lib/rvr";
import { buildRvrValidationQueue, buildRvrCorrectiveQueue, type RvrQueueItem } from "@/lib/rvr/priority";

type PersistedEvidence = {
  filePath: string;
  fileName: string;
  mimeType: string;
  size: number;
};

function isRvrAllowed(role: Role, capabilities: string[] | undefined) {
  if (role === Role.ADMIN || role === Role.SUPERVISOR) return true;
  if (role === Role.BACKOFFICE) {
    return !capabilities?.includes(CAPABILITIES.VIDEOS_ONLY);
  }
  return false;
}

function normalizeEvidence(input: unknown): PersistedEvidence[] {
  if (!Array.isArray(input)) return [];
  const output: PersistedEvidence[] = [];
  for (const raw of input) {
    const filePath = String((raw as any)?.filePath ?? "").trim();
    if (!filePath) continue;
    output.push({
      filePath,
      fileName: String((raw as any)?.fileName ?? "").trim() || "evidencia",
      mimeType: String((raw as any)?.mimeType ?? "").trim() || "application/octet-stream",
      size: Number((raw as any)?.size ?? 0) || 0,
    });
  }
  return output;
}

function uniqueStringArray(input: unknown) {
  if (!Array.isArray(input)) return [] as string[];
  const seen = new Set<string>();
  for (const raw of input) {
    const value = String(raw ?? "").trim();
    if (!value) continue;
    seen.add(value);
  }
  return Array.from(seen);
}

function parseIsoDate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

async function buildEligibleBuses(tenantId: string, includeBusIds: string[] = []) {
  const includeSet = new Set(includeBusIds);
  const preventiveCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const preventiveWorkOrders = await prisma.workOrder.findMany({
    where: {
      tenantId,
      status: WorkOrderStatus.FINALIZADA,
      finishedAt: { not: null },
      case: { type: CaseType.PREVENTIVO },
    },
    orderBy: { finishedAt: "desc" },
    take: 5000,
    select: {
      finishedAt: true,
      case: {
        select: {
          busId: true,
          bus: {
            select: {
              id: true,
              code: true,
              plate: true,
              equipments: {
                where: { active: true },
                select: {
                  ipAddress: true,
                  location: true,
                  equipmentType: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  const latestByBus = new Map<
    string,
    {
      id: string;
      code: string;
      plate: string | null;
      nvrIp: string | null;
      lastPreventiveAt: Date | null;
      eligible: boolean;
      forceIncluded: boolean;
    }
  >();

  for (const wo of preventiveWorkOrders) {
    const bus = wo.case.bus;
    if (!bus || latestByBus.has(bus.id)) continue;
    const finishedAt = wo.finishedAt ?? null;
    latestByBus.set(bus.id, {
      id: bus.id,
      code: bus.code,
      plate: bus.plate,
      nvrIp: pickNvrIpFromEquipments(bus.equipments),
      lastPreventiveAt: finishedAt,
      eligible: Boolean(finishedAt && finishedAt <= preventiveCutoff),
      forceIncluded: includeSet.has(bus.id),
    });
  }

  const missingIncluded = includeBusIds.filter((busId) => !latestByBus.has(busId));
  if (missingIncluded.length > 0) {
    const extraBuses = await prisma.bus.findMany({
      where: { tenantId, id: { in: missingIncluded } },
      select: {
        id: true,
        code: true,
        plate: true,
        equipments: {
          where: { active: true },
          select: {
            ipAddress: true,
            location: true,
            equipmentType: { select: { name: true } },
          },
        },
      },
    });
    for (const bus of extraBuses) {
      latestByBus.set(bus.id, {
        id: bus.id,
        code: bus.code,
        plate: bus.plate,
        nvrIp: pickNvrIpFromEquipments(bus.equipments),
        lastPreventiveAt: null,
        eligible: false,
        forceIncluded: true,
      });
    }
  }

  return Array.from(latestByBus.values())
    .filter((row) => row.eligible || row.forceIncluded)
    .sort((a, b) => {
      const aTime = a.lastPreventiveAt ? a.lastPreventiveAt.getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.lastPreventiveAt ? b.lastPreventiveAt.getTime() : Number.MAX_SAFE_INTEGER;
      if (aTime !== bTime) return aTime - bTime;
      return a.code.localeCompare(b.code, "es");
    });
}

// Buses elegibles según el MOTOR DE PRIORIDAD (no transmite, alarma cámara,
// preventivo ayer/10d, recheck 15d). Devuelve la misma forma que buildEligibleBuses
// + el motivo/orden, y agrega la IP del NVR.
async function buildPriorityEligibleBuses(tenantId: string, includeBusIds: string[] = []) {
  const queue = await buildRvrValidationQueue(tenantId, RVR_MAX_BUSES_PER_DAY);
  const byId = new Map(queue.map((q) => [q.busId, q]));
  const allIds = Array.from(new Set([...queue.map((q) => q.busId), ...includeBusIds]));
  if (allIds.length === 0) return [];

  const buses = await prisma.bus.findMany({
    where: { tenantId, id: { in: allIds } },
    select: {
      id: true,
      code: true,
      plate: true,
      equipments: {
        where: { active: true },
        select: { ipAddress: true, location: true, equipmentType: { select: { name: true } } },
      },
    },
  });
  const busById = new Map(buses.map((b) => [b.id, b]));
  const includeSet = new Set(includeBusIds);

  const rows = allIds
    .map((id) => {
      const b = busById.get(id);
      if (!b) return null;
      const q = byId.get(id);
      return {
        id: b.id,
        code: b.code,
        plate: b.plate,
        nvrIp: pickNvrIpFromEquipments(b.equipments),
        lastPreventiveAt: q?.lastPreventiveAt ? new Date(q.lastPreventiveAt) : null,
        eligible: Boolean(q),
        forceIncluded: includeSet.has(id),
        rank: q?.rank ?? 99,
        reason: q?.reason ?? null,
        reasonLabel: q?.reasonLabel ?? null,
        detail: q?.detail ?? "",
        hasOpenNovedad: q?.hasOpenNovedad ?? false,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  rows.sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.code.localeCompare(b.code, "es")));
  return rows;
}

function mapReviewBusRow(row: {
  id: string;
  busId: string;
  busCode: string;
  busPlate: string | null;
  nvrIp: string | null;
  reviewedAt: Date | null;
  generalResult: string | null;
  relevantFindings: string | null;
  ticketUpk: string | null;
  requiresCorrective: boolean;
  capitalbusOt: string | null;
  checklist: unknown;
  evidences: unknown;
  aspects?: unknown;
  priorityRank?: number | null;
  priorityReason?: string | null;
  priorityDetail?: string | null;
  correctiveCaseId: string | null;
  correctiveCaseNo: number | null;
  correctiveWorkOrderId: string | null;
  correctiveWorkOrderNo: number | null;
}) {
  return {
    id: row.id,
    busId: row.busId,
    busCode: row.busCode,
    busPlate: row.busPlate,
    nvrIp: row.nvrIp,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    generalResult: row.generalResult ?? "",
    relevantFindings: row.relevantFindings ?? "",
    ticketUpk: row.ticketUpk ?? "",
    requiresCorrective: row.requiresCorrective,
    capitalbusOt: row.capitalbusOt ?? "",
    checklist: normalizeRvrChecklist(row.checklist),
    aspects: normalizeRvrAspects(row.aspects),
    evidences: normalizeEvidence(row.evidences),
    priorityRank: row.priorityRank ?? null,
    priorityReason: row.priorityReason ?? null,
    priorityDetail: row.priorityDetail ?? null,
    correctiveCaseId: row.correctiveCaseId,
    correctiveCaseNo: row.correctiveCaseNo,
    correctiveWorkOrderId: row.correctiveWorkOrderId,
    correctiveWorkOrderNo: row.correctiveWorkOrderNo,
  };
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as Role;
  const capabilities = (session.user as any).capabilities as string[] | undefined;
  if (!isRvrAllowed(role, capabilities)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const { searchParams } = new URL(req.url);
  const reviewDate = parseDateInput(searchParams.get("date")) ?? parseDateInput(asDateInput(new Date()))!;

  const review = await prisma.remoteVisualReview.findUnique({
    where: {
      tenantId_reviewDate: {
        tenantId,
        reviewDate,
      },
    },
    include: {
      buses: {
        orderBy: [{ priorityRank: "asc" }, { busCode: "asc" }],
      },
    },
  });

  const selectedBusIds = review?.buses.map((item) => item.busId) ?? [];
  let eligibleBuses: Array<Record<string, any>>;
  let correctiveQueue: RvrQueueItem[] = [];
  try {
    eligibleBuses = await buildPriorityEligibleBuses(tenantId, selectedBusIds);
    correctiveQueue = await buildRvrCorrectiveQueue(tenantId, RVR_MAX_BUSES_PER_DAY);
  } catch (e) {
    console.error("RVR_PRIORITY_FAILED", e);
    eligibleBuses = await buildEligibleBuses(tenantId, selectedBusIds);
    correctiveQueue = [];
  }

  return NextResponse.json({
    date: asDateInput(reviewDate),
    maxBuses: RVR_MAX_BUSES_PER_DAY,
    correctiveQueue,
    eligibleBuses: eligibleBuses.map((item) => ({
      ...item,
      lastPreventiveAt: item.lastPreventiveAt?.toISOString() ?? null,
    })),
    review: review
      ? {
          id: review.id,
          date: asDateInput(review.reviewDate),
          responsibleId: review.responsibleId,
          scheduleWindow: review.scheduleWindow ?? "",
          busLimit: review.busLimit,
          busCount: review.busCount,
          generalResult: review.generalResult ?? "",
          relevantFindings: review.relevantFindings ?? "",
          ticketUpk: review.ticketUpk ?? "",
          requiresCorrective: review.requiresCorrective,
          capitalbusOt: review.capitalbusOt ?? "",
          evidencesNotes: review.evidencesNotes ?? "",
          status: review.status,
          buses: review.buses.map((row) => mapReviewBusRow(row)),
        }
      : null,
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as Role;
  const capabilities = (session.user as any).capabilities as string[] | undefined;
  if (!isRvrAllowed(role, capabilities)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;
  const userName = String((session.user as any).name ?? "").trim();

  const form = await req.formData();
  const payloadRaw = String(form.get("payload") ?? "").trim() || "{}";

  let payload: any = null;
  try {
    payload = JSON.parse(payloadRaw);
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const reviewDate = parseDateInput(payload?.date);
  if (!reviewDate) {
    return NextResponse.json({ error: "Fecha de revisión inválida." }, { status: 400 });
  }

  const selectedBusIds = uniqueStringArray(payload?.selectedBusIds);
  if (selectedBusIds.length === 0) {
    return NextResponse.json({ error: "Selecciona al menos 1 bus." }, { status: 400 });
  }
  if (selectedBusIds.length > RVR_MAX_BUSES_PER_DAY) {
    return NextResponse.json(
      { error: `Solo puedes revisar máximo ${RVR_MAX_BUSES_PER_DAY} buses por día.` },
      { status: 400 }
    );
  }

  const buses = await prisma.bus.findMany({
    where: { tenantId, id: { in: selectedBusIds } },
    select: {
      id: true,
      code: true,
      plate: true,
      equipments: {
        where: { active: true },
        select: {
          ipAddress: true,
          location: true,
          equipmentType: { select: { name: true } },
        },
      },
    },
  });
  if (buses.length !== selectedBusIds.length) {
    return NextResponse.json(
      { error: "Uno o más buses seleccionados no existen para este tenant." },
      { status: 400 }
    );
  }

  const busById = new Map(buses.map((bus) => [bus.id, bus]));
  const entriesRaw = Array.isArray(payload?.entries) ? payload.entries : [];
  const entryByBusId = new Map<string, any>();
  for (const entry of entriesRaw) {
    const busId = String(entry?.busId ?? "").trim();
    if (!busId) continue;
    entryByBusId.set(busId, entry);
  }

  const review = await prisma.remoteVisualReview.upsert({
    where: {
      tenantId_reviewDate: {
        tenantId,
        reviewDate,
      },
    },
    create: {
      tenantId,
      reviewDate,
      responsibleId: userId,
      scheduleWindow: String(payload?.scheduleWindow ?? "").trim() || null,
      busLimit: RVR_MAX_BUSES_PER_DAY,
      busCount: selectedBusIds.length,
      generalResult: String(payload?.generalResult ?? "").trim() || null,
      relevantFindings: String(payload?.relevantFindings ?? "").trim() || null,
      ticketUpk: String(payload?.ticketUpk ?? "").trim() || null,
      requiresCorrective: Boolean(payload?.requiresCorrective),
      capitalbusOt: String(payload?.capitalbusOt ?? "").trim() || null,
      evidencesNotes: String(payload?.evidencesNotes ?? "").trim() || null,
      status: String(payload?.status ?? "").trim().toUpperCase() === "COMPLETED" ? "COMPLETED" : "DRAFT",
    },
    update: {
      responsibleId: userId,
      scheduleWindow: String(payload?.scheduleWindow ?? "").trim() || null,
      busLimit: RVR_MAX_BUSES_PER_DAY,
      busCount: selectedBusIds.length,
      generalResult: String(payload?.generalResult ?? "").trim() || null,
      relevantFindings: String(payload?.relevantFindings ?? "").trim() || null,
      ticketUpk: String(payload?.ticketUpk ?? "").trim() || null,
      requiresCorrective: Boolean(payload?.requiresCorrective),
      capitalbusOt: String(payload?.capitalbusOt ?? "").trim() || null,
      evidencesNotes: String(payload?.evidencesNotes ?? "").trim() || null,
      status: String(payload?.status ?? "").trim().toUpperCase() === "COMPLETED" ? "COMPLETED" : "DRAFT",
      updatedAt: new Date(),
    },
  });

  const existingRows = await prisma.remoteVisualReviewBus.findMany({
    where: {
      reviewId: review.id,
      busId: { in: selectedBusIds },
    },
    select: { busId: true, evidences: true },
  });
  const existingEvidenceByBusId = new Map(
    existingRows.map((row) => [row.busId, normalizeEvidence(row.evidences)])
  );

  for (const busId of selectedBusIds) {
    const bus = busById.get(busId)!;
    const entry = entryByBusId.get(busId) ?? {};

    const checklist = normalizeRvrChecklist(entry?.checklist ?? createDefaultRvrChecklist());
    const reviewedAt = parseIsoDate(entry?.reviewedAt) ?? new Date();

    const newEvidence: PersistedEvidence[] = [];
    const files = form
      .getAll(`evidence:${busId}`)
      .filter((item): item is File => item instanceof File && item.size > 0);
    for (const file of files) {
      const filePath = await saveUpload(file, `rvr/${review.id}/${bus.code}`, {
        fileNamePrefix: `${bus.code}_RVR`,
      });
      newEvidence.push({
        filePath,
        fileName: file.name || "evidencia",
        mimeType: file.type || "application/octet-stream",
        size: file.size,
      });
    }

    const persistedEvidence = [
      ...(existingEvidenceByBusId.get(busId) ?? []),
      ...newEvidence,
    ];

    await prisma.remoteVisualReviewBus.upsert({
      where: {
        reviewId_busId: {
          reviewId: review.id,
          busId,
        },
      },
      create: {
        reviewId: review.id,
        busId,
        busCode: bus.code,
        busPlate: bus.plate,
        nvrIp:
          String(entry?.nvrIp ?? "").trim() ||
          pickNvrIpFromEquipments(bus.equipments) ||
          null,
        reviewedAt,
        generalResult: String(entry?.generalResult ?? "").trim() || null,
        relevantFindings: String(entry?.relevantFindings ?? "").trim() || null,
        ticketUpk: String(entry?.ticketUpk ?? "").trim() || null,
        requiresCorrective: Boolean(entry?.requiresCorrective),
        capitalbusOt: String(entry?.capitalbusOt ?? "").trim() || null,
        checklist,
        aspects: normalizeRvrAspects(entry?.aspects),
        evidences: persistedEvidence,
      },
      update: {
        busCode: bus.code,
        busPlate: bus.plate,
        nvrIp:
          String(entry?.nvrIp ?? "").trim() ||
          pickNvrIpFromEquipments(bus.equipments) ||
          null,
        reviewedAt,
        generalResult: String(entry?.generalResult ?? "").trim() || null,
        relevantFindings: String(entry?.relevantFindings ?? "").trim() || null,
        ticketUpk: String(entry?.ticketUpk ?? "").trim() || null,
        requiresCorrective: Boolean(entry?.requiresCorrective),
        capitalbusOt: String(entry?.capitalbusOt ?? "").trim() || null,
        checklist,
        aspects: normalizeRvrAspects(entry?.aspects),
        evidences: persistedEvidence,
      },
    });
  }

  await prisma.remoteVisualReviewBus.deleteMany({
    where: {
      reviewId: review.id,
      busId: { notIn: selectedBusIds },
    },
  });

  const updated = await prisma.remoteVisualReview.findUnique({
    where: { id: review.id },
    include: { buses: { orderBy: { busCode: "asc" } } },
  });

  return NextResponse.json({
    ok: true,
    message: `RVR diaria guardada por ${userName || "usuario"}.`,
    review: updated
      ? {
          id: updated.id,
          date: asDateInput(updated.reviewDate),
          responsibleId: updated.responsibleId,
          scheduleWindow: updated.scheduleWindow ?? "",
          busLimit: updated.busLimit,
          busCount: updated.busCount,
          generalResult: updated.generalResult ?? "",
          relevantFindings: updated.relevantFindings ?? "",
          ticketUpk: updated.ticketUpk ?? "",
          requiresCorrective: updated.requiresCorrective,
          capitalbusOt: updated.capitalbusOt ?? "",
          evidencesNotes: updated.evidencesNotes ?? "",
          status: updated.status,
          buses: updated.buses.map((row) => mapReviewBusRow(row)),
        }
      : null,
  });
}
