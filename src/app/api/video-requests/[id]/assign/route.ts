export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, VideoRequestEventType } from "@prisma/client";
import { buildVideoRequestCaseScope } from "@/lib/access-control";
import { isCapitalUserEmail } from "@/lib/users";

// Roles que pueden asignar el responsable de una solicitud de video.
const ALLOWED_ROLES: Role[] = [Role.ADMIN, Role.BACKOFFICE, Role.SUPERVISOR];

/**
 * PATCH /api/video-requests/[id]/assign
 * Body: { assignedToId: string | null }
 *
 * Asigna la solicitud de video a un usuario. El responsable debe ser
 * TECHNICIAN o un usuario de Capital (email @capitalbus.). Tenant-scoped.
 * Registra un VideoRequestEvent.
 */
export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = (session.user as any).role as Role;
  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const actorUserId = String((session.user as any).id ?? "");
  const capabilities = (session.user as any).capabilities as string[] | undefined;
  const requestId = String(ctx.params.id);
  const caseScope = await buildVideoRequestCaseScope({ tenantId, role, capabilities, userId: actorUserId });

  const body = await req.json().catch(() => ({}));
  const rawAssignedToId = body.assignedToId;
  const assignedToId =
    rawAssignedToId === null || rawAssignedToId === undefined || String(rawAssignedToId).trim() === ""
      ? null
      : String(rawAssignedToId).trim();

  const current = await prisma.videoDownloadRequest.findFirst({
    where: { id: requestId, case: { tenantId, ...caseScope } },
    include: { assignedTo: { select: { id: true, name: true, email: true } } },
  });
  if (!current) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });

  // Validar el destinatario (si no es para desasignar).
  let assignee: { id: string; name: string; email: string } | null = null;
  if (assignedToId) {
    const user = await prisma.user.findFirst({
      where: { id: assignedToId, tenantId, active: true },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Usuario inválido o inactivo" }, { status: 400 });
    }
    const allowed = user.role === Role.TECHNICIAN || isCapitalUserEmail(user.email);
    if (!allowed) {
      return NextResponse.json(
        { error: "El responsable debe ser un técnico o un usuario de Capital." },
        { status: 400 }
      );
    }
    assignee = { id: user.id, name: user.name, email: user.email };
  }

  // Sin cambios.
  if ((current.assignedToId ?? null) === assignedToId) {
    return NextResponse.json({ ok: true, assignedToId });
  }

  await prisma.videoDownloadRequest.update({
    where: { id: requestId },
    data: { assignedToId },
  });

  const message = assignee
    ? `Responsable asignado: ${assignee.name}${assignee.email ? ` (${assignee.email})` : ""}`
    : "Responsable removido";

  await prisma.videoRequestEvent.create({
    data: {
      requestId,
      type: VideoRequestEventType.COMMENT,
      message,
      meta: {
        kind: "ASSIGN",
        by: actorUserId,
        from: current.assignedToId ?? null,
        to: assignedToId,
      },
      actorUserId,
    },
  });

  return NextResponse.json({ ok: true, assignedToId });
}
