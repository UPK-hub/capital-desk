export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import crypto from "node:crypto";



function sha256(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export async function POST(_req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as Role;
  if (role !== Role.ADMIN) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tenantId = (session.user as any).tenantId as string;
  const userId = String(ctx.params.id);

  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: { id: true, email: true, name: true },
  });
  if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  // invalida tokens previos no usados (opcional, recomendado)
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });

  const raw = crypto.randomBytes(24).toString("hex");
  const token = sha256(raw);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1h

  await prisma.passwordResetToken.create({
    data: {
      token,
      userId: user.id,
      expiresAt,
    },
  });

  // luego: enviar correo con link que lleve raw, no el hash
  return NextResponse.json({ ok: true, rawToken: raw, expiresAt });
}
