import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { VideoDownloadRequestSchema } from "@/lib/validators/video";
import { NotificationType, Role } from "@prisma/client";
import { notifyTenantUsers } from "@/lib/notifications";

export async function GET(_: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tenantId = (session.user as any).tenantId as string;

  const c = await prisma.case.findFirst({
    where: { id: ctx.params.id, tenantId },
    include: { videoDownloadRequest: true },
  });
  if (!c) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  return NextResponse.json({ videoDownloadRequest: c.videoDownloadRequest });
}

export async function PUT(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const caseId = ctx.params.id;

  const body = await req.json();
  const parsed = VideoDownloadRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }

  const c = await prisma.case.findFirst({ where: { id: caseId, tenantId } });
  if (!c) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (c.type !== "SOLICITUD_DESCARGA_VIDEO") {
    return NextResponse.json({ error: "Este caso no es SOLICITUD_DESCARGA_VIDEO" }, { status: 400 });
  }

  const saved = await prisma.videoDownloadRequest.upsert({
    where: { caseId },
    create: {
      caseId,
      origin: parsed.data.origin,
      requestType: parsed.data.requestType ?? null,
      tmsaRadicado: parsed.data.tmsaRadicado ?? null,
      tmsaFiledAt: parsed.data.tmsaFiledAt ? new Date(parsed.data.tmsaFiledAt) : null,
      concessionaireFiledAt: parsed.data.concessionaireFiledAt ? new Date(parsed.data.concessionaireFiledAt) : null,
      requesterName: parsed.data.requesterName ?? null,
      requesterId: parsed.data.requesterId ?? null,
      requesterRole: parsed.data.requesterRole ?? null,
      requesterPhone: parsed.data.requesterPhone ?? null,
      requesterEmail: parsed.data.requesterEmail ?? null,
      vehicleId: parsed.data.vehicleId ?? null,
      eventStart: parsed.data.eventStart ? new Date(parsed.data.eventStart) : null,
      eventEnd: parsed.data.eventEnd ? new Date(parsed.data.eventEnd) : null,
      camerasRequested: parsed.data.camerasRequested ?? null,
      deliveryMethod: parsed.data.deliveryMethod ?? null,
    },
    update: {
      origin: parsed.data.origin,
      requestType: parsed.data.requestType ?? null,
      tmsaRadicado: parsed.data.tmsaRadicado ?? null,
      tmsaFiledAt: parsed.data.tmsaFiledAt ? new Date(parsed.data.tmsaFiledAt) : null,
      concessionaireFiledAt: parsed.data.concessionaireFiledAt ? new Date(parsed.data.concessionaireFiledAt) : null,
      requesterName: parsed.data.requesterName ?? null,
      requesterId: parsed.data.requesterId ?? null,
      requesterRole: parsed.data.requesterRole ?? null,
      requesterPhone: parsed.data.requesterPhone ?? null,
      requesterEmail: parsed.data.requesterEmail ?? null,
      vehicleId: parsed.data.vehicleId ?? null,
      eventStart: parsed.data.eventStart ? new Date(parsed.data.eventStart) : null,
      eventEnd: parsed.data.eventEnd ? new Date(parsed.data.eventEnd) : null,
      camerasRequested: parsed.data.camerasRequested ?? null,
      deliveryMethod: parsed.data.deliveryMethod ?? null,
    },
  });

  await notifyTenantUsers({
    tenantId,
    roles: [Role.ADMIN, Role.BACKOFFICE],
    type: NotificationType.FORM_SAVED,
    title: "Formulario Solicitud Video guardado",
    body: `Caso: ${caseId}`,
    meta: { caseId },
  });

  return NextResponse.json({ videoDownloadRequest: saved });
}
