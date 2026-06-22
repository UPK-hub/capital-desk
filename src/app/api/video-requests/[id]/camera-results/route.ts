export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  CaseEventType,
  CaseStatus,
  CaseType,
  Role,
  StsTicketChannel,
  StsTicketEventType,
  StsTicketSeverity,
  VideoAttachmentKind,
  VideoDownloadStatus,
  VideoRequestEventType,
  WorkOrderStatus,
} from "@prisma/client";
import {
  buildVideoRequestCaseScope,
  isBackofficeRestricted,
  isVideosOnlyBackoffice,
} from "@/lib/access-control";
import { isValidRootCause } from "@/lib/video-root-causes";
import { nextNumbers } from "@/lib/tenant-sequence";
import { buildRootCauseReportPdf } from "@/lib/video-root-cause-pdf";
import { saveGeneratedUpload } from "@/lib/uploads";

function severityFromPriority(priority: number): StsTicketSeverity {
  if (priority <= 2) return StsTicketSeverity.HIGH;
  if (priority >= 4) return StsTicketSeverity.LOW;
  return StsTicketSeverity.MEDIUM;
}

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as Role;
  if (![Role.ADMIN, Role.BACKOFFICE, Role.TECHNICIAN].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const capabilities = (session.user as any).capabilities as string[] | undefined;
  if (
    role === Role.BACKOFFICE &&
    (isBackofficeRestricted(role, capabilities) || isVideosOnlyBackoffice(role, capabilities))
  ) {
    return NextResponse.json({ error: "No tienes permisos para gestionar las cámaras." }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const actorUserId = (session.user as any).id as string;
  const caseScope = buildVideoRequestCaseScope({ role, capabilities, userId: actorUserId });
  const requestId = String(ctx.params.id);

  const request = await prisma.videoDownloadRequest.findFirst({
    where: { id: requestId, case: { tenantId, ...caseScope } },
    include: {
      case: { select: { id: true, caseNo: true, busId: true, priority: true } },
    },
  });
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const cameras: string[] = Array.isArray(body?.cameras)
    ? body.cameras.map((c: any) => String(c).trim()).filter(Boolean)
    : [];
  const statusRaw = String(body?.status ?? "");
  const rootCauseRaw = body?.rootCause != null ? String(body.rootCause).trim() : null;

  if (!cameras.length) {
    return NextResponse.json({ error: "Selecciona al menos una cámara" }, { status: 400 });
  }
  if (!(Object.values(VideoDownloadStatus) as string[]).includes(statusRaw)) {
    return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
  }
  const status = statusRaw as VideoDownloadStatus;

  let rootCause: string | null = null;
  if (status === VideoDownloadStatus.DESCARGA_FALLIDA) {
    if (!rootCauseRaw || !isValidRootCause(rootCauseRaw)) {
      return NextResponse.json(
        { error: "Selecciona una causa raíz válida para la descarga fallida." },
        { status: 400 }
      );
    }
    rootCause = rootCauseRaw;
  }

  const outcome = await prisma.$transaction(async (tx) => {
    for (const camera of cameras) {
      await tx.videoCameraResult.upsert({
        where: { requestId_camera: { requestId, camera } },
        update: { status, rootCause },
        create: { requestId, camera, status, rootCause },
      });
    }

    await tx.videoRequestEvent.create({
      data: {
        requestId,
        type: VideoRequestEventType.DOWNLOAD_STATUS_CHANGE,
        message:
          status === VideoDownloadStatus.DESCARGA_FALLIDA
            ? `Descarga fallida en ${cameras.length} cámara(s): ${rootCause}`
            : `Estado de descarga actualizado en ${cameras.length} cámara(s)`,
        meta: { cameras, status, rootCause },
        actorUserId,
      },
    });

    // Correctivo automático consolidado (uno por caso/bus) atado a esta novedad de video.
    const allResults = await tx.videoCameraResult.findMany({
      where: { requestId },
      orderBy: { camera: "asc" },
    });
    const failed = allResults.filter((r) => r.status === VideoDownloadStatus.DESCARGA_FALLIDA);
    let correctiveCaseId: string | null = allResults.find((r) => r.generatedCaseId)?.generatedCaseId ?? null;
    let correctiveCaseNo: number | null = null;

    if (failed.length) {
      const failLines = failed.map((r) => `- ${r.camera}: ${r.rootCause ?? "sin causa"}`).join("\n");
      const description =
        `Correctivo generado automáticamente por descarga de video fallida (CASO-${request.case.caseNo ?? ""}).\n` +
        `Cámaras con falla y causa raíz:\n${failLines}`;

      if (!correctiveCaseId && request.case.busId) {
        const nums = await nextNumbers(tx as any, tenantId, { case: true, workOrder: true });
        const priority = request.case.priority ?? 3;

        const correctiveCase = await tx.case.create({
          data: {
            tenantId,
            caseNo: nums.caseNo!,
            type: CaseType.CORRECTIVO,
            status: CaseStatus.OT_ASIGNADA,
            priority,
            title: `Correctivo por descarga fallida - CASO-${request.case.caseNo ?? ""}`,
            description,
            busId: request.case.busId,
          },
        });
        correctiveCaseId = correctiveCase.id;
        correctiveCaseNo = correctiveCase.caseNo;

        const workOrder = await tx.workOrder.create({
          data: {
            tenantId,
            workOrderNo: nums.workOrderNo!,
            caseId: correctiveCase.id,
            status: WorkOrderStatus.EN_VALIDACION,
          },
        });

        await tx.caseEvent.createMany({
          data: [
            {
              caseId: correctiveCase.id,
              type: CaseEventType.CREATED,
              message: `Correctivo generado por descarga de video fallida (CASO-${request.case.caseNo ?? ""}).`,
              meta: {
                sourceCaseId: request.case.id,
                sourceCaseNo: request.case.caseNo,
                generatedFrom: "video-failed-download",
                actorUserId,
              },
            },
            {
              caseId: correctiveCase.id,
              type: CaseEventType.STATUS_CHANGE,
              message: "OT generada automáticamente en estado por validar coordinador.",
              meta: { workOrderId: workOrder.id, actorUserId },
            },
          ],
        });

        const component = await tx.stsComponent.findFirst({
          where: { tenantId, code: "CCTV" },
          select: { id: true },
        });
        if (component) {
          const ticket = await tx.stsTicket.create({
            data: {
              tenantId,
              caseId: correctiveCase.id,
              componentId: component.id,
              severity: severityFromPriority(priority),
              status: "OPEN",
              channel: StsTicketChannel.OTHER,
              description,
              openedAt: new Date(),
            },
          });
          await tx.stsTicketEvent.create({
            data: {
              ticketId: ticket.id,
              type: StsTicketEventType.STATUS_CHANGE,
              status: "OPEN",
              message: "Ticket generado automáticamente desde descarga de video fallida.",
              createdById: actorUserId,
            },
          });
          await tx.caseEvent.create({
            data: {
              caseId: correctiveCase.id,
              type: CaseEventType.COMMENT,
              message: "Ticket STS generado automáticamente.",
              meta: { stsTicketId: ticket.id, actorUserId },
            },
          });
        }

        // Evento en la novedad de video para dejar el enlace visible.
        await tx.caseEvent.create({
          data: {
            caseId: request.case.id,
            type: CaseEventType.COMMENT,
            message: `Se generó automáticamente el correctivo CASO-${correctiveCase.caseNo} por descarga de video fallida.`,
            meta: {
              correctiveCaseId: correctiveCase.id,
              correctiveCaseNo: correctiveCase.caseNo,
              actorUserId,
            },
          },
        });
      } else if (correctiveCaseId) {
        // Ya existe: refrescar la descripción con las cámaras fallidas actuales.
        const existing = await tx.case.update({
          where: { id: correctiveCaseId },
          data: { description },
          select: { caseNo: true },
        });
        correctiveCaseNo = existing.caseNo;
      }

      if (correctiveCaseId) {
        await tx.videoCameraResult.updateMany({
          where: { requestId, status: VideoDownloadStatus.DESCARGA_FALLIDA },
          data: { generatedCaseId: correctiveCaseId },
        });
      }
    }

    const results = await tx.videoCameraResult.findMany({
      where: { requestId },
      orderBy: { camera: "asc" },
    });
    return { results, correctiveCaseId, correctiveCaseNo };
  });

  // Auto-adjuntar el informe de causa raíz al caso cuando hay cámaras con descarga fallida.
  // Se regenera y reemplaza el informe anterior en cada cambio (queda uno solo, siempre actual).
  const hasFailed = outcome.results.some((r) => r.status === VideoDownloadStatus.DESCARGA_FALLIDA);
  if (hasFailed) {
    try {
      const full = await prisma.videoDownloadRequest.findFirst({
        where: { id: requestId },
        include: {
          case: {
            select: { caseNo: true, title: true, description: true, bus: { select: { code: true, plate: true } } },
          },
          cameraResults: { orderBy: { camera: "asc" } },
        },
      });
      if (full) {
        let corrective: { caseNo: number | null; workOrderNo: number | null } | null = null;
        const gId = full.cameraResults.find((r) => r.generatedCaseId)?.generatedCaseId ?? null;
        if (gId) {
          const cc = await prisma.case.findUnique({
            where: { id: gId },
            select: { caseNo: true, workOrder: { select: { workOrderNo: true } } },
          });
          if (cc) corrective = { caseNo: cc.caseNo, workOrderNo: cc.workOrder?.workOrderNo ?? null };
        }
        const bytes = await buildRootCauseReportPdf({
          caseNo: full.case.caseNo,
          title: full.case.title,
          description: full.case.description ?? full.descriptionNovedad,
          busCode: full.case.bus?.code ?? null,
          busPlate: full.case.bus?.plate ?? null,
          requesterName: full.requesterName,
          requesterId: full.requesterId,
          requesterRole: full.requesterRole,
          requesterPhone: full.requesterPhone,
          requesterEmail: full.requesterEmail,
          origin: full.origin ?? null,
          requestType: full.requestType,
          eventStart: full.eventStart,
          eventEnd: full.eventEnd,
          deliveryMethod: full.deliveryMethod ?? null,
          observations: full.observationsTechnician,
          results: full.cameraResults.map((r) => ({ camera: r.camera, status: r.status, rootCause: r.rootCause })),
          corrective,
        });
        const fname = `Informe de causa raíz - CASO-${full.case.caseNo ?? ""}.pdf`;
        const relPath = await saveGeneratedUpload(
          `video-requests/${requestId}/informe-causa-raiz-${Date.now()}.pdf`,
          Buffer.from(bytes),
          { originalName: fname, mimeType: "application/pdf" }
        );
        // Mantener un único informe auto-generado por solicitud.
        await prisma.videoAttachment.deleteMany({
          where: { requestId, kind: VideoAttachmentKind.OTRO, originalName: { startsWith: "Informe de causa raíz" } },
        });
        await prisma.videoAttachment.create({
          data: {
            requestId,
            kind: VideoAttachmentKind.OTRO,
            camera: null,
            filePath: relPath,
            originalName: fname,
            mimeType: "application/pdf",
            size: bytes.length,
            uploadedById: actorUserId,
          },
        });
      }
    } catch (e) {
      console.error("AUTO_INFORME_CAUSA_RAIZ_FAIL", e);
    }
  }

  return NextResponse.json({
    ok: true,
    results: outcome.results,
    correctiveCaseId: outcome.correctiveCaseId,
    correctiveCaseNo: outcome.correctiveCaseNo,
  });
}
