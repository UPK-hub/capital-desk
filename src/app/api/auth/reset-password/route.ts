// src/app/api/auth/reset-password/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { hashToken } from "@/lib/reset-token";



const schema = z.object({
  token: z.string().trim().min(10),
  password: z.string().min(8),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validación fallida", issues: parsed.error.issues }, { status: 400 });
  }

  const { token: rawToken, password } = parsed.data;
  const token = hashToken(rawToken);

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
      data: { passwordHash },
    });

    await tx.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    });
  });

  return NextResponse.json({ ok: true });
}
