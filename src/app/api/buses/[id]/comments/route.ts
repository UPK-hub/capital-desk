export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

const ALLOWED = new Set<Role>([Role.ADMIN, Role.BACKOFFICE, Role.PLANNER, Role.TECHNICIAN]);

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as Role;
  if (!ALLOWED.has(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tenantId = (session.user as any).tenantId as string;
  const actorName = String((session.user as any).name ?? "").trim() || "Usuario";
  const busId = String(ctx.params.id);

  const body = await req.json().catch(() => null);
  const comment = String(body?.comment ?? "").trim();
  if (!comment) return NextResponse.json({ error: "Comentario requerido" }, { status: 400 });

  const bus = await prisma.bus.findFirst({
    where: { id: busId, tenantId },
    select: { id: true },
  });
  if (!bus) return NextResponse.json({ error: "Bus no encontrado" }, { status: 404 });

  const saved = await prisma.busLifecycleEvent.create({
    data: {
      busId: bus.id,
      eventType: "BUS_COMMENT",
      summary: `${actorName}: ${comment}`,
    },
    select: { id: true, eventType: true, summary: true, occurredAt: true },
  });

  return NextResponse.json({ ok: true, comment: saved });
}

