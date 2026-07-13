export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Role } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageVideoGroups, DEFAULT_VIDEO_GROUPS } from "@/lib/video-groups";

async function guard() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { ok: false as const, status: 401, error: "No autenticado" };
  const role = (session.user as any).role as Role;
  const capabilities = (session.user as any).capabilities as string[] | undefined;
  if (!canManageVideoGroups(role, capabilities)) {
    return { ok: false as const, status: 403, error: "No autorizado" };
  }
  return { ok: true as const, tenantId: (session.user as any).tenantId as string };
}

export async function GET() {
  const g = await guard();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const tenantId = g.tenantId;

  // Sembrar los grupos por defecto la primera vez.
  const count = await prisma.videoGroup.count({ where: { tenantId } });
  if (count === 0) {
    await prisma.videoGroup.createMany({
      data: DEFAULT_VIDEO_GROUPS.map((name) => ({ tenantId, name })),
      skipDuplicates: true,
    });
  }

  const [groups, memberCounts, users] = await Promise.all([
    prisma.videoGroup.findMany({ where: { tenantId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.user.groupBy({
      by: ["videoGroup"],
      where: { tenantId, videoGroup: { not: null } },
      _count: { id: true },
    }),
    prisma.user.findMany({
      where: { tenantId, NOT: { email: { endsWith: "@deleted.local" } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true, active: true, videoGroup: true },
    }),
  ]);

  const countByGroup = new Map<string, number>(
    memberCounts.map((m) => [String(m.videoGroup), m._count.id])
  );

  return NextResponse.json({
    ok: true,
    groups: groups.map((gr) => ({ id: gr.id, name: gr.name, memberCount: countByGroup.get(gr.name) ?? 0 })),
    users,
  });
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const tenantId = g.tenantId;

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  if (name.length < 2 || name.length > 64) {
    return NextResponse.json({ error: "Nombre inválido (2 a 64 caracteres)" }, { status: 400 });
  }

  const existing = await prisma.videoGroup.findFirst({ where: { tenantId, name } });
  if (existing) return NextResponse.json({ error: "Ya existe un grupo con ese nombre" }, { status: 409 });

  const group = await prisma.videoGroup.create({ data: { tenantId, name }, select: { id: true, name: true } });
  return NextResponse.json({ ok: true, group });
}
