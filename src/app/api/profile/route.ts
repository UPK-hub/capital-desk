export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { MIN_PASSWORD_LENGTH } from "@/lib/security/constants";

const updateSchema = z.object({
  email: z.string().email().optional(),
  currentPassword: z.string().min(4).optional(),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH).optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id as string;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true },
  });

  return NextResponse.json({ user });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id as string;
  const body = await req.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validacion fallida", issues: parsed.error.issues }, { status: 400 });
  }

  const { email, currentPassword, newPassword } = parsed.data;
  if (!email && !newPassword) {
    return NextResponse.json({ error: "No hay cambios" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, passwordHash: true },
  });
  if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  if (user.passwordHash) {
    if (!currentPassword) {
      return NextResponse.json({ error: "Ingresa tu clave actual" }, { status: 400 });
    }
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) return NextResponse.json({ error: "Clave actual incorrecta" }, { status: 400 });
  }

  const data: { email?: string; passwordHash?: string; sessionVersion?: { increment: number } } = {};
  if (email && email !== user.email) data.email = email.toLowerCase().trim();
  if (newPassword) {
    data.passwordHash = await bcrypt.hash(newPassword, 10);
    data.sessionVersion = { increment: 1 };
  }

  try {
    const updated = await prisma.user.update({ where: { id: userId }, data });
    return NextResponse.json({
      ok: true,
      user: { id: updated.id, name: updated.name, email: updated.email, role: updated.role },
    });
  } catch (err: any) {
    if (String(err?.code) === "P2002") {
      return NextResponse.json({ error: "Este correo ya existe" }, { status: 400 });
    }
    return NextResponse.json({ error: "No se pudo actualizar" }, { status: 500 });
  }
}
