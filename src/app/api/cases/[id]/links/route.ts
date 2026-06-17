export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CaseEventType, CaseType, Role } from "@prisma/client";
import { CAPABILITIES } from "@/lib/capabilities";

type LinkedMeta = { sourceCaseId?: unknown; batchRef?: unknown };

function extractSourceCaseId(events: Array<{ meta: unknown }>): string | null {
  for (const event of events) {
    const meta = (event.meta ?? {}) as LinkedMeta;
    if (meta?.sourceCaseId) return String(meta.sourceCaseId);
  }
  return null;
}

function extractNoveltyBatchRef(events: Array<{ meta: unknown }>): string | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const meta = (events[i].meta ?? {}) as any;
    if (meta?.noveltyState?.batchRef) return String(meta.noveltyState.batchRef);
    if (meta?.batchRef) return String(meta.batchRef);
  }
  return null;
}

function isAllowedRole(role: Role) {
  return (
    role === Role.ADMIN ||
    role === Role.BACKOFFICE ||
    role === Role.SUPERVISOR ||
    role === Role.PLANNER
  );
}

/**
 * Ata un caso CORRECTIVO/PREVENTIVO ya existente a una NOVEDAD.
 * `ctx.params.id` = id de la novedad.
 * Body JSON: { targetCaseNo: number } o { targetCaseId: string }.
 * Convención de enlace: se crea un CaseEvent en el caso OBJETIVO con
 * meta.sourceCaseId = novedad.id (igual que la generación automática).
 */
export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = (session.user as any).role as Role;
  const capabilities = (session.user as any).capabilities as string[] | undefined;
  const isVideosOnly =
    role === Role.BACKOFFICE && capabilities?.includes(CAPABILITIES.VIDEOS_ONLY);
  if (isVideosOnly || !isAllowedRole(role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;

  const body = await req.json().catch(() => ({} as any));
  const rawCaseNo = body?.targetCaseNo;
  const rawCaseId = body?.targetCaseId;
  const targetCaseNo =
    rawCaseNo === undefined || rawCaseNo === null || String(rawCaseNo).trim() === ""
      ? null
      : Number(String(rawCaseNo).trim());
  const targetCaseId =
    typeof rawCaseId === "string" && rawCaseId.trim() ? rawCaseId.trim() : null;

  if (!targetCaseId && (targetCaseNo === null || Number.isNaN(targetCaseNo))) {
    return NextResponse.json(
      { error: "Indica el número (targetCaseNo) o id (targetCaseId) del caso a atar." },
      { status: 400 }
    );
  }

  // 1) Validar la novedad de origen.
  const novedad = await prisma.case.findFirst({
    where: { id: String(ctx.params.id), tenantId, type: CaseType.NOVEDAD },
    include: {
      events: { orderBy: { createdAt: "asc" }, select: { meta: true } },
    },
  });
  if (!novedad) {
    return NextResponse.json({ error: "Novedad no encontrada." }, { status: 404 });
  }

  // 2) Validar el caso objetivo (mismo tenant, CORRECTIVO/PREVENTIVO).
  const target = await prisma.case.findFirst({
    where: {
      tenantId,
      ...(targetCaseId ? { id: targetCaseId } : { caseNo: targetCaseNo as number }),
    },
    include: {
      events: { orderBy: { createdAt: "asc" }, select: { meta: true } },
    },
  });
  if (!target) {
    return NextResponse.json({ error: "Caso a atar no encontrado." }, { status: 404 });
  }
  if (target.id === novedad.id) {
    return NextResponse.json({ error: "No puedes atar la novedad a sí misma." }, { status: 400 });
  }
  if (target.type !== CaseType.CORRECTIVO && target.type !== CaseType.PREVENTIVO) {
    return NextResponse.json(
      { error: "Solo se pueden atar casos CORRECTIVO o PREVENTIVO." },
      { status: 400 }
    );
  }

  // 3) Verificar que no esté enlazado a otra novedad distinta.
  const existingSource = extractSourceCaseId(target.events);
  if (existingSource && existingSource !== novedad.id) {
    return NextResponse.json(
      { error: "El caso ya está enlazado a otra novedad." },
      { status: 409 }
    );
  }
  if (existingSource === novedad.id) {
    return NextResponse.json(
      { ok: true, alreadyLinked: true, targetCaseId: target.id },
      { status: 200 }
    );
  }

  // 4) Derivar batchRef de la novedad (noveltyState o NVD-<caseNo padded>).
  const batchRef =
    extractNoveltyBatchRef(novedad.events) ||
    `NVD-${String(novedad.caseNo ?? 0).padStart(4, "0")}`;

  await prisma.caseEvent.create({
    data: {
      caseId: target.id,
      type: CaseEventType.COMMENT,
      message: `Atado a novedad #${novedad.caseNo ?? ""}`.trim(),
      meta: {
        sourceCaseId: novedad.id,
        sourceCaseNo: novedad.caseNo,
        batchRef,
        linkedBy: userId,
        manual: true,
      },
    },
  });

  return NextResponse.json({
    ok: true,
    targetCaseId: target.id,
    targetCaseNo: target.caseNo,
    novedadId: novedad.id,
    batchRef,
  });
}
