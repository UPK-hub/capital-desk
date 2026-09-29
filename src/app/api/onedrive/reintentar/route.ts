export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { OneDriveSyncStatus, Role } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Vuelve a encolar adjuntos que quedaron en ERROR (o uno concreto) para que el
 * worker los reintente. Reinicia el contador de intentos.
 *
 * Body: { attachmentId } para uno, o { todos: true } para todos los ERROR.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = (session.user as any).role as Role;
  if (![Role.ADMIN, Role.BACKOFFICE].includes(role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const attachmentId = body?.attachmentId ? String(body.attachmentId) : null;
  const todos = Boolean(body?.todos);

  const data = {
    odStatus: OneDriveSyncStatus.PENDIENTE,
    odAttempts: 0,
    odError: null,
    odNextAttemptAt: new Date(),
  };

  if (attachmentId) {
    await prisma.videoAttachment.update({ where: { id: attachmentId }, data });
    return NextResponse.json({ ok: true, reencolados: 1 });
  }

  if (todos) {
    const r = await prisma.videoAttachment.updateMany({
      where: { odStatus: OneDriveSyncStatus.ERROR, active: true },
      data,
    });
    return NextResponse.json({ ok: true, reencolados: r.count });
  }

  return NextResponse.json({ error: "Falta attachmentId o todos" }, { status: 400 });
}
