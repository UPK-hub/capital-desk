// src/lib/tenant-sequence.ts
import { PrismaClient } from "@prisma/client";

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export async function ensureTenantSequence(tx: Tx, tenantId: string) {
  await tx.tenantSequence.upsert({
    where: { tenantId },
    create: { tenantId, nextCaseNo: 1, nextWorkOrderNo: 1 },
    update: {},
  });
}

export async function nextNumbers(
  tx: Tx,
  tenantId: string,
  opts: { case?: boolean; workOrder?: boolean }
): Promise<{ caseNo?: number; workOrderNo?: number }> {
  const needCase = Boolean(opts.case);
  const needWo = Boolean(opts.workOrder);

  if (!needCase && !needWo) return {};

  await ensureTenantSequence(tx, tenantId);

  // lock row (Postgres) para evitar condiciones de carrera
  await tx.$queryRaw`SELECT "tenantId" FROM "TenantSequence" WHERE "tenantId" = ${tenantId} FOR UPDATE`;

  const seq = await tx.tenantSequence.findUnique({
    where: { tenantId },
    select: { nextCaseNo: true, nextWorkOrderNo: true },
  });
  if (!seq) throw new Error("TenantSequence missing after upsert");

  const caseNo = needCase ? seq.nextCaseNo : undefined;
  const workOrderNo = needWo ? seq.nextWorkOrderNo : undefined;

  await tx.tenantSequence.update({
    where: { tenantId },
    data: {
      ...(needCase ? { nextCaseNo: { increment: 1 } } : {}),
      ...(needWo ? { nextWorkOrderNo: { increment: 1 } } : {}),
    },
  });

  return { caseNo, workOrderNo };
}
