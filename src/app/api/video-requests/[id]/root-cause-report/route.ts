export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { buildVideoRequestCaseScope } from "@/lib/access-control";
import { buildRootCauseReportPdf } from "@/lib/video-root-cause-pdf";

function safeToken(value: string | null | undefined, fallback = "BUS") {
  const clean = String(value ?? "")
    .trim()
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return clean || fallback;
}

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const role = (session.user as any).role as Role;
  if (![Role.ADMIN, Role.BACKOFFICE, Role.TECHNICIAN].includes(role)) {
    return new Response("Forbidden", { status: 403 });
  }
  const capabilities = (session.user as any).capabilities as string[] | undefined;
  const tenantId = (session.user as any).tenantId as string;
  const actorUserId = (session.user as any).id as string;
  const caseScope = buildVideoRequestCaseScope({ role, capabilities, userId: actorUserId });
  const requestId = String(ctx.params.id);

  const request = await prisma.videoDownloadRequest.findFirst({
    where: { id: requestId, case: { tenantId, ...caseScope } },
    include: {
      case: {
        select: { caseNo: true, title: true, description: true, bus: { select: { code: true, plate: true } } },
      },
      assignedTo: { select: { name: true, email: true, jobTitle: true } },
      cameraResults: { orderBy: { camera: "asc" } },
    },
  });
  if (!request) return new Response("Not found", { status: 404 });

  const url = new URL(req.url);
  const cameraFilter = url.searchParams.get("camera");

  const generatedCaseId = request.cameraResults.find((r) => r.generatedCaseId)?.generatedCaseId ?? null;
  let corrective: { caseNo: number | null; workOrderNo: number | null } | null = null;
  if (generatedCaseId) {
    const corrCase = await prisma.case.findUnique({
      where: { id: generatedCaseId },
      select: { caseNo: true, workOrder: { select: { workOrderNo: true } } },
    });
    if (corrCase) corrective = { caseNo: corrCase.caseNo, workOrderNo: corrCase.workOrder?.workOrderNo ?? null };
  }

  const bytes = await buildRootCauseReportPdf({
    caseNo: request.case.caseNo,
    title: request.case.title,
    description: request.case.description ?? request.descriptionNovedad,
    busCode: request.case.bus?.code ?? null,
    busPlate: request.case.bus?.plate ?? null,
    requesterName: request.requesterName,
    requesterId: request.requesterId,
    requesterRole: request.requesterRole,
    requesterPhone: request.requesterPhone,
    requesterEmail: request.requesterEmail,
    origin: request.origin ?? null,
    requestType: request.requestType,
    eventStart: request.eventStart,
    eventEnd: request.eventEnd,
    deliveryMethod: request.deliveryMethod ?? null,
    observations: request.observationsTechnician,
    technicianName: request.assignedTo?.name ?? null,
    technicianRole: request.assignedTo?.jobTitle ?? null,
    technicianEmail: request.assignedTo?.email ?? null,
    results: request.cameraResults.map((r) => ({ camera: r.camera, status: r.status, rootCause: r.rootCause })),
    corrective,
    cameraFilter,
  });

  const token = `${safeToken(request.case.bus?.code)}_caso_${safeToken(String(request.case.caseNo ?? ""))}`;
  const filename =
    (cameraFilter ? `informe_causa_${safeToken(cameraFilter)}_` : "informe_causa_") + token + ".pdf";

  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
