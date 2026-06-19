export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  Role,
  WorkOrderStatus,
  VideoCaseStatus,
  StsTicketStatus,
} from "@prisma/client";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { MIN_PASSWORD_LENGTH } from "@/lib/security/constants";

// Marcador (tombstone) de usuario eliminado. Se usa para:
//  - liberar el correo original (poder reutilizarlo en un alta futura), y
//  - detectar "eliminado" sin tocar el schema (no hay columna deletedAt).
const DELETED_EMAIL_DOMAIN = "@deleted.local";
const DELETED_NAME_SUFFIX = " (eliminado)";

const patchSchema = z
  .object({
    role: z.nativeEnum(Role).optional(),
    active: z.boolean().optional(),
    // set directo de password por admin (opcional)
    newPassword: z.string().trim().min(MIN_PASSWORD_LENGTH).optional(),
    capabilities: z.array(z.string().trim().min(2)).optional(),
  })
  .refine((x) => Object.keys(x).length > 0, { message: "Nada para actualizar" });

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as Role;
  if (role !== Role.ADMIN) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tenantId = (session.user as any).tenantId as string;
  const userId = String(ctx.params.id);

  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validación fallida", issues: parsed.error.issues }, { status: 400 });
  }

  const target = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: { id: true, active: true },
  });
  if (!target) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  const data: any = {};
  let shouldIncrementSessionVersion = false;

  if (parsed.data.role) data.role = parsed.data.role;
  if (typeof parsed.data.active === "boolean") {
    data.active = parsed.data.active;
    if (parsed.data.active !== target.active) shouldIncrementSessionVersion = true;
  }
  if (parsed.data.newPassword) {
    data.passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
    shouldIncrementSessionVersion = true;
  }
  if (parsed.data.capabilities) data.capabilities = parsed.data.capabilities;

  if (shouldIncrementSessionVersion) {
    data.sessionVersion = { increment: 1 };
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      updatedAt: true,
      passwordHash: true,
      capabilities: true,
    },
  });

  return NextResponse.json({
    ok: true,
    user: { ...updated, hasPassword: Boolean(updated.passwordHash) },
  });
}

const deleteSchema = z
  .object({
    // Opcional: a quién reasignar los PENDIENTES (ítems abiertos) del usuario
    // que se elimina. Solo cambia el responsable de ahora en adelante; NO toca
    // ninguna atribución histórica (quién creó/gestionó en el pasado).
    reassignToId: z.string().trim().min(1).optional(),
  })
  .partial();

export async function DELETE(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as Role;
  if (role !== Role.ADMIN) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tenantId = (session.user as any).tenantId as string;
  const userId = String(ctx.params.id);
  const selfId = (session.user as any).id as string | undefined;

  if (selfId && selfId === userId) {
    return NextResponse.json({ error: "No puedes eliminar tu propio usuario" }, { status: 400 });
  }

  // Body opcional. Si no viene JSON válido, se trata como {} (sin reasignación).
  const body = await req.json().catch(() => ({}));
  const parsed = deleteSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Validación fallida", issues: parsed.error.issues }, { status: 400 });
  }
  const reassignToId = parsed.data.reassignToId?.trim() || undefined;

  const target = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: { id: true, name: true, email: true },
  });
  if (!target) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  // Validar destino de reasignación (si se pidió).
  if (reassignToId) {
    if (reassignToId === userId) {
      return NextResponse.json(
        { error: "No puedes reasignar los pendientes al mismo usuario que vas a eliminar" },
        { status: 400 }
      );
    }
    const dest = await prisma.user.findFirst({
      where: { id: reassignToId, tenantId, active: true },
      select: { id: true },
    });
    if (!dest) {
      return NextResponse.json(
        { error: "El usuario para reasignar no existe, no es de este tenant o no está activo" },
        { status: 400 }
      );
    }
  }

  // Estados considerados "cerrados/finalizados" (NO se reasignan: son historial).
  // El resto se consideran "abiertos/pendientes" y van al nuevo responsable.
  const WO_CLOSED: WorkOrderStatus[] = [WorkOrderStatus.FINALIZADA];
  const VIDEO_CLOSED: VideoCaseStatus[] = [VideoCaseStatus.COMPLETADO];
  const STS_CLOSED: StsTicketStatus[] = [StsTicketStatus.RESOLVED, StsTicketStatus.CLOSED];

  const reassigned = { workOrders: 0, videos: 0, tickets: 0 };

  // Todo dentro de una transacción: o se reasigna y se marca como eliminado, o nada.
  await prisma.$transaction(async (tx) => {
    if (reassignToId) {
      // OTs abiertas asignadas al usuario -> nuevo responsable.
      const wo = await tx.workOrder.updateMany({
        where: { tenantId, assignedToId: userId, status: { notIn: WO_CLOSED } },
        data: { assignedToId: reassignToId },
      });
      reassigned.workOrders = wo.count;

      // Solicitudes de video abiertas asignadas al usuario -> nuevo responsable.
      const vid = await tx.videoDownloadRequest.updateMany({
        // VideoDownloadRequest no tiene tenantId propio: se acota vía el caso.
        where: { case: { tenantId }, assignedToId: userId, status: { notIn: VIDEO_CLOSED } },
        data: { assignedToId: reassignToId },
      });
      reassigned.videos = vid.count;

      // Tickets STS abiertos asignados al usuario -> nuevo responsable.
      const tk = await tx.stsTicket.updateMany({
        where: { tenantId, assignedToId: userId, status: { notIn: STS_CLOSED } },
        data: { assignedToId: reassignToId },
      });
      reassigned.tickets = tk.count;
    }

    // Marcar como ELIMINADO conservando el registro (sin migración):
    //  - active:false -> no inicia sesión, sale de chat/asignables/listas.
    //  - name con sufijo " (eliminado)" -> el historial lo muestra así.
    //  - email a tombstone único -> libera el correo original para reutilizarlo
    //    y permite detectar "eliminado" (termina en @deleted.local).
    const newName = target.name?.includes(DELETED_NAME_SUFFIX.trim())
      ? target.name
      : `${target.name ?? "Usuario"}${DELETED_NAME_SUFFIX}`;

    const alreadyTombstone = (target.email ?? "").toLowerCase().endsWith(DELETED_EMAIL_DOMAIN);
    const newEmail = alreadyTombstone
      ? target.email
      : `eliminado+${target.id}${DELETED_EMAIL_DOMAIN}`;

    await tx.user.update({
      where: { id: userId },
      data: {
        active: false,
        name: newName,
        email: newEmail,
        // Invalida cualquier sesión activa del usuario eliminado.
        sessionVersion: { increment: 1 },
      },
    });
  });

  return NextResponse.json({ ok: true, deleted: true, reassigned });
}
