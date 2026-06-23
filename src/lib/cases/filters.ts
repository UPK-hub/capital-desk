// Construcción compartida de filtros de Casos (usada por la página y el export).
import { CaseEventType, CaseStatus } from "@prisma/client";
import { ownCasesWhere } from "@/lib/access-control";

function toStr(v: any): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

export type CasesFilterCtx = {
  tenantId: string;
  ownOnly: boolean;
  userId: string;
};

export function parseCasesParams(sp: any) {
  return {
    q: toStr(sp?.q),
    statusParam: toStr(sp?.status), // "", "NUEVO", "PROCESO", "RESUELTO"
    type: toStr(sp?.type),
    priority: toStr(sp?.priority),
    creator: toStr(sp?.creator),
    dateFromStr: toStr(sp?.dateFrom),
    dateToStr: toStr(sp?.dateTo),
  };
}

export function buildCasesWhere(sp: any, ctx: CasesFilterCtx) {
  const p = parseCasesParams(sp);
  const priorityInt = p.priority ? Number(p.priority) : null;

  const dateFromVal = p.dateFromStr ? new Date(`${p.dateFromStr}T00:00:00`) : null;
  const dateToVal = p.dateToStr ? new Date(`${p.dateToStr}T23:59:59`) : null;
  const validFrom = dateFromVal && !Number.isNaN(dateFromVal.getTime()) ? dateFromVal : null;
  const validTo = dateToVal && !Number.isNaN(dateToVal.getTime()) ? dateToVal : null;
  const createdAtWhere =
    validFrom || validTo
      ? { createdAt: { ...(validFrom ? { gte: validFrom } : {}), ...(validTo ? { lte: validTo } : {}) } }
      : {};

  const creatorWhere = p.creator
    ? {
        events: {
          some: { type: CaseEventType.CREATED, meta: { path: ["userId"], equals: p.creator } },
        },
      }
    : {};

  const qOnlyDigits = p.q ? p.q.replace(/\D/g, "") : "";
  const qDigits = qOnlyDigits ? Number(qOnlyDigits) : null;
  const searchWhere = p.q
    ? {
        OR: [
          { bus: { code: { contains: p.q, mode: "insensitive" as const } } },
          { bus: { plate: { contains: p.q, mode: "insensitive" as const } } },
          { title: { contains: p.q, mode: "insensitive" as const } },
          { description: { contains: p.q, mode: "insensitive" as const } },
          ...(qDigits !== null
            ? [{ caseNo: qDigits }, { workOrder: { workOrderNo: qDigits } }]
            : []),
        ],
      }
    : {};

  const baseWhere: any = {
    tenantId: ctx.tenantId,
    ...(ctx.ownOnly ? ownCasesWhere(ctx.userId) : {}),
    ...(p.type ? { type: p.type } : {}),
    ...(priorityInt ? { priority: priorityInt } : {}),
    ...createdAtWhere,
    ...creatorWhere,
    ...searchWhere,
  };

  const statusWhere =
    p.statusParam === "NUEVO"
      ? { status: CaseStatus.NUEVO }
      : p.statusParam === "PROCESO"
      ? { status: { in: [CaseStatus.OT_ASIGNADA, CaseStatus.EN_EJECUCION] } }
      : p.statusParam === "RESUELTO"
      ? { status: { in: [CaseStatus.RESUELTO, CaseStatus.CERRADO] } }
      : {};

  return { baseWhere, statusWhere, params: p };
}
