export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
      NOT: { code: "BUS_ID" },
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
      _count: {
        select: {
          equipments: true,
          cases: true,
        },
      },
      cases: {
        select: {
          type: true,
          workOrder: { select: { id: true } },
        },
      },
    },
  });

  const data = buses.map((b) => ({
    preventiveCount: b.cases.filter((c) => c.type === "PREVENTIVO").length,
    correctiveCount: b.cases.filter((c) => c.type === "CORRECTIVO").length,
    noveltyCount: b.cases.filter((c) => c.type === "NOVEDAD").length,
    id: b.id,
    code: b.code,
    plate: b.plate,
    equipmentCount: b._count.equipments,
    caseCount: b._count.cases,
    otCount: b.cases.filter((c) => Boolean(c.workOrder)).length,
  }));

  return NextResponse.json(data);
}
