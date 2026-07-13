export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getCtx() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const userId = String((session.user as any).id ?? "");
  const tenantId = String((session.user as any).tenantId ?? "");
  if (!userId || !tenantId) return null;
  return { userId, tenantId };
}

// Lee el tablero guardado del usuario (o null si nunca lo ha guardado).
export async function GET() {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const row = await prisma.dashboardLayout.findUnique({
    where: { userId: ctx.userId },
  });
  return NextResponse.json({ ok: true, data: row?.data ?? null });
}

// Guarda (upsert) el tablero del usuario.
export async function PUT(req: NextRequest) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const data = body?.data;
  if (
    !data ||
    typeof data !== "object" ||
    !Array.isArray(data.widgets) ||
    !Array.isArray(data.layout)
  ) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  if (data.widgets.length > 40) {
    return NextResponse.json({ error: "Demasiados widgets" }, { status: 400 });
  }

  const saved = await prisma.dashboardLayout.upsert({
    where: { userId: ctx.userId },
    create: { userId: ctx.userId, tenantId: ctx.tenantId, data },
    update: { data },
  });

  return NextResponse.json({ ok: true, updatedAt: saved.updatedAt });
}
