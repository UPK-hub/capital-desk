export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;

  // Mesa de ayuda para TODOS: devolvemos todos los usuarios activos del tenant
  // (excepto el propio), sin filtrar por rol. Así cualquier usuario (oficina,
  // supervisor, helpdesk, técnico, Capital) puede iniciar un chat directo.
  const query = (req.nextUrl.searchParams.get("query") ?? "").trim();

  const items = await prisma.user.findMany({
    where: {
      tenantId,
      active: true,
      NOT: { id: userId },
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { email: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true },
  });

  return NextResponse.json({ items });
}
