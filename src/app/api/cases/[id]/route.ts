export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CaseEventType, CaseStatus, NotificationType, Role } from "@prisma/client";
import { CASE_TYPE_REGISTRY } from "@/lib/case-type-registry";
import { VideoDownloadRequestSchema } from "@/lib/validators/video";
import { notifyTenantUsers } from "@/lib/notifications";
import { nextNumbers } from "@/lib/tenant-sequence";

function normalizePriority(input: any): number | undefined {
  if (input === null || input === undefined || input === "") return undefined;
  const n = typeof input === "number" ? input : Number(String(input));
  if (Number.isFinite(n)) return Math.max(1, Math.min(5, Math.trunc(n)));
  const s = String(input).toUpperCase();
  if (s === "ALTA") return 2;
  if (s === "MEDIA") return 3;
  if (s === "BAJA") return 4;
  return undefined;
}

function parseDateOrNull(v: any): Date | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = (session.user as any).tenantId as string;

  const items = await prisma.case.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      bus: { select: { code: true, plate: true } },
      workOrder: true,
    },
  });

  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;

  const body = await req.json().catch(() => ({}));

  const type = body.type as keyof typeof CASE_TYPE_REGISTRY;
  const cfg = CASE_TYPE_REGISTRY[type];
  if (!cfg) return NextResponse.json({ error: "Tipo de caso inválido" }, { status: 400 });

  const busId = String(body.busId ?? "").trim();
  if (!busId) return NextResponse.json({ error: "Selecciona un bus" }, { status: 400 });

  const busEquipmentId = body.busEquipmentId ? String(body.busEquipmentId) : null;
  if (cfg.requiresEquipment && !busEquipmentId) {
    return NextResponse.json({ error: "Equipo del bus requerido para este tipo de caso" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();
  if (title.length < 3) return NextResponse.json({ error: "Título muy corto" }, { status: 400 });
  if (description.length < 5) return NextResponse.json({ error: "Descripción muy corta" }, { status: 400 });

  const priority = normalizePriority(body.priority);

  if (cfg.hasInlineCreateForm) {
    const v = VideoDownloadRequestSchema.safeParse(body.videoDownloadRequest);
    if (!v.success) {
      return NextResponse.json({ error: v.error.issues[0]?.message ?? "Formulario de video inválido" }, { status: 400 });
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const nums = await nextNumbers(tx as any, tenantId, {
      case: true,
      workOrder: cfg.requiresWorkOrder,
    });

    const c = await tx.case.create({
      data: {
        tenantId,
        caseNo: nums.caseNo!, // requerido
        type: cfg.type,
        status: CaseStatus.NUEVO,
        priority: priority ?? 3,
        title,
        description,
        busId,
        busEquipmentId,
      },
    });

    await tx.caseEvent.create({
      data: { caseId: c.id, type: CaseEventType.CREATED, message: "Caso creado", meta: { userId } },
    });

    if (cfg.requiresWorkOrder) {
      await tx.workOrder.create({
        data: {
          tenantId,
          workOrderNo: nums.workOrderNo!, // requerido
          caseId: c.id,
        },
      });

      await tx.case.update({ where: { id: c.id }, data: { status: CaseStatus.OT_ASIGNADA } });

      await tx.caseEvent.create({
        data: { caseId: c.id, type: CaseEventType.STATUS_CHANGE, message: "OT creada automáticamente", meta: { userId } },
      });
    }

    if (cfg.hasInlineCreateForm) {
      const v = body.videoDownloadRequest ?? {};
      await tx.videoDownloadRequest.create({
        data: {
          caseId: c.id,
          origin: v.origin,
          requestType: v.requestType || null,
          tmsaRadicado: v.radicadoTMSA || null,
          tmsaFiledAt: parseDateOrNull(v.radicadoTMSADate),
          concessionaireFiledAt: parseDateOrNull(v.radicadoConcesionarioDate),
          requesterName: v.requesterName || null,
          requesterId: v.requesterDocument || null,
          requesterRole: v.requesterRole || null,
          requesterPhone: v.requesterPhone || null,
          requesterEmail: v.requesterEmail || null,
          vehicleId: v.vehicleId || null,
          eventStart: parseDateOrNull(v.eventStartAt),
          eventEnd: parseDateOrNull(v.eventEndAt),
          camerasRequested: v.cameras || null,
          deliveryMethod: v.deliveryMethod || null,
        },
      });

      await tx.caseEvent.create({
        data: { caseId: c.id, type: CaseEventType.COMMENT, message: "Formulario video guardado", meta: { userId } },
      });
    }

    return c;
  });

  await notifyTenantUsers({
    tenantId,
    roles: [Role.ADMIN, Role.BACKOFFICE],
    type: NotificationType.CASE_CREATED,
    title: `Nuevo caso: ${created.title}`,
    body: `Tipo: ${created.type} | Estado: ${created.status}`,
    meta: { caseId: created.id },
  });

  return NextResponse.json(created);
}
