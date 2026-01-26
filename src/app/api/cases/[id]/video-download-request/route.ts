export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { VideoDownloadRequestSchema } from "@/lib/validators/video";
import { NotificationType, Role } from "@prisma/client";
import { notifyTenantUsers } from "@/lib/notifications";

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

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
  const caseId = String(ctx.params.id);

  const body = await req.json().catch(() => ({}));
  const parsed = VideoDownloadRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 }
    );
  }

  const c = await prisma.case.findFirst({
    where: { id: caseId, tenantId },
    include: { bus: true },
  });
  if (!c) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  if (c.type !== "SOLICITUD_DESCARGA_VIDEO") {
    return NextResponse.json(
      { error: "Este caso no es SOLICITUD_DESCARGA_VIDEO" },
      { status: 400 }
    );
  }

  // ✅ Mapeo: Zod -> Prisma (ajustado a los nombres que venías usando)
  const v: any = parsed.data;

  const data = {
    caseId,
    origin: v.origin,

    requestType: v.requestType || null,

    // OJO: si tu Zod usa radicadoTMSA/radicadoTMSADate, mapéalos aquí
    tmsaRadicado: v.radicadoTMSA ?? v.tmsaRadicado ?? null,
    tmsaFiledAt: toDate(v.radicadoTMSADate ?? v.tmsaFiledAt),

    concessionaireFiledAt: toDate(v.radicadoConcesionarioDate ?? v.concessionaireFiledAt),

    requesterName: v.requesterName || null,
    requesterId: v.requesterDocument ?? v.requesterId ?? null,
    requesterRole: v.requesterRole || null,
    requesterPhone: v.requesterPhone || null,
    requesterEmail: v.requesterEmail || null,
    requesterEmails: v.requesterEmails?.length ? v.requesterEmails : null,

    vehicleId: v.vehicleId || null,

    eventStart: toDate(v.eventStartAt ?? v.eventStart),
    eventEnd: toDate(v.eventEndAt ?? v.eventEnd),

    camerasRequested: v.cameras ?? v.camerasRequested ?? null,
    deliveryMethod: v.deliveryMethod || null,

    descriptionNovedad: v.descriptionNovedad || null,
    finSolicitud: v.finSolicitud?.length ? v.finSolicitud : null,
  };

  const saved = await prisma.videoDownloadRequest.upsert({
    where: { caseId },
    create: data,
    update: { ...data, caseId: undefined }, // evita reescribir caseId (innecesario)
  });

  await notifyTenantUsers({
    tenantId,
    roles: [Role.ADMIN, Role.BACKOFFICE],
    type: NotificationType.FORM_SAVED,
    title: "Formulario Solicitud Video guardado",
    body: `Caso: ${c.caseNo ?? c.id} | Bus: ${c.bus.code}${c.bus.plate ? ` (${c.bus.plate})` : ""}`,
    meta: { caseId },
  });

  return NextResponse.json({ videoDownloadRequest: saved });
}
