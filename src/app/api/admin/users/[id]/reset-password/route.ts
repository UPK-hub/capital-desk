export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { generateRawToken, hashToken } from "@/lib/reset-token";
import { getTeamAdminScope } from "@/lib/access-control";
import { sendPasswordResetEmail } from "@/lib/security/password-reset-email";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { ADMIN_RESET_RATE_LIMIT } from "@/lib/security/constants";
import { getClientIp } from "@/lib/security/client-ip";

export async function POST(_req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = (session.user as any).role as Role;
  const tenantId = (session.user as any).tenantId as string;
  const adminId = (session.user as any).id as string | undefined;
  const userId = String(ctx.params.id);

  // Autorización: ADMIN global, o admin de equipo (con permiso "gestionar
  // usuarios") sobre un miembro de su equipo — nunca sobre otro ADMIN, para
  // evitar escalamiento de privilegios.
  let allowed = role === Role.ADMIN;
  if (!allowed) {
    const scope = adminId ? await getTeamAdminScope({ tenantId, userId: String(adminId) }) : null;
    if (scope && scope.manageMemberIds.includes(userId)) {
      const target = await prisma.user.findFirst({
        where: { id: userId, tenantId },
        select: { role: true },
      });
      allowed = !!target && target.role !== Role.ADMIN;
    }
  }
  if (!allowed) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const ip = getClientIp(_req);

  const rate = consumeRateLimit({
    key: `admin:reset-password:${adminId ?? "unknown"}:${userId}:${ip}`,
    ...ADMIN_RESET_RATE_LIMIT,
  });

  if (!rate.ok) {
    const retryAfterSeconds = Math.max(Math.ceil(rate.retryAfterMs / 1000), 1);
    return NextResponse.json(
      { error: "Demasiados intentos. Intenta nuevamente en unos minutos." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

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

  const raw = generateRawToken();
  const token = hashToken(raw);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1h

  await prisma.passwordResetToken.create({
    data: {
      token,
      userId: user.id,
      expiresAt,
    },
  });

  await sendPasswordResetEmail({
    to: user.email,
    userName: user.name,
    rawToken: raw,
    expiresAt,
    reason: "RESET_PASSWORD",
  });

  return NextResponse.json({ ok: true, expiresAt });
}
