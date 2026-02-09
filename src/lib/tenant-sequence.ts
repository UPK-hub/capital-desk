// src/lib/tenant-sequence.ts
import { PrismaClient } from "@prisma/client";

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export async function ensureTenantSequence(tx: Tx, tenantId: string) {
  await tx.tenantSequence.upsert({
    where: { tenantId },
    create: { tenantId, nextCaseNo: 1, nextWorkOrderNo: 1, nextTicketNo: 1 },
    update: {},
  });
}

export async function nextNumbers(
  tx: Tx,
  tenantId: string,
  opts: { case?: boolean; workOrder?: boolean; ticket?: boolean }
): Promise<{ caseNo?: number; workOrderNo?: number; ticketNo?: number }> {
  const needCase = Boolean(opts.case);
  const needWo = Boolean(opts.workOrder);
  const needTicket = Boolean(opts.ticket);

  if (!needCase && !needWo && !needTicket) return {};

  await ensureTenantSequence(tx, tenantId);

  // lock row (Postgres) para evitar condiciones de carrera
  await tx.$queryRaw`SELECT "tenantId" FROM "TenantSequence" WHERE "tenantId" = ${tenantId} FOR UPDATE`;

  let seq = await tx.tenantSequence.findUnique({
    where: { tenantId },
    select: { nextCaseNo: true, nextWorkOrderNo: true, nextTicketNo: true },
  });
  if (!seq) throw new Error("TenantSequence missing after upsert");

  // Re-sincronizar si el consecutivo quedó atrás (por importaciones antiguas / migraciones)
  if (needCase) {
    const maxCase = await tx.case.aggregate({
      where: { tenantId },
      _max: { caseNo: true },
    });
    const maxCaseNo = maxCase._max.caseNo ?? 0;
    if (seq.nextCaseNo <= maxCaseNo) {
      await tx.tenantSequence.update({
        where: { tenantId },
        data: { nextCaseNo: maxCaseNo + 1 },
      });
      seq = { ...seq, nextCaseNo: maxCaseNo + 1 };
    }
  }

  if (needWo) {
    const maxWo = await tx.workOrder.aggregate({
      where: { tenantId },
      _max: { workOrderNo: true },
    });
    const maxWoNo = maxWo._max.workOrderNo ?? 0;
    if (seq.nextWorkOrderNo <= maxWoNo) {
      await tx.tenantSequence.update({
        where: { tenantId },
        data: { nextWorkOrderNo: maxWoNo + 1 },
      });
      seq = { ...seq, nextWorkOrderNo: maxWoNo + 1 };
    }
  }

  if (needTicket) {
    const maxTicket = await tx.interventionReceipt.aggregate({
      where: { tenantId },
      _max: { ticketNo: true },
    });
    const maxTicketRaw = Number(maxTicket._max.ticketNo ?? 0) || 0;
    if (seq.nextTicketNo <= maxTicketRaw) {
      await tx.tenantSequence.update({
        where: { tenantId },
        data: { nextTicketNo: maxTicketRaw + 1 },
      });
      seq = { ...seq, nextTicketNo: maxTicketRaw + 1 };
    }
  }

  const caseNo = needCase ? seq.nextCaseNo : undefined;
  const workOrderNo = needWo ? seq.nextWorkOrderNo : undefined;
  const ticketNo = needTicket ? seq.nextTicketNo : undefined;

  await tx.tenantSequence.update({
    where: { tenantId },
    data: {
      ...(needCase ? { nextCaseNo: { increment: 1 } } : {}),
      ...(needWo ? { nextWorkOrderNo: { increment: 1 } } : {}),
      ...(needTicket ? { nextTicketNo: { increment: 1 } } : {}),
    },
  });

  return { caseNo, workOrderNo, ticketNo };
}
