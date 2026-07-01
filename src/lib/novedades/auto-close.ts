import { prisma } from "@/lib/prisma";
import { CaseEventType, CaseStatus, CaseType } from "@prisma/client";
import { propagateStatusToGroup } from "@/lib/novedades/duplicates-server";
import { notifyNovedadClosed, notifyNovedadReopened } from "@/lib/telegram-notify";

/**
 * Lee los CaseEvent de un caso y devuelve el id de la novedad de origen
 * (convención: meta.sourceCaseId = id de la novedad), si existe.
 */
function extractSourceCaseId(events: Array<{ meta: unknown }>): string | null {
  for (const event of events) {
    const meta = (event.meta ?? {}) as any;
    if (meta?.sourceCaseId) return String(meta.sourceCaseId);
  }
  return null;
}

/**
 * Dado un caso enlazado (CORRECTIVO/PREVENTIVO), devuelve el id de la novedad
 * de origen. Útil para capturarlo ANTES de borrar el caso (al borrarlo se
 * eliminan sus CaseEvent y se pierde el enlace).
 */
export async function findSourceNovedadId(linkedCaseId: string): Promise<string | null> {
  if (!linkedCaseId) return null;
  const events = await prisma.caseEvent.findMany({
    where: { caseId: linkedCaseId },
    select: { meta: true },
  });
  return extractSourceCaseId(events);
}

/**
 * Cierra automáticamente una NOVEDAD cuando TODOS sus casos enlazados
 * (CORRECTIVO / PREVENTIVO con meta.sourceCaseId == novedad.id) están
 * en estado CERRADO o RESUELTO.
 *
 * Se invoca después de cada punto donde un caso enlazado pasa a CERRADO/RESUELTO.
 * Nunca lanza: cualquier error se captura y registra para no romper el flujo
 * que la llama.
 *
 * @returns `true` si cerró la novedad en esta invocación; `false` en cualquier otro caso.
 */
export async function maybeAutoCloseLinkedNovedad(
  tenantId: string,
  linkedCaseId: string,
  byUserId?: string
): Promise<boolean> {
  try {
    if (!tenantId || !linkedCaseId) return false;

    // 1) Encontrar la novedad de origen a partir de los events del caso enlazado.
    const linkedEvents = await prisma.caseEvent.findMany({
      where: { caseId: linkedCaseId },
      orderBy: { createdAt: "asc" },
      select: { meta: true },
    });
    const novedadId = extractSourceCaseId(linkedEvents);
    if (!novedadId) return false;

    // 2) Cargar la novedad (debe ser NOVEDAD del mismo tenant).
    const novedad = await prisma.case.findFirst({
      where: { id: novedadId, tenantId, type: CaseType.NOVEDAD },
      select: { id: true, caseNo: true, status: true },
    });
    if (!novedad) return false;
    if (novedad.status === CaseStatus.CERRADO) return false;

    // 3) Reunir TODOS los casos enlazados a esa novedad
    //    (CORRECTIVO/PREVENTIVO cuyos events tengan meta.sourceCaseId == novedad.id).
    const linkedCases = await prisma.case.findMany({
      where: {
        tenantId,
        type: { in: [CaseType.CORRECTIVO, CaseType.PREVENTIVO] },
        events: {
          some: { meta: { path: ["sourceCaseId"], equals: novedad.id } },
        },
      },
      select: { id: true, status: true },
    });

    // 4) Cerrar solo si hay al menos 1 enlazado y TODOS están CERRADO/RESUELTO.
    if (linkedCases.length === 0) return false;
    const allClosed = linkedCases.every(
      (c) => c.status === CaseStatus.CERRADO || c.status === CaseStatus.RESUELTO
    );
    if (!allClosed) return false;

    await prisma.$transaction(async (tx) => {
      await tx.case.update({
        where: { id: novedad.id },
        data: { status: CaseStatus.CERRADO },
      });
      await tx.caseEvent.create({
        data: {
          caseId: novedad.id,
          type: CaseEventType.STATUS_CHANGE,
          message: "Novedad cerrada automáticamente: casos enlazados resueltos",
          meta: {
            auto: true,
            ...(byUserId ? { by: byUserId } : {}),
            linkedCaseIds: linkedCases.map((c) => c.id),
          },
        },
      });
    });

    // Si esta novedad es parte de un grupo "mismo caso", cerrar las dependientes.
    try {
      await propagateStatusToGroup(prisma, {
        tenantId,
        fromCaseId: novedad.id,
        status: CaseStatus.CERRADO,
        byUserId,
      });
    } catch (error) {
      console.error("AUTO_CLOSE_PROPAGATE_FAILED", { tenantId, novedadId: novedad.id, error });
    }

    // Avisar al grupo de Telegram que la novedad se cerró (automático).
    await notifyNovedadClosed(novedad.id, { auto: true, closedById: byUserId });

    return true;
  } catch (error) {
    console.error("AUTO_CLOSE_NOVEDAD_FAILED", { tenantId, linkedCaseId, error });
    return false;
  }
}

/**
 * REABRE una novedad que había quedado CERRADA AUTOMÁTICAMENTE cuando se elimina
 * el correctivo/preventivo enlazado que la resolvía. Se llama DESPUÉS de borrar
 * el caso enlazado, pasando el `novedadId` capturado ANTES del borrado.
 *
 * Solo reabre si:
 *  - la novedad está CERRADA,
 *  - su último cierre fue AUTOMÁTICO (meta.auto === true; si fue manual, no se toca), y
 *  - ya NO quedan casos enlazados que la justifiquen (ninguno, o alguno sin resolver).
 *
 * Nunca lanza. @returns `true` si reabrió la novedad.
 */
export async function maybeReopenNovedadAfterUnlink(
  tenantId: string,
  novedadId: string,
  byUserId?: string
): Promise<boolean> {
  try {
    if (!tenantId || !novedadId) return false;

    const novedad = await prisma.case.findFirst({
      where: { id: novedadId, tenantId, type: CaseType.NOVEDAD },
      select: { id: true, status: true },
    });
    if (!novedad) return false;
    if (novedad.status !== CaseStatus.CERRADO) return false;

    // ¿El cierre más reciente fue automático? Si fue manual, respetarlo (no reabrir).
    const lastStatusChange = await prisma.caseEvent.findFirst({
      where: { caseId: novedad.id, type: CaseEventType.STATUS_CHANGE },
      orderBy: { createdAt: "desc" },
      select: { meta: true },
    });
    const wasAutoClosed = ((lastStatusChange?.meta ?? {}) as any)?.auto === true;
    if (!wasAutoClosed) return false;

    // Recomputar los casos enlazados restantes (el que se borró ya no cuenta).
    const linkedCases = await prisma.case.findMany({
      where: {
        tenantId,
        type: { in: [CaseType.CORRECTIVO, CaseType.PREVENTIVO] },
        events: { some: { meta: { path: ["sourceCaseId"], equals: novedad.id } } },
      },
      select: { id: true, status: true },
    });
    const stillJustified =
      linkedCases.length > 0 &&
      linkedCases.every(
        (c) => c.status === CaseStatus.CERRADO || c.status === CaseStatus.RESUELTO
      );
    if (stillJustified) return false; // otro caso enlazado sigue resolviéndola

    await prisma.$transaction(async (tx) => {
      await tx.case.update({
        where: { id: novedad.id },
        data: { status: CaseStatus.NUEVO },
      });
      await tx.caseEvent.create({
        data: {
          caseId: novedad.id,
          type: CaseEventType.STATUS_CHANGE,
          message:
            "Novedad reabierta automáticamente: se eliminó el caso enlazado que la había resuelto",
          meta: { auto: true, reopened: true, ...(byUserId ? { by: byUserId } : {}) },
        },
      });
    });

    // Avisar al grupo que la novedad se reabrió.
    await notifyNovedadReopened(novedad.id, { by: byUserId });

    return true;
  } catch (error) {
    console.error("REOPEN_NOVEDAD_FAILED", { tenantId, novedadId, error });
    return false;
  }
}
