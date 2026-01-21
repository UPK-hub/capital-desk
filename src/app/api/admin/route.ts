export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { z } from "zod";
import bcrypt from "bcryptjs";



const createSchema = z.object({
  name: z.string().trim().min(2, "Nombre muy corto"),
  email: z.string().trim().email("Email inválido"),
  role: z.nativeEnum(Role),
  active: z.boolean().optional().default(true),
  password: z.string().trim().optional().nullable(), // si viene vacío => null
});

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as Role;
  if (role !== Role.ADMIN) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tenantId = (session.user as any).tenantId as string;

  const users = await prisma.user.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      createdAt: true,
      updatedAt: true,
      passwordHash: true,
    },
  });

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      active: u.active,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      hasPassword: Boolean(u.passwordHash),
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as Role;
  if (role !== Role.ADMIN) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tenantId = (session.user as any).tenantId as string;

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validación fallida", issues: parsed.error.issues }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase().trim();
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return NextResponse.json({ error: "Ya existe un usuario con ese email." }, { status: 409 });

  const passwordHash = parsed.data.password?.trim()
    ? await bcrypt.hash(parsed.data.password.trim(), 10)
    : null;

  // clave: tenantId SIEMPRE desde sesión
  const user = await prisma.user.create({
    data: {
      tenantId,
      name: parsed.data.name,
      email,
      role: parsed.data.role,
      active: parsed.data.active,
      passwordHash,
    },
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true, passwordHash: true },
  });

  return NextResponse.json(
    {
      ok: true,
      user: { ...user, hasPassword: Boolean(user.passwordHash) },
    },
    { status: 201 }
  );
}
