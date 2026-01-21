import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export function generateRawToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

export function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export async function issuePasswordResetToken(params: {
  tenantId: string;
  userId: string;
  ttlMinutes?: number;
}) {
  const ttlMinutes = params.ttlMinutes ?? 60;
  const raw = generateRawToken();
  const tokenHash = sha256(raw);

  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);

  await prisma.passwordResetToken.create({
    data: {
      tenantId: params.tenantId,
      userId: params.userId,
      tokenHash,
      expiresAt,
    },
  });

  return { rawToken: raw, expiresAt };
}
