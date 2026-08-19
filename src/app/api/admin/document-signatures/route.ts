export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { z } from "zod";
import {
  DEFAULT_DOCUMENT_SIGNATURES,
  normalizeDocumentSignatures,
} from "@/lib/document-signatures";

// Quién puede ver/cambiar las firmas de los documentos.
const ALLOWED: Role[] = [Role.ADMIN, Role.SUPERVISOR];

const schema = z.object({
  coordinadorName: z.string().trim().min(3, "Escribe el nombre del coordinador.").max(80),
  coordinadorRole: z.string().trim().min(3, "Escribe el cargo del coordinador.").max(60),
  liderName: z.string().trim().min(3, "Escribe el nombre del líder técnico.").max(80),
  liderRole: z.string().trim().min(3, "Escribe el cargo del líder técnico.").max(60),
});

async function ctx() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { ok: false as const, status: 401, error: "No autenticado" };
  const role = (session.user as any).role as Role;
  if (!ALLOWED.includes(role)) return { ok: false as const, status: 403, error: "No autorizado" };
  return {
    ok: true as const,
    tenantId: (session.user as any).tenantId as string,
    userId: String((session.user as any).id ?? ""),
  };
}

export async function GET() {
  const c = await ctx();
  if (!c.ok) return NextResponse.json({ error: c.error }, { status: c.status });

  const row = await prisma.documentSignatureSettings.findUnique({ where: { tenantId: c.tenantId } });
  const users = await prisma.user.findMany({
    where: { tenantId: c.tenantId, active: true },
    select: { id: true, name: true, jobTitle: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    signatures: normalizeDocumentSignatures(row),
    defaults: DEFAULT_DOCUMENT_SIGNATURES,
    updatedAt: row?.updatedAt ?? null,
    users,
  });
}

export async function PUT(req: NextRequest) {
  const c = await ctx();
  if (!c.ok) return NextResponse.json({ error: c.error }, { status: c.status });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 }
    );
  }
  const data = normalizeDocumentSignatures(parsed.data);

  const row = await prisma.documentSignatureSettings.upsert({
    where: { tenantId: c.tenantId },
    create: { tenantId: c.tenantId, ...data, updatedById: c.userId || null },
    update: { ...data, updatedById: c.userId || null },
  });

  return NextResponse.json({ ok: true, signatures: normalizeDocumentSignatures(row), updatedAt: row.updatedAt });
}
