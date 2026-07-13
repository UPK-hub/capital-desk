export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

async function getCtx(caseId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: "No autenticado", status: 401 } as const;
  const role = (session.user as any).role as Role;
  const tenantId = (session.user as any).tenantId as string;
  if (![Role.ADMIN, Role.BACKOFFICE, Role.SUPERVISOR, Role.PLANNER].includes(role)) {
    return { error: "No autorizado", status: 403 } as const;
  }
  const c = await prisma.case.findFirst({ where: { id: caseId, tenantId }, select: { id: true } });
  if (!c) return { error: "Caso no encontrado", status: 404 } as const;
  return { ok: true as const, tenantId, caseId: c.id };
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const cx = await getCtx(String(params.id));
  if (!("ok" in cx)) return NextResponse.json({ error: cx.error }, { status: cx.status });
  const body = await req.json().catch(() => ({}));
  const text = String(body?.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "Texto requerido" }, { status: 400 });
  const max = await prisma.caseChecklistItem.aggregate({
    where: { caseId: cx.caseId },
    _max: { position: true },
  });
  const item = await prisma.caseChecklistItem.create({
    data: { caseId: cx.caseId, text: text.slice(0, 300), position: (max._max.position ?? 0) + 1 },
    select: { id: true, text: true, done: true },
  });
  return NextResponse.json({ ok: true, item });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const cx = await getCtx(String(params.id));
  if (!("ok" in cx)) return NextResponse.json({ error: cx.error }, { status: cx.status });
  const body = await req.json().catch(() => ({}));
  const itemId = String(body?.itemId ?? "");
  if (!itemId) return NextResponse.json({ error: "itemId requerido" }, { status: 400 });
  const data: any = {};
  if (typeof body?.done === "boolean") data.done = body.done;
  if (typeof body?.text === "string") {
    const t = body.text.trim();
    if (t) data.text = t.slice(0, 300);
  }
  if (!Object.keys(data).length) return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  const r = await prisma.caseChecklistItem.updateMany({ where: { id: itemId, caseId: cx.caseId }, data });
  if (!r.count) return NextResponse.json({ error: "Ítem no encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const cx = await getCtx(String(params.id));
  if (!("ok" in cx)) return NextResponse.json({ error: cx.error }, { status: cx.status });
  const body = await req.json().catch(() => ({}));
  const itemId = String(body?.itemId ?? "");
  if (!itemId) return NextResponse.json({ error: "itemId requerido" }, { status: 400 });
  await prisma.caseChecklistItem.deleteMany({ where: { id: itemId, caseId: cx.caseId } });
  return NextResponse.json({ ok: true });
}
