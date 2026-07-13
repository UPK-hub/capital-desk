export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

const db = prisma as any;

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: "No autenticado", status: 401 } as const;
  const role = (session.user as any).role as Role;
  const tenantId = (session.user as any).tenantId as string;
  if (role !== Role.ADMIN) return { error: "No autorizado", status: 403 } as const;
  return { ok: true as const, tenantId };
}

function normDomains(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out = input
    .map((d) => String(d).trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
  return Array.from(new Set(out));
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const cx = await requireAdmin();
  if (!("ok" in cx)) return NextResponse.json({ error: cx.error }, { status: cx.status });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 120);
  if (Array.isArray(body?.domains)) data.domains = normDomains(body.domains);
  if (Array.isArray(body?.adminUserIds)) data.adminUserIds = body.adminUserIds.map((x: unknown) => String(x));
  if (typeof body?.viewCases === "boolean") data.viewCases = body.viewCases;
  if (typeof body?.viewVideoRequests === "boolean") data.viewVideoRequests = body.viewVideoRequests;
  if (typeof body?.viewWorkOrders === "boolean") data.viewWorkOrders = body.viewWorkOrders;
  if (typeof body?.viewTelemetry === "boolean") data.viewTelemetry = body.viewTelemetry;
  if (typeof body?.manageUsers === "boolean") data.manageUsers = body.manageUsers;

  if (!Object.keys(data).length) return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });

  try {
    const r = await db.team.updateMany({ where: { id: String(params.id), tenantId: cx.tenantId }, data });
    if (!r.count) return NextResponse.json({ error: "Equipo no encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (String(e?.code) === "P2002") {
      return NextResponse.json({ error: "Ya existe un equipo con ese nombre" }, { status: 409 });
    }
    return NextResponse.json({ error: "No se pudo actualizar el equipo" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const cx = await requireAdmin();
  if (!("ok" in cx)) return NextResponse.json({ error: cx.error }, { status: cx.status });
  await db.team.deleteMany({ where: { id: String(params.id), tenantId: cx.tenantId } });
  return NextResponse.json({ ok: true });
}
