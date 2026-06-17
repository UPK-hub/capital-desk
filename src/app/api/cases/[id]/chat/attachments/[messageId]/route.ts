export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

/**
 * Borrado (logico) de un adjunto del chat de un caso.
 * - Solo lo puede eliminar quien lo subio (meta.userId / meta.uploadedById o senderId),
 *   o un ADMIN (que puede eliminar cualquiera).
 * - "Logico": marca meta.deleted = true para que no se muestre en el chat ni en
 *   el listado de evidencias. El archivo fisico se conserva. Reversible.
 */
export async function DELETE(_req: NextRequest, ctx: { params: { id: string; messageId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = (session.user as any).role as Role;
  const tenantId = (session.user as any).tenantId as string;
  const userId = String((session.user as any).id ?? "");
  const caseId = String(ctx.params.id);
  const messageId = String(ctx.params.messageId);

  // Solo roles internos pueden gestionar adjuntos.
  if (![Role.ADMIN, Role.BACKOFFICE, Role.PLANNER, Role.SUPERVISOR, Role.TECHNICIAN, Role.HELPDESK].includes(role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const msg = await prisma.caseChatMessage.findFirst({
    where: { id: messageId, caseId, tenantId },
    select: { id: true, senderId: true, meta: true },
  });
  if (!msg) return NextResponse.json({ error: "Adjunto no encontrado" }, { status: 404 });

  const meta = (msg.meta ?? {}) as any;

  // Debe ser un mensaje-adjunto (tiene filePath en meta).
  if (!meta?.filePath) {
    return NextResponse.json({ error: "Este mensaje no es un adjunto." }, { status: 400 });
  }

  // Idempotente: si ya estaba eliminado, no hay nada que hacer.
  if (meta?.deleted) return NextResponse.json({ ok: true, alreadyDeleted: true });

  // Restriccion: solo el dueno del adjunto o un ADMIN.
  const ownerId = String(meta?.userId ?? meta?.uploadedById ?? msg.senderId ?? "");
  const isOwner = Boolean(ownerId) && ownerId === userId;
  if (role !== Role.ADMIN && !isOwner) {
    return NextResponse.json({ error: "Solo puedes eliminar archivos que tu subiste." }, { status: 403 });
  }

  await prisma.caseChatMessage.update({
    where: { id: msg.id },
    data: {
      meta: { ...meta, deleted: true, deletedAt: new Date().toISOString(), deletedBy: userId },
    },
  });

  return NextResponse.json({ ok: true });
}
