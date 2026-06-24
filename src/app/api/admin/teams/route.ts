export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

// El cliente Prisma se regenera en el build del servidor; aquí accedemos al
// modelo Team de forma laxa para no depender de la generación local.
const db = prisma as any;

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: "Unauthorized", status: 401 } as const;
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

export async function GET() {
  const cx = await requireAdmin();
  if (!("ok" in cx)) return NextResponse.json({ error: cx.error }, { status: cx.status });
  const teams = await db.team.findMany({
    where: { tenantId: cx.tenantId },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ teams });
}

export async function POST(req: NextRequest) {
  const cx = await requireAdmin();
  if (!("ok" in cx)) return NextResponse.json({ error: cx.error }, { status: cx.status });

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Nombre del equipo requerido" }, { status: 400 });

  const data = {
    tenantId: cx.tenantId,
    name: name.slice(0, 120),
    domains: normDomains(body?.domains),
    adminUserIds: Array.isArray(body?.adminUserIds) ? body.adminUserIds.map((x: unknown) => String(x)) : [],
    viewCases: body?.viewCases !== false,
    viewVideoRequests: body?.viewVideoRequests !== false,
    viewWorkOrders: body?.viewWorkOrders !== false,
    viewTelemetry: body?.viewTelemetry === true,
    manageUsers: body?.manageUsers !== false,
  };

  try {
    const team = await db.team.create({ data });
    return NextResponse.json({ ok: true, team });
  } catch (e: any) {
    if (String(e?.code) === "P2002") {
      return NextResponse.json({ error: "Ya existe un equipo con ese nombre" }, { status: 409 });
    }
    return NextResponse.json({ error: "No se pudo crear el equipo" }, { status: 500 });
  }
}
