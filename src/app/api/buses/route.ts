import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const { searchParams } = new URL(req.url);

  const q = (searchParams.get("q") ?? searchParams.get("query") ?? "").trim();

  // UX:
  // - sin texto → pocos resultados
  // - con texto → más, pero controlado
  const take = q ? 100 : 20;

  const buses = await prisma.bus.findMany({
    where: {
      tenantId,
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: "insensitive" } },
              { plate: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { code: "asc" },
    take,
    select: {
      id: true,
      code: true,
      plate: true,
    },
  });

  return NextResponse.json(buses);
}
