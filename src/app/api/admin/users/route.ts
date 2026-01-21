export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

async function getAdminContext() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ? String(session.user.email).toLowerCase() : null;

  if (!session?.user || !email) return { ok: false as const, status: 401, error: "Unauthorized" };
  const role = (session.user as any).role as Role | undefined;
if (role !== Role.ADMIN) {
  return { ok: false as const, status: 403, error: "Forbidden" };
}


  // Fuente de verdad: BD
  const me = await prisma.user.findUnique({
    where: { email },
    select: { id: true, tenantId: true, role: true, active: true },
  });

  if (!me) return { ok: false as const, status: 401, error: "Unauthorized" };
  if (!me.active) return { ok: false as const, status: 403, error: "User inactive" };
  if (me.role !== Role.ADMIN) return { ok: false as const, status: 403, error: "Forbidden" };

  // Validar tenant existe (evita P2003)
  const tenant = await prisma.tenant.findUnique({ where: { id: me.tenantId }, select: { id: true } });
  if (!tenant) return { ok: false as const, status: 500, error: "Tenant inválido en usuario admin" };

  return { ok: true as const, tenantId: me.tenantId, adminId: me.id };
}

export async function GET(_req: NextRequest) {
  const ctx = await getAdminContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const users = await prisma.user.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, users });
}

export async function POST(req: NextRequest) {
  const ctx = await getAdminContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const role = body.role as Role;

  if (!name || name.length < 2) return NextResponse.json({ error: "Nombre inválido" }, { status: 400 });
  if (!email.includes("@")) return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  if (![Role.ADMIN, Role.BACKOFFICE, Role.TECHNICIAN].includes(role)) {
    return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
  }

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return NextResponse.json({ error: "Ese email ya existe" }, { status: 409 });

  const tempPassword = Math.random().toString(36).slice(2, 10);
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const user = await prisma.user.create({
    data: {
      tenantId: ctx.tenantId, // <- tenant REAL, existe sí o sí
      name,
      email,
      role,
      passwordHash,
      active: true,
    },
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
  });

  return NextResponse.json({ ok: true, user, tempPassword });
}
