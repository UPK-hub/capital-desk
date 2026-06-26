/**
 * Helpers de servidor (con acceso a BD) para agrupar novedades duplicadas.
 * La lógica pura (claves, ids de grupo, resolución desde eventos) vive en
 * ./duplicates. Aquí solo se hacen lecturas/escrituras en Prisma.
 */
import { CaseEventType, CaseStatus, CaseType, Prisma, PrismaClient } from "@prisma/client";
import { deterministicGroupId, issueKeyForCase, resolveDuplicateGroupId } from "./duplicates";

type Db = PrismaClient | Prisma.TransactionClient;

const CASE_EVENT_SELECT = { createdAt: true, meta: true } as const;

/**
 * Auto-agrupa una novedad recién creada/editada con otras novedades del MISMO
 * bus + MISMA novedad (clave de caso). Solo enlaza si existe al menos otra
 * novedad hermana abierta. Idempotente (id de grupo determinista).
 *
 * Pensado para llamarse en try/catch: nunca debe romper el flujo principal.
 * Devuelve el id de grupo si quedó enlazada, o null si no había con qué agrupar.
 */
export async function autoGroupNovedad(
  db: Db,
  params: { tenantId: string; caseId: string }
): Promise<string | null> {
  const target = await db.case.findFirst({
    where: { id: params.caseId, tenantId: params.tenantId, type: CaseType.NOVEDAD },
    select: {
      id: true,
      busId: true,
      title: true,
      bus: { select: { code: true } },
      events: { orderBy: { createdAt: "asc" }, select: CASE_EVENT_SELECT },
    },
  });
  if (!target) return null;

  const issueKey = issueKeyForCase({ title: target.title, events: target.events });
  const targetGroup = resolveDuplicateGroupId(target.events);

  // Candidatas: novedades del mismo bus, no cerradas, distintas a esta.
  const candidates = await db.case.findMany({
    where: {
      tenantId: params.tenantId,
      type: CaseType.NOVEDAD,
      busId: target.busId,
      id: { not: target.id },
      status: { not: CaseStatus.CERRADO },
    },
    select: {
      id: true,
      title: true,
      events: { orderBy: { createdAt: "asc" }, select: CASE_EVENT_SELECT },
    },
  });

  const siblings = candidates
    .map((c) => ({
      id: c.id,
      issueKey: issueKeyForCase({ title: c.title, events: c.events }),
      group: resolveDuplicateGroupId(c.events),
    }))
    .filter((c) => c.issueKey === issueKey);

  if (siblings.length === 0) return null; // no hay con qué agrupar

  // Id de grupo: reusa el que ya tenga cualquiera; si no, determinista.
  const existing = targetGroup || siblings.map((s) => s.group).find(Boolean) || null;
  const gid = existing || deterministicGroupId(target.bus?.code ?? null, issueKey);

  const toLink: string[] = [];
  if (targetGroup !== gid) toLink.push(target.id);
  for (const s of siblings) if (s.group !== gid) toLink.push(s.id);

  if (toLink.length) {
    await db.caseEvent.createMany({
      data: toLink.map((caseId) => ({
        caseId,
        type: CaseEventType.COMMENT,
        message: "Novedad marcada como el mismo caso (duplicada).",
        meta: { duplicateAction: "link", duplicateGroupId: gid, auto: true },
      })),
    });
  }

  return gid;
}
