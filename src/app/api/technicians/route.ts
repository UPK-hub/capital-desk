export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const q = req.nextUrl.searchParams.get("query")?.trim() ?? "";

  const items = await prisma.user.findMany({
    where: {
      tenantId,
      active: true,
      role: Role.TECHNICIAN,
      ...(q.length >= 2
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    take: 20,
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });

  return NextResponse.json(items);
}
