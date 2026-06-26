/**
 * Helpers de servidor (con acceso a BD) para novedades duplicadas / "mismo caso".
 *
 * Modelo: principal + dependientes.
 *  - La pertenencia al grupo se guarda en CaseEvent.meta.duplicateGroupId (link/unlink).
 *  - La PRINCIPAL es la novedad más antigua del grupo (se calcula, no se guarda).
 *  - Auto-agrupado POR CREADOR (mismo usuario + mismo bus + misma novedad).
 *  - Entre creadores distintos NO se agrupa solo: se detecta como "similar" para alertar.
 *  - La respuesta (comentarios), el estado y el cierre de un caso del grupo se
 *    propagan a los demás miembros.
 *
 * La lógica pura vive en ./duplicates. Todo aquí va pensado para try/catch:
 * nunca debe romper el flujo que lo llama.
 */
import { CaseEventType, CaseStatus, CaseType, Prisma, PrismaClient } from "@prisma/client";
import {
  deterministicGroupId,
  extractCreatorId,
  issueKeyForCase,
  principalIdOf,
  resolveDuplicateGroupId,
} from "./duplicates";

type Db = PrismaClient | Prisma.TransactionClient;

const EVENT_SELECT = { type: true, createdAt: true, meta: true } as const;

export type GroupMember = {
  id: string;
  caseNo: number | null;
  status: CaseStatus;
  createdAt: Date;
  busCode: string;
  creatorId: string | null;
};

export type DuplicateGroup = {
  groupId: string | null;
  members: GroupMember[];
  principalId: string | null;
};

/** Devuelve el grupo de duplicados actual de un caso (miembros + principal). */
export async function getDuplicateGroup(db: Db, params: { tenantId: string; caseId: string }): Promise<DuplicateGroup> {
  const self = await db.case.findFirst({
    where: { id: params.caseId, tenantId: params.tenantId, type: CaseType.NOVEDAD },
    select: { events: { orderBy: { createdAt: "asc" }, select: EVENT_SELECT } },
  });
  const groupId = self ? resolveDuplicateGroupId(self.events) : null;
  if (!groupId) return { groupId: null, members: [], principalId: null };

  const rows = await db.case.findMany({
    where: {
      tenantId: params.tenantId,
      type: CaseType.NOVEDAD,
      events: { some: { meta: { path: ["duplicateGroupId"], equals: groupId } } },
    },
    select: {
      id: true,
      caseNo: true,
      status: true,
      createdAt: true,
      bus: { select: { code: true } },
      events: { orderBy: { createdAt: "asc" }, select: EVENT_SELECT },
    },
  });

  const members: GroupMember[] = rows
    .filter((r) => resolveDuplicateGroupId(r.events) === groupId)
    .map((r) => ({
      id: r.id,
      caseNo: r.caseNo,
      status: r.status,
      createdAt: r.createdAt,
      busCode: r.bus?.code ?? "",
      creatorId: extractCreatorId(r.events),
    }));

  return { groupId, members, principalId: principalIdOf(members) };
}

/**
 * Auto-agrupa una novedad con otras del MISMO creador + mismo bus + misma novedad.
 * Idempotente (id de grupo determinista por creador). Devuelve el groupId o null.
 */
export async function autoGroupNovedad(db: Db, params: { tenantId: string; caseId: string }): Promise<string | null> {
  const target = await db.case.findFirst({
    where: { id: params.caseId, tenantId: params.tenantId, type: CaseType.NOVEDAD },
    select: {
      id: true,
      busId: true,
      title: true,
      bus: { select: { code: true } },
      events: { orderBy: { createdAt: "asc" }, select: EVENT_SELECT },
    },
  });
  if (!target) return null;

  const issueKey = issueKeyForCase({ title: target.title, events: target.events });
  const creatorId = extractCreatorId(target.events);
  const targetGroup = resolveDuplicateGroupId(target.events);

  const candidates = await db.case.findMany({
    where: { tenantId: params.tenantId, type: CaseType.NOVEDAD, busId: target.busId, id: { not: target.id } },
    select: { id: true, title: true, events: { orderBy: { createdAt: "asc" }, select: EVENT_SELECT } },
  });

  const siblings = candidates
    .map((c) => ({
      id: c.id,
      issueKey: issueKeyForCase({ title: c.title, events: c.events }),
      creatorId: extractCreatorId(c.events),
      group: resolveDuplicateGroupId(c.events),
    }))
    .filter((c) => c.issueKey === issueKey && c.creatorId === creatorId); // MISMO creador

  if (siblings.length === 0) return null;

  const existing = targetGroup || siblings.map((s) => s.group).find(Boolean) || null;
  const gid = existing || deterministicGroupId(target.bus?.code ?? null, issueKey, creatorId);

  const toLink: string[] = [];
  if (targetGroup !== gid) toLink.push(target.id);
  for (const s of siblings) if (s.group !== gid) toLink.push(s.id);

  if (toLink.length) {
    await db.caseEvent.createMany({
      data: toLink.map((caseId) => ({
        caseId,
        type: CaseEventType.COMMENT,
        message: "Novedad agrupada como el mismo caso (mismo usuario).",
        meta: { duplicateAction: "link", duplicateGroupId: gid, auto: true },
      })),
    });
  }
  return gid;
}

/**
 * Novedades del mismo bus + misma novedad pero de OTRO creador, que no están en
 * el mismo grupo: candidatas para la alerta "novedad similar/igual ya reportada".
 */
export async function findSimilarOtherCreator(
  db: Db,
  params: { tenantId: string; caseId: string }
): Promise<Array<{ id: string; caseNo: number | null; status: CaseStatus; creatorId: string | null }>> {
  const target = await db.case.findFirst({
    where: { id: params.caseId, tenantId: params.tenantId, type: CaseType.NOVEDAD },
    select: {
      id: true,
      busId: true,
      title: true,
      events: { orderBy: { createdAt: "asc" }, select: EVENT_SELECT },
    },
  });
  if (!target) return [];

  const issueKey = issueKeyForCase({ title: target.title, events: target.events });
  const creatorId = extractCreatorId(target.events);
  const targetGroup = resolveDuplicateGroupId(target.events);

  const candidates = await db.case.findMany({
    where: { tenantId: params.tenantId, type: CaseType.NOVEDAD, busId: target.busId, id: { not: target.id } },
    select: {
      id: true,
      caseNo: true,
      status: true,
      title: true,
      events: { orderBy: { createdAt: "asc" }, select: EVENT_SELECT },
    },
  });

  return candidates
    .map((c) => ({
      id: c.id,
      caseNo: c.caseNo,
      status: c.status,
      title: c.title,
      creatorId: extractCreatorId(c.events),
      issueKey: issueKeyForCase({ title: c.title, events: c.events }),
      group: resolveDuplicateGroupId(c.events),
    }))
    .filter(
      (c) =>
        c.issueKey === issueKey &&
        c.creatorId !== creatorId && // OTRO creador
        !(targetGroup && c.group === targetGroup) // aún no enlazadas en el mismo grupo
    )
    .map(({ id, caseNo, status, creatorId }) => ({ id, caseNo, status, creatorId }));
}

/** Copia un comentario (respuesta) a los demás miembros del grupo del caso. */
export async function propagateCommentToGroup(
  db: Db,
  params: { tenantId: string; fromCaseId: string; message: string; byUserId?: string; sourceEventId?: string }
): Promise<number> {
  const { members } = await getDuplicateGroup(db, { tenantId: params.tenantId, caseId: params.fromCaseId });
  const others = members.filter((m) => m.id !== params.fromCaseId);
  if (others.length === 0) return 0;
  await db.caseEvent.createMany({
    data: others.map((m) => ({
      caseId: m.id,
      type: CaseEventType.COMMENT,
      message: params.message,
      meta: {
        userId: params.byUserId,
        duplicatePropagated: true,
        propagatedFrom: params.fromCaseId,
        ...(params.sourceEventId ? { sourceEventId: params.sourceEventId } : {}),
      },
    })),
  });
  return others.length;
}

/** Propaga un estado/cierre a los demás miembros del grupo del caso. */
export async function propagateStatusToGroup(
  db: Db,
  params: { tenantId: string; fromCaseId: string; status: CaseStatus; byUserId?: string }
): Promise<number> {
  const { members } = await getDuplicateGroup(db, { tenantId: params.tenantId, caseId: params.fromCaseId });
  const others = members.filter((m) => m.id !== params.fromCaseId && m.status !== params.status);
  let changed = 0;
  for (const m of others) {
    await db.case.update({ where: { id: m.id }, data: { status: params.status } });
    await db.caseEvent.create({
      data: {
        caseId: m.id,
        type: CaseEventType.STATUS_CHANGE,
        message: `Estado heredado de la novedad principal (${params.status}).`,
        meta: { duplicatePropagated: true, propagatedFrom: params.fromCaseId, inheritedStatus: params.status, by: params.byUserId },
      },
    });
    changed += 1;
  }
  return changed;
}

/**
 * Al enlazar una novedad al grupo, le carga las respuestas (comentarios manuales)
 * que ya tiene la principal y sincroniza su estado con el de la principal.
 */
export async function copyGroupResponsesTo(
  db: Db,
  params: { tenantId: string; groupId: string; targetCaseId: string; byUserId?: string }
): Promise<number> {
  const rows = await db.case.findMany({
    where: {
      tenantId: params.tenantId,
      type: CaseType.NOVEDAD,
      events: { some: { meta: { path: ["duplicateGroupId"], equals: params.groupId } } },
    },
    select: {
      id: true,
      status: true,
      createdAt: true,
      events: { orderBy: { createdAt: "asc" }, select: { id: true, type: true, message: true, createdAt: true, meta: true } },
    },
  });
  const members = rows.filter((r) => resolveDuplicateGroupId(r.events) === params.groupId);
  const principal =
    members
      .map((m) => ({ id: m.id, createdAt: m.createdAt }))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0] ?? null;
  if (!principal || principal.id === params.targetCaseId) return 0;

  const principalRow = members.find((m) => m.id === principal.id);
  const target = members.find((m) => m.id === params.targetCaseId);
  if (!principalRow || !target) return 0;

  // Respuestas manuales de la principal aún no copiadas al objetivo.
  const already = new Set(
    target.events.map((e) => ((e.meta ?? {}) as any)?.sourceEventId).filter(Boolean)
  );
  const toCopy = principalRow.events.filter((e) => {
    const meta = (e.meta ?? {}) as any;
    return e.type === CaseEventType.COMMENT && meta?.manualComment === true && !already.has(e.id) && e.message;
  });

  if (toCopy.length) {
    await db.caseEvent.createMany({
      data: toCopy.map((e) => ({
        caseId: params.targetCaseId,
        type: CaseEventType.COMMENT,
        message: e.message as string,
        meta: { userId: params.byUserId, duplicatePropagated: true, propagatedFrom: principal.id, sourceEventId: e.id },
      })),
    });
  }

  // Sincroniza estado del objetivo con la principal.
  if (principalRow.status !== target.status) {
    await db.case.update({ where: { id: params.targetCaseId }, data: { status: principalRow.status } });
    await db.caseEvent.create({
      data: {
        caseId: params.targetCaseId,
        type: CaseEventType.STATUS_CHANGE,
        message: `Estado heredado de la novedad principal (${principalRow.status}).`,
        meta: { duplicatePropagated: true, propagatedFrom: principal.id, inheritedStatus: principalRow.status, by: params.byUserId },
      },
    });
  }

  return toCopy.length;
}
