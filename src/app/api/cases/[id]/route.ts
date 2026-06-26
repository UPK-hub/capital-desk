export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CaseEventType, CaseStatus, CaseType, NotificationType, Role, StsTicketChannel, StsTicketSeverity } from "@prisma/client";
import { CASE_TYPE_REGISTRY } from "@/lib/case-type-registry";
import { VideoDownloadRequestSchema } from "@/lib/validators/video";
import { notifyTenantUsers } from "@/lib/notifications";
import { nextNumbers } from "@/lib/tenant-sequence";
import { propagateStatusToGroup } from "@/lib/novedades/duplicates-server";
import { CAPABILITIES } from "@/lib/capabilities";
import { restrictedCasesWhere } from "@/lib/access-control";

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

  const role = (session.user as any).role as Role;
  if (role !== Role.ADMIN && role !== Role.BACKOFFICE) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const caps = ((session.user as any).capabilities as string[] | undefined) ?? [];
  const userId = String((session.user as any).id ?? "");
  const tenantId = (session.user as any).tenantId as string;
  const ownOnly = role === Role.BACKOFFICE && caps.includes(CAPABILITIES.OWN_CASES_ONLY);

  const items = await prisma.case.findMany({
    where: { tenantId, ...(ownOnly ? await restrictedCasesWhere({ tenantId, userId }) : {}) },
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

  const role = (session.user as any).role as Role;
  if (role !== Role.ADMIN && role !== Role.BACKOFFICE) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const capabilities = ((session.user as any).capabilities as string[] | undefined) ?? [];
  const videosOnly =
    role === Role.BACKOFFICE && capabilities.includes(CAPABILITIES.VIDEOS_ONLY);

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;

  const body = await req.json().catch(() => ({}));

  const type = body.type as keyof typeof CASE_TYPE_REGISTRY;
  const cfg = CASE_TYPE_REGISTRY[type];
  if (!cfg) return NextResponse.json({ error: "Tipo de caso inválido" }, { status: 400 });
  if (videosOnly && cfg.type !== "SOLICITUD_DESCARGA_VIDEO") {
    return NextResponse.json(
      { error: "Tu perfil solo puede crear solicitudes de descarga de video." },
      { status: 403 }
    );
  }

  const busId = String(body.busId ?? "").trim();
  if (!busId) return NextResponse.json({ error: "Selecciona un bus" }, { status: 400 });

  const rawEquipmentIds = Array.isArray(body.busEquipmentIds)
    ? body.busEquipmentIds
    : body.busEquipmentId
      ? [body.busEquipmentId]
      : [];
  const busEquipmentIds = rawEquipmentIds.map((id: any) => String(id)).filter(Boolean);
  const busEquipmentId = busEquipmentIds[0] ?? null;
  if (cfg.requiresEquipment && !busEquipmentIds.length) {
    return NextResponse.json({ error: "Equipo del bus requerido para este tipo de caso" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();
  if (title.length < 3) return NextResponse.json({ error: "Título muy corto" }, { status: 400 });
  if (description.length < 5) return NextResponse.json({ error: "Descripción muy corta" }, { status: 400 });

  const priority = normalizePriority(body.priority);
  const stsSeverity = cfg.stsComponentCode ? (body.stsSeverity as StsTicketSeverity) : null;
  if (cfg.stsComponentCode && (!stsSeverity || !Object.values(StsTicketSeverity).includes(stsSeverity))) {
    return NextResponse.json({ error: "Severidad STS requerida" }, { status: 400 });
  }

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
        caseNo: nums.caseNo!,
        type: cfg.type,
        status: CaseStatus.NUEVO,
        priority: priority ?? 3,
        title,
        description,
        busId,
        busEquipmentId,
      },
    });

    if (busEquipmentIds.length) {
      await tx.caseEquipment.createMany({
        data: busEquipmentIds.map((id) => ({ caseId: c.id, busEquipmentId: id })),
        skipDuplicates: true,
      });
    }

    await tx.caseEvent.create({
      data: { caseId: c.id, type: CaseEventType.CREATED, message: "Caso creado", meta: { userId } },
    });

    if (cfg.requiresWorkOrder) {
      await tx.workOrder.create({
        data: {
          tenantId,
          workOrderNo: nums.workOrderNo!,
          caseId: c.id,
        },
      });

      if (!cfg.stsComponentCode) {
        await tx.case.update({ where: { id: c.id }, data: { status: CaseStatus.OT_ASIGNADA } });
      }

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
          requesterEmails: Array.isArray(v.requesterEmails)
            ? v.requesterEmails.map((x: any) => String(x).trim()).filter(Boolean)
            : null,
          vehicleId: v.vehicleId || null,
          eventStart: parseDateOrNull(v.eventStartAt),
          eventEnd: parseDateOrNull(v.eventEndAt),
          camerasRequested: v.cameras || null,
          deliveryMethod: v.deliveryMethod || null,
          descriptionNovedad: v.descriptionNovedad || null,
          finSolicitud: Array.isArray(v.finSolicitud)
            ? v.finSolicitud.map((x: any) => String(x).trim()).filter(Boolean)
            : null,
        },
      });

      await tx.caseEvent.create({
        data: { caseId: c.id, type: CaseEventType.COMMENT, message: "Formulario video guardado", meta: { userId } },
      });
    }

    if (cfg.stsComponentCode) {
      const comp = await tx.stsComponent.findFirst({
        where: { tenantId, code: cfg.stsComponentCode },
      });
      if (!comp) throw new Error("Componente STS no configurado");

      const ticket = await tx.stsTicket.create({
        data: {
          tenantId,
          caseId: c.id,
          componentId: comp.id,
          severity: stsSeverity as StsTicketSeverity,
          status: "OPEN",
          channel: StsTicketChannel.OTHER,
          description: c.description,
          openedAt: new Date(),
        },
      });

      await tx.stsTicketEvent.create({
        data: {
          ticketId: ticket.id,
          type: "STATUS_CHANGE",
          status: "OPEN",
          message: "Ticket creado desde caso",
          createdById: userId,
        },
      });

      await tx.caseEvent.create({
        data: {
          caseId: c.id,
          type: CaseEventType.COMMENT,
          message: `Ticket STS creado (${cfg.stsComponentCode})`,
          meta: { userId, stsTicketId: ticket.id },
        },
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

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = (session.user as any).role as Role;
  const capabilities = (session.user as any).capabilities as string[] | undefined;
  const isVideosOnly =
    role === Role.BACKOFFICE && capabilities?.includes(CAPABILITIES.VIDEOS_ONLY);
  if (
    isVideosOnly ||
    (role !== Role.ADMIN &&
      role !== Role.BACKOFFICE &&
      role !== Role.SUPERVISOR &&
      role !== Role.PLANNER)
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;
  const id = String(ctx.params.id);

  const body = await req.json().catch(() => ({} as any));

  // ---- Edicion de titulo (cualquier tipo de caso) ----
  // Si el body incluye "title", se trata como una edicion de titulo.
  if (Object.prototype.hasOwnProperty.call(body ?? {}, "title")) {
    const nextTitle = String(body?.title ?? "").trim();
    if (nextTitle.length < 3) {
      return NextResponse.json({ error: "El titulo debe tener al menos 3 caracteres." }, { status: 400 });
    }

    const target = await prisma.case.findFirst({
      where: { id, tenantId },
      select: { id: true, title: true },
    });
    if (!target) return NextResponse.json({ error: "Caso no encontrado." }, { status: 404 });

    if (target.title === nextTitle) {
      return NextResponse.json({ ok: true, unchanged: true, caseId: target.id, title: target.title });
    }

    const titleBefore = target.title;
    await prisma.$transaction(async (tx) => {
      await tx.case.update({ where: { id: target.id }, data: { title: nextTitle } });
      await tx.caseEvent.create({
        data: {
          caseId: target.id,
          type: CaseEventType.COMMENT,
          message: "Titulo editado",
          meta: { titleBefore, titleAfter: nextTitle, by: userId },
        },
      });
    });

    return NextResponse.json({ ok: true, caseId: target.id, title: nextTitle });
  }

  // ---- Responsable del caso (cualquier estado; NO reabre ni requiere OT) ----
  // También sincroniza el "Técnico asignado" de la OT (si existe) para que el
  // panel "Orden de trabajo" lo refleje.
  if (Object.prototype.hasOwnProperty.call(body ?? {}, "assignedToId")) {
    const raw = body?.assignedToId;
    const newAssignee = raw ? String(raw).trim() : null;
    const target = await prisma.case.findFirst({
      where: { id, tenantId },
      select: { id: true, workOrder: { select: { id: true } } },
    });
    if (!target) return NextResponse.json({ error: "Caso no encontrado." }, { status: 404 });

    if (newAssignee) {
      const u = await prisma.user.findFirst({
        where: { id: newAssignee, tenantId, active: true },
        select: { id: true, name: true },
      });
      if (!u) return NextResponse.json({ error: "Usuario inválido o inactivo." }, { status: 400 });
      const ops: any[] = [
        prisma.case.update({ where: { id: target.id }, data: { assignedToId: u.id } }),
        prisma.caseEvent.create({
          data: {
            caseId: target.id,
            type: CaseEventType.ASSIGNED,
            message: `Responsable del caso: ${u.name}`,
            meta: { assignedToId: u.id, by: userId },
          },
        }),
      ];
      if (target.workOrder) {
        ops.push(prisma.workOrder.update({ where: { id: target.workOrder.id }, data: { assignedToId: u.id } }));
      }
      await prisma.$transaction(ops);
      return NextResponse.json({ ok: true, caseId: target.id, assignedToId: u.id });
    }

    const ops: any[] = [
      prisma.case.update({ where: { id: target.id }, data: { assignedToId: null } }),
      prisma.caseEvent.create({
        data: {
          caseId: target.id,
          type: CaseEventType.COMMENT,
          message: "Responsable del caso removido",
          meta: { by: userId },
        },
      }),
    ];
    if (target.workOrder) {
      ops.push(prisma.workOrder.update({ where: { id: target.workOrder.id }, data: { assignedToId: null } }));
    }
    await prisma.$transaction(ops);
    return NextResponse.json({ ok: true, caseId: target.id, assignedToId: null });
  }

  // ---- Número de OT (lo asigna CapitalBus; editable) ----
  if (Object.prototype.hasOwnProperty.call(body ?? {}, "workOrderNo")) {
    const rawNo = body?.workOrderNo;
    const target = await prisma.case.findFirst({
      where: { id, tenantId },
      select: { id: true, workOrder: { select: { id: true } } },
    });
    if (!target) return NextResponse.json({ error: "Caso no encontrado." }, { status: 404 });
    if (!target.workOrder) {
      return NextResponse.json({ error: "Este caso no tiene OT. Genérala primero." }, { status: 400 });
    }
    const digits = rawNo === null || rawNo === undefined ? "" : String(rawNo).replace(/\D/g, "");
    const num = digits ? Number(digits) : null;
    if (num !== null && (!Number.isFinite(num) || num <= 0)) {
      return NextResponse.json({ error: "Número de OT inválido." }, { status: 400 });
    }
    if (num !== null) {
      const dup = await prisma.workOrder.findFirst({
        where: { tenantId, workOrderNo: num, NOT: { id: target.workOrder.id } },
        select: { id: true },
      });
      if (dup) return NextResponse.json({ error: `La OT #${num} ya existe en otro caso.` }, { status: 409 });
    }
    await prisma.workOrder.update({ where: { id: target.workOrder.id }, data: { workOrderNo: num } });
    await prisma.caseEvent.create({
      data: {
        caseId: target.id,
        type: CaseEventType.COMMENT,
        message: num ? `Número de OT actualizado: ${num}` : "Número de OT removido",
        meta: { by: userId, workOrderNo: num },
      },
    });
    return NextResponse.json({ ok: true, caseId: target.id, workOrderNo: num });
  }

  const nextStatus = String(body?.status ?? "").trim().toUpperCase();

  // Por ahora solo se admite el cierre manual de una NOVEDAD.
  if (nextStatus !== CaseStatus.CERRADO) {
    return NextResponse.json(
      { error: "Estado no permitido. Solo se admite CERRADO." },
      { status: 400 }
    );
  }

  const found = await prisma.case.findFirst({
    where: { id, tenantId, type: CaseType.NOVEDAD },
    select: { id: true, status: true },
  });
  if (!found) return NextResponse.json({ error: "Novedad no encontrada." }, { status: 404 });
  if (found.status === CaseStatus.CERRADO) {
    return NextResponse.json({ ok: true, alreadyClosed: true, caseId: found.id });
  }

  await prisma.$transaction(async (tx) => {
    await tx.case.update({ where: { id: found.id }, data: { status: CaseStatus.CERRADO } });
    await tx.caseEvent.create({
      data: {
        caseId: found.id,
        type: CaseEventType.STATUS_CHANGE,
        message: "Novedad cerrada manualmente.",
        meta: { by: userId, manual: true },
      },
    });
  });

  // Si es parte de un grupo "mismo caso", se cierran también las dependientes.
  let propagated = 0;
  try {
    propagated = await propagateStatusToGroup(prisma, {
      tenantId,
      fromCaseId: found.id,
      status: CaseStatus.CERRADO,
      byUserId: userId,
    });
  } catch (e) {
    console.error("CLOSE_PROPAGATE_FAILED", e);
  }

  return NextResponse.json({ ok: true, caseId: found.id, status: CaseStatus.CERRADO, propagated });
}

export async function DELETE(_req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as Role;
  if (role !== Role.ADMIN) {
    return NextResponse.json({ error: "Solo administradores pueden eliminar casos" }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const actorId = (session.user as any).id as string;
  const id = String(ctx.params.id);

  const c = await prisma.case.findFirst({ where: { id, tenantId } });
  if (!c) return NextResponse.json({ error: "Caso no encontrado" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    if (c.type === "SOLICITUD_DESCARGA_VIDEO") {
      const vdr = await tx.videoDownloadRequest.findFirst({ where: { caseId: id } });
      if (vdr) {
        await tx.videoRequestEvent.deleteMany({ where: { requestId: vdr.id } });
        await tx.videoAttachment.deleteMany({ where: { requestId: vdr.id } });
  await tx.videoDownloadToken.deleteMany({ where: { attachment: { requestId: vdr.id } } });
        await tx.videoDownloadRequest.delete({ where: { id: vdr.id } });
      }
    }
    const wo = await tx.workOrder.findFirst({ where: { caseId: id } });
    if (wo) {
      await tx.workOrderMedia.deleteMany({ where: { workOrderStep: { workOrderId: wo.id } } });
      await tx.workOrderStep.deleteMany({ where: { workOrderId: wo.id } });
      await tx.correctiveReport.deleteMany({ where: { workOrderId: wo.id } });
      await tx.preventiveReport.deleteMany({ where: { workOrderId: wo.id } });
      await tx.renewalTechReport.deleteMany({ where: { workOrderId: wo.id } });
      await tx.interventionReceipt.deleteMany({ where: { workOrderId: wo.id } });
      await tx.workOrder.delete({ where: { id: wo.id } });
    }
    if (c.type !== "SOLICITUD_DESCARGA_VIDEO") {
      await tx.stsTicketEvent.deleteMany({ where: { ticket: { caseId: id } } });
      await tx.stsTicket.deleteMany({ where: { caseId: id } });
    }
    await tx.caseEquipment.deleteMany({ where: { caseId: id } });
    await tx.caseEvent.deleteMany({ where: { caseId: id } });
    await tx.caseChatMessage.deleteMany({ where: { caseId: id } });
    await tx.case.delete({ where: { id } });
    await tx.stsAuditLog.create({
      data: {
        tenantId,
        actorId,
        action: "case.delete",
        entityType: "Case",
        entityId: id,
        meta: { title: c.title, type: c.type },
      },
    });
  });

  return NextResponse.json({ ok: true });
}
