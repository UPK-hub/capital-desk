export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CaseEventType, CaseType, Role } from "@prisma/client";
import { CAPABILITIES } from "@/lib/capabilities";
import { deterministicGroupId, issueKeyForCase, resolveDuplicateGroupId } from "@/lib/novedades/duplicates";
import { copyGroupResponsesTo } from "@/lib/novedades/duplicates-server";

function isAllowedRole(role: Role) {
  return (
    role === Role.ADMIN ||
    role === Role.BACKOFFICE ||
    role === Role.SUPERVISOR ||
    role === Role.PLANNER
  );
}

const NOVEDAD_SELECT = {
  id: true,
  caseNo: true,
  title: true,
  bus: { select: { code: true } },
  events: { orderBy: { createdAt: "asc" }, select: { createdAt: true, meta: true } },
} as const;

/**
 * Enlaza DOS novedades como "el mismo caso" (duplicadas).
 * `ctx.params.id` = novedad origen. Body JSON: { targetCaseNo } o { targetCaseId }.
 * No cambia el estado de los casos: solo registra la pertenencia al grupo.
 */
export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = (session.user as any).role as Role;
  const capabilities = (session.user as any).capabilities as string[] | undefined;
  const isVideosOnly = role === Role.BACKOFFICE && capabilities?.includes(CAPABILITIES.VIDEOS_ONLY);
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
  const targetCaseId = typeof rawCaseId === "string" && rawCaseId.trim() ? rawCaseId.trim() : null;

  if (!targetCaseId && (targetCaseNo === null || Number.isNaN(targetCaseNo))) {
    return NextResponse.json(
      { error: "Indica el número (targetCaseNo) o id (targetCaseId) de la novedad a enlazar." },
      { status: 400 }
    );
  }

  const source = await prisma.case.findFirst({
    where: { id: String(ctx.params.id), tenantId, type: CaseType.NOVEDAD },
    select: NOVEDAD_SELECT,
  });
  if (!source) return NextResponse.json({ error: "Novedad no encontrada." }, { status: 404 });

  const target = await prisma.case.findFirst({
    where: { tenantId, ...(targetCaseId ? { id: targetCaseId } : { caseNo: targetCaseNo as number }) },
    select: { ...NOVEDAD_SELECT, type: true },
  });
  if (!target) return NextResponse.json({ error: "Novedad a enlazar no encontrada." }, { status: 404 });
  if (target.id === source.id) {
    return NextResponse.json({ error: "No puedes enlazar una novedad consigo misma." }, { status: 400 });
  }
  if (target.type !== CaseType.NOVEDAD) {
    return NextResponse.json(
      { error: "Solo se pueden enlazar entre sí casos de tipo NOVEDAD." },
      { status: 400 }
    );
  }

  const sourceGroup = resolveDuplicateGroupId(source.events);
  const targetGroup = resolveDuplicateGroupId(target.events);

  if (sourceGroup && targetGroup && sourceGroup === targetGroup) {
    return NextResponse.json({ ok: true, alreadyLinked: true, groupId: sourceGroup });
  }

  const gid =
    sourceGroup ||
    targetGroup ||
    deterministicGroupId(source.bus?.code ?? null, issueKeyForCase({ title: source.title, events: source.events }));

  const toLink: Array<{ id: string; caseNo: number | null }> = [];
  if (sourceGroup !== gid) toLink.push({ id: source.id, caseNo: source.caseNo });
  if (targetGroup !== gid) toLink.push({ id: target.id, caseNo: target.caseNo });

  if (toLink.length) {
    await prisma.caseEvent.createMany({
      data: toLink.map((c) => ({
        caseId: c.id,
        type: CaseEventType.COMMENT,
        message: `Enlazada como el mismo caso (novedad #${
          c.id === source.id ? target.caseNo ?? "" : source.caseNo ?? ""
        }).`.trim(),
        meta: { duplicateAction: "link", duplicateGroupId: gid, linkedBy: userId, manual: true },
      })),
    });

    // Al enlazar, cargar a cada caso la respuesta de la principal y sincronizar estado.
    try {
      for (const c of toLink) {
        await copyGroupResponsesTo(prisma, { tenantId, groupId: gid, targetCaseId: c.id, byUserId: userId });
      }
    } catch (e) {
      console.error("LINK_COPY_RESPONSES_FAILED", e);
    }
  }

  return NextResponse.json({ ok: true, groupId: gid, sourceCaseId: source.id, targetCaseId: target.id });
}

/**
 * Desenlaza una novedad de su grupo de duplicados.
 * Por defecto desenlaza `ctx.params.id`; con body { targetCaseId } desenlaza ese.
 */
export async function DELETE(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = (session.user as any).role as Role;
  const capabilities = (session.user as any).capabilities as string[] | undefined;
  const isVideosOnly = role === Role.BACKOFFICE && capabilities?.includes(CAPABILITIES.VIDEOS_ONLY);
  if (isVideosOnly || !isAllowedRole(role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;

  const body = await req.json().catch(() => ({} as any));
  const rawId = typeof body?.targetCaseId === "string" && body.targetCaseId.trim() ? body.targetCaseId.trim() : null;
  const caseId = rawId || String(ctx.params.id);

  const kase = await prisma.case.findFirst({
    where: { id: caseId, tenantId, type: CaseType.NOVEDAD },
    select: { id: true, caseNo: true, events: { orderBy: { createdAt: "asc" }, select: { createdAt: true, meta: true } } },
  });
  if (!kase) return NextResponse.json({ error: "Novedad no encontrada." }, { status: 404 });

  const group = resolveDuplicateGroupId(kase.events);
  if (!group) return NextResponse.json({ ok: true, alreadyUnlinked: true });

  await prisma.caseEvent.create({
    data: {
      caseId: kase.id,
      type: CaseEventType.COMMENT,
      message: "Desenlazada del grupo de duplicados.",
      meta: { duplicateAction: "unlink", previousGroupId: group, unlinkedBy: userId, manual: true },
    },
  });

  return NextResponse.json({ ok: true, caseId: kase.id });
}
