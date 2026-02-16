export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { nextNumbers } from "@/lib/tenant-sequence";
import {
  CaseEventType,
  CaseStatus,
  CaseType,
  NotificationType,
  Role,
  WorkOrderStatus,
} from "@prisma/client";
import { notifyTenantUsers } from "@/lib/notifications";

const DAYS_21_MS = 21 * 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("x-cron-secret");

  if (secret) {
    if (header !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    const session = await getServerSession(authOptions);
    const role = session?.user?.role as Role | undefined;
    if (!session?.user || role !== Role.ADMIN) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  const dueAt = new Date(now.getTime() - DAYS_21_MS);

  const renewals = await prisma.workOrder.findMany({
    where: {
      status: WorkOrderStatus.FINALIZADA,
      finishedAt: { not: null, lte: dueAt },
      case: { type: CaseType.RENOVACION_TECNOLOGICA },
    },
    select: {
      id: true,
      tenantId: true,
      caseId: true,
      finishedAt: true,
      case: { select: { id: true, busId: true, bus: { select: { code: true } } } },
    },
    orderBy: { finishedAt: "asc" },
    take: 200,
  });

  const createdItems: Array<{
    tenantId: string;
    sourceWorkOrderId: string;
    sourceCaseId: string;
    preventiveCaseId: string;
    busCode: string;
    scheduledAt: Date;
  }> = [];

  for (const item of renewals) {
    const result = await prisma.$transaction(async (tx) => {
      const exists = await tx.caseEvent.findFirst({
        where: {
          type: CaseEventType.CREATED,
          meta: { path: ["sourceRenewalCaseId"], equals: item.caseId },
        },
        select: { caseId: true },
      });
      if (exists) return null;

      const nums = await nextNumbers(tx as any, item.tenantId, { case: true, workOrder: true });
      const scheduledAt = new Date((item.finishedAt as Date).getTime() + DAYS_21_MS);
      const prevCase = await tx.case.create({
        data: {
          tenantId: item.tenantId,
          caseNo: nums.caseNo!,
          type: CaseType.PREVENTIVO,
          status: CaseStatus.NUEVO,
          priority: 3,
          title: `Preventivo automático post renovación - ${item.case.bus.code}`,
          description: `Preventivo generado automáticamente 21 días después de la renovación tecnológica (${item.case.id}).`,
          busId: item.case.busId,
        },
      });

      const busEquipments = await tx.busEquipment.findMany({
        where: { busId: item.case.busId, active: true },
        select: { id: true },
      });

      if (busEquipments.length) {
        await tx.caseEquipment.createMany({
          data: busEquipments.map((e) => ({ caseId: prevCase.id, busEquipmentId: e.id })),
          skipDuplicates: true,
        });
      }

      await tx.caseEvent.create({
        data: {
          caseId: prevCase.id,
          type: CaseEventType.CREATED,
          message: "Caso creado automáticamente en día 21 post renovación tecnológica",
          meta: { sourceRenewalCaseId: item.caseId, sourceWorkOrderId: item.id },
        },
      });

      await tx.workOrder.create({
        data: {
          tenantId: item.tenantId,
          workOrderNo: nums.workOrderNo!,
          caseId: prevCase.id,
          scheduledAt,
        },
      });

      await tx.caseEvent.create({
        data: {
          caseId: item.caseId,
          type: CaseEventType.COMMENT,
          message: "Preventivo automático generado por regla día 21 post renovación.",
          meta: { generatedPreventiveCaseId: prevCase.id, sourceWorkOrderId: item.id, generatedAt: now.toISOString() },
        },
      });

      return {
        tenantId: item.tenantId,
        sourceWorkOrderId: item.id,
        sourceCaseId: item.caseId,
        preventiveCaseId: prevCase.id,
        busCode: item.case.bus.code,
        scheduledAt,
      };
    });

    if (result) createdItems.push(result);
  }

  for (const created of createdItems) {
    await notifyTenantUsers({
      tenantId: created.tenantId,
      roles: [Role.ADMIN, Role.BACKOFFICE],
      type: NotificationType.CASE_CREATED,
      title: "Preventivo automático generado (día 21)",
      body: `Bus ${created.busCode} · Caso ${created.preventiveCaseId}`,
      meta: {
        sourceWorkOrderId: created.sourceWorkOrderId,
        sourceCaseId: created.sourceCaseId,
        preventiveCaseId: created.preventiveCaseId,
        scheduledAt: created.scheduledAt.toISOString(),
      },
      href: `/cases/${created.preventiveCaseId}`,
    });
  }

  return NextResponse.json({
    ok: true,
    scanned: renewals.length,
    created: createdItems.length,
  });
}

