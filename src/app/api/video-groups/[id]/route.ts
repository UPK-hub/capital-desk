export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Role } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageVideoGroups } from "@/lib/video-groups";

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

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const g = await guard();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const tenantId = g.tenantId;
  const id = String(ctx.params.id);

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  if (name.length < 2 || name.length > 64) {
    return NextResponse.json({ error: "Nombre inválido (2 a 64 caracteres)" }, { status: 400 });
  }

  const group = await prisma.videoGroup.findFirst({ where: { id, tenantId }, select: { id: true, name: true } });
  if (!group) return NextResponse.json({ error: "Grupo no encontrado" }, { status: 404 });
  if (group.name === name) return NextResponse.json({ ok: true, group });

  const dup = await prisma.videoGroup.findFirst({ where: { tenantId, name } });
  if (dup && dup.id !== id) {
    return NextResponse.json({ error: "Ya existe un grupo con ese nombre" }, { status: 409 });
  }

  await prisma.$transaction([
    prisma.user.updateMany({ where: { tenantId, videoGroup: group.name }, data: { videoGroup: name } }),
    prisma.videoGroup.update({ where: { id }, data: { name } }),
  ]);

  return NextResponse.json({ ok: true, group: { id, name } });
}

export async function DELETE(_req: NextRequest, ctx: { params: { id: string } }) {
  const g = await guard();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const tenantId = g.tenantId;
  const id = String(ctx.params.id);

  const group = await prisma.videoGroup.findFirst({ where: { id, tenantId }, select: { id: true, name: true } });
  if (!group) return NextResponse.json({ error: "Grupo no encontrado" }, { status: 404 });

  await prisma.$transaction([
    prisma.user.updateMany({ where: { tenantId, videoGroup: group.name }, data: { videoGroup: null } }),
    prisma.videoGroup.delete({ where: { id } }),
  ]);

  return NextResponse.json({ ok: true, deleted: true });
}
