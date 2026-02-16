// src/app/api/auth/reset-password/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { hashToken } from "@/lib/reset-token";
import { MIN_PASSWORD_LENGTH, PASSWORD_RESET_RATE_LIMIT } from "@/lib/security/constants";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { getClientIp } from "@/lib/security/client-ip";


const schema = z.object({
  token: z.string().trim().min(10),
  password: z.string().trim().optional(),
  newPassword: z.string().trim().optional(),
}).superRefine((value, ctx) => {
  const password = value.password || value.newPassword || "";

  if (!password) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["password"],
      message: "La contrasena es obligatoria.",
    });
    return;
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["password"],
      message: `La contrasena debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    });
  }
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const ipLimit = consumeRateLimit({
    key: `auth:reset-password:ip:${ip}`,
    ...PASSWORD_RESET_RATE_LIMIT,
  });

  if (!ipLimit.ok) {
    const retryAfterSeconds = Math.max(Math.ceil(ipLimit.retryAfterMs / 1000), 1);
    return NextResponse.json(
      { error: "Demasiados intentos. Intenta de nuevo mas tarde." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validación fallida", issues: parsed.error.issues }, { status: 400 });
  }

  const { token: rawToken } = parsed.data;
  const password = parsed.data.password || parsed.data.newPassword || "";
  const token = hashToken(rawToken);

  const tokenLimit = consumeRateLimit({
    key: `auth:reset-password:token:${token}`,
    ...PASSWORD_RESET_RATE_LIMIT,
  });

  if (!tokenLimit.ok) {
    const retryAfterSeconds = Math.max(Math.ceil(tokenLimit.retryAfterMs / 1000), 1);
    return NextResponse.json(
      { error: "Demasiados intentos para este token. Intenta de nuevo mas tarde." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  const row = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!row) return NextResponse.json({ error: "Token inválido." }, { status: 400 });
  if (row.usedAt) return NextResponse.json({ error: "Token ya fue usado." }, { status: 400 });
  if (row.expiresAt.getTime() < Date.now()) return NextResponse.json({ error: "Token expirado." }, { status: 400 });

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: row.userId },
      data: {
        passwordHash,
        sessionVersion: { increment: 1 },
      },
    });

    await tx.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    });
  });

  return NextResponse.json({ ok: true });
}
