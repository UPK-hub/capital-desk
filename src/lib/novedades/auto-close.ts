import { prisma } from "@/lib/prisma";
import { CaseEventType, CaseStatus, CaseType } from "@prisma/client";
import { propagateStatusToGroup } from "@/lib/novedades/duplicates-server";
import { notifyNovedadClosed } from "@/lib/telegram-notify";

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
