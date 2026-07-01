// Genera la revisión remota del día: crea (o refresca) la review de la fecha con
// los buses priorizados por el motor. Idempotente: no pisa buses ya revisados,
// solo agrega los que falten y refresca su motivo/orden de prioridad.
import { prisma } from "@/lib/prisma";
import { buildRvrValidationQueue } from "@/lib/rvr/priority";
import { pickNvrIpFromEquipments, RVR_MAX_BUSES_PER_DAY } from "@/lib/rvr";

export async function generateDailyRvr(
  tenantId: string,
  reviewDate: Date,
  responsibleId?: string | null
): Promise<{ reviewId: string; total: number; created: number }> {
  const queue = await buildRvrValidationQueue(tenantId, RVR_MAX_BUSES_PER_DAY);

  const review = await prisma.remoteVisualReview.upsert({
    where: { tenantId_reviewDate: { tenantId, reviewDate } },
    create: {
      tenantId,
      reviewDate,
      responsibleId: responsibleId ?? null,
      busLimit: RVR_MAX_BUSES_PER_DAY,
      busCount: 0,
      status: "DRAFT",
    },
    update: { busLimit: RVR_MAX_BUSES_PER_DAY },
    select: { id: true },
  });

  let created = 0;
  if (queue.length > 0) {
    const busIds = queue.map((q) => q.busId);
    const buses = await prisma.bus.findMany({
      where: { id: { in: busIds } },
      select: {
        id: true,
        equipments: {
          where: { active: true },
          select: { ipAddress: true, location: true, equipmentType: { select: { name: true } } },
        },
      },
    });
    const nvrByBus = new Map(buses.map((b) => [b.id, pickNvrIpFromEquipments(b.equipments)]));

    const existing = await prisma.remoteVisualReviewBus.findMany({
      where: { reviewId: review.id, busId: { in: busIds } },
      select: { busId: true },
    });
    const existingSet = new Set(existing.map((e) => e.busId));

    for (const q of queue) {
      if (existingSet.has(q.busId)) {
        // Ya está en la review: solo refrescar la prioridad (no tocar checklist/evidencias).
        await prisma.remoteVisualReviewBus.updateMany({
          where: { reviewId: review.id, busId: q.busId },
          data: { priorityRank: q.rank, priorityReason: q.reason, priorityDetail: q.detail },
        });
        continue;
      }
      await prisma.remoteVisualReviewBus.create({
        data: {
          reviewId: review.id,
          busId: q.busId,
          busCode: q.busCode,
          busPlate: q.busPlate,
          nvrIp: nvrByBus.get(q.busId) ?? null,
          priorityRank: q.rank,
          priorityReason: q.reason,
          priorityDetail: q.detail,
          requiresCorrective: false,
        },
      });
      created++;
    }
  }

  const total = await prisma.remoteVisualReviewBus.count({ where: { reviewId: review.id } });
  await prisma.remoteVisualReview.update({ where: { id: review.id }, data: { busCount: total } });

  return { reviewId: review.id, total, created };
}
