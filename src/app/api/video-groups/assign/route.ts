export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Role } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageVideoGroups } from "@/lib/video-groups";

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role as Role;
  const capabilities = (session.user as any).capabilities as string[] | undefined;
  if (!canManageVideoGroups(role, capabilities)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const tenantId = (session.user as any).tenantId as string;

  const body = await req.json().catch(() => ({}));
  const userId = String(body?.userId ?? "").trim();
  const raw = body?.group;
  const group = raw === null || raw === undefined || String(raw).trim() === "" ? null : String(raw).trim();

  if (!userId) return NextResponse.json({ error: "Falta userId" }, { status: 400 });

  const target = await prisma.user.findFirst({ where: { id: userId, tenantId }, select: { id: true } });
  if (!target) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  if (group) {
    const exists = await prisma.videoGroup.findFirst({ where: { tenantId, name: group }, select: { id: true } });
    if (!exists) return NextResponse.json({ error: "Grupo no existe" }, { status: 400 });
  }

  await prisma.user.update({ where: { id: userId }, data: { videoGroup: group } });
  return NextResponse.json({ ok: true, userId, group });
}
