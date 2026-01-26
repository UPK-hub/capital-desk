export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { z } from "zod";

const themeSchema = z.object({
  mode: z.enum(["light", "dark", "system"]),
  background: z.string().min(3),
  foreground: z.string().min(3),
  card: z.string().min(3),
  cardForeground: z.string().min(3),
  primary: z.string().min(3),
  primaryForeground: z.string().min(3),
  border: z.string().min(3),
  muted: z.string().min(3),
  mutedForeground: z.string().min(3),
  radius: z.string().min(2),
  stsBg: z.string().min(3),
  stsAccent: z.string().min(3),
  stsAccent2: z.string().min(3),
  backgroundDark: z.string().min(3),
  foregroundDark: z.string().min(3),
  cardDark: z.string().min(3),
  cardForegroundDark: z.string().min(3),
  primaryDark: z.string().min(3),
  primaryForegroundDark: z.string().min(3),
  borderDark: z.string().min(3),
  mutedDark: z.string().min(3),
  mutedForegroundDark: z.string().min(3),
  stsBgDark: z.string().min(3),
  stsAccentDark: z.string().min(3),
  stsAccent2Dark: z.string().min(3),
  fontSans: z.string().min(2),
  fontDisplay: z.string().min(2),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== Role.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const theme = await prisma.themeSettings.findFirst({ where: { tenantId } });
  return NextResponse.json({ theme });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== Role.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const body = await req.json().catch(() => ({}));
  const parsed = themeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validacion fallida", issues: parsed.error.issues }, { status: 400 });
  }

  const theme = await prisma.themeSettings.upsert({
    where: { tenantId },
    create: { tenantId, ...parsed.data },
    update: parsed.data,
  });

  return NextResponse.json({ ok: true, theme });
}
