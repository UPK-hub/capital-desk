import { prisma } from "@/lib/prisma";
import { CaseEventType } from "@prisma/client";

/**
 * Devuelve los IDs de usuarios "interesados" (stakeholders) de un caso, para
 * notificar de forma ACOTADA (no masiva). Incluye:
 *  - El CREADOR del caso: se lee del CaseEvent type CREATED (meta.userId).
 *  - El TÉCNICO asignado a la OT del caso (workOrder.assignedToId), si existe.
 *
 * Solo retorna usuarios activos del tenant indicado. La lista viene
 * deduplicada. Si no hay stakeholders válidos, retorna [].
 */
export async function getCaseStakeholderUserIds(
  tenantId: string,
  caseId: string
): Promise<string[]> {
  const candidateIds = new Set<string>();

  // 1) Creador del caso -> CaseEvent CREATED, meta.userId
  const createdEvent = await prisma.caseEvent.findFirst({
    where: { caseId, type: CaseEventType.CREATED, case: { tenantId } },
    orderBy: { createdAt: "asc" },
    select: { meta: true },
  });
  const creatorId = (createdEvent?.meta as any)?.userId;
  if (typeof creatorId === "string" && creatorId.trim()) {
    candidateIds.add(creatorId.trim());
  }

  // 2) Técnico asignado a la OT del caso (relación 1:1 Case.workOrder)
  const workOrder = await prisma.workOrder.findFirst({
    where: { caseId, tenantId },
    select: { assignedToId: true },
  });
  if (workOrder?.assignedToId) {
    candidateIds.add(workOrder.assignedToId);
  }

  if (!candidateIds.size) return [];

  // Filtrar a solo usuarios activos del tenant (defensa adicional) y deduplicar.
  const users = await prisma.user.findMany({
    where: { tenantId, active: true, id: { in: Array.from(candidateIds) } },
    select: { id: true },
  });

  return users.map((u) => u.id);
}
