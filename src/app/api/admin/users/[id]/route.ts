export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { MIN_PASSWORD_LENGTH } from "@/lib/security/constants";



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

  const target = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: { id: true },
  });
  if (!target) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  try {
    await prisma.user.delete({ where: { id: userId } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: "No se pudo eliminar. Intenta desactivar si tiene registros asociados.",
      },
      { status: 400 }
    );
  }
}
