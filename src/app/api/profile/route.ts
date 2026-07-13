export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CAPABILITIES } from "@/lib/capabilities";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { MIN_PASSWORD_LENGTH } from "@/lib/security/constants";

const updateSchema = z.object({
  email: z.string().email().optional(),
  currentPassword: z.string().min(4).optional(),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH).optional(),
  name: z.string().trim().min(1).optional(),
  phone: z.string().trim().optional().nullable(),
  jobTitle: z.string().trim().optional().nullable(),
  document: z.string().trim().optional().nullable(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const userId = (session.user as any).id as string;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      capabilities: true,
      phone: true,
      jobTitle: true,
      document: true,
    },
  });

  return NextResponse.json({ user });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const userId = (session.user as any).id as string;
  const body = await req.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validacion fallida", issues: parsed.error.issues }, { status: 400 });
  }

  const { email, currentPassword, newPassword, name, phone, jobTitle, document } = parsed.data;

  const profileFieldsProvided =
    name !== undefined || phone !== undefined || jobTitle !== undefined || document !== undefined;
  const sensitiveChange = Boolean(email) || Boolean(newPassword);

  if (!email && !newPassword && !profileFieldsProvided) {
    return NextResponse.json({ error: "No hay cambios" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, passwordHash: true, capabilities: true },
  });
  if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  // La clave actual solo se exige para cambios sensibles (correo o contraseña),
  // no para completar datos de perfil como teléfono, cargo o documento.
  if (sensitiveChange && user.passwordHash) {
    if (!currentPassword) {
      return NextResponse.json({ error: "Ingresa tu clave actual" }, { status: 400 });
    }
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) return NextResponse.json({ error: "Clave actual incorrecta" }, { status: 400 });
  }

  const data: {
    email?: string;
    passwordHash?: string;
    sessionVersion?: { increment: number };
    capabilities?: string[];
    name?: string;
    phone?: string | null;
    jobTitle?: string | null;
    document?: string | null;
  } = {};
  if (email && email !== user.email) data.email = email.toLowerCase().trim();
  if (newPassword) {
    data.passwordHash = await bcrypt.hash(newPassword, 10);
    data.sessionVersion = { increment: 1 };
    data.capabilities = (user.capabilities ?? []).filter(
      (cap) => cap !== CAPABILITIES.FORCE_PASSWORD_CHANGE
    );
  }
  if (name !== undefined) data.name = name;
  if (phone !== undefined) data.phone = phone || null;
  if (jobTitle !== undefined) data.jobTitle = jobTitle || null;
  if (document !== undefined) data.document = document || null;

  try {
    const updated = await prisma.user.update({ where: { id: userId }, data });
    return NextResponse.json({
      ok: true,
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        phone: updated.phone,
        jobTitle: updated.jobTitle,
        document: updated.document,
      },
    });
  } catch (err: any) {
    if (String(err?.code) === "P2002") {
      return NextResponse.json({ error: "Este correo ya existe" }, { status: 400 });
    }
    return NextResponse.json({ error: "No se pudo actualizar" }, { status: 500 });
  }
}
