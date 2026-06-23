export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getQualityCached } from "@/lib/telemetry/cache";
import { parseQualityRange } from "@/lib/telemetry/quality-params";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const tenantId = (session.user as any).tenantId as string;
  const { start, end, busId } = parseQualityRange(req);

  let busCode: string | null = null;
  if (busId) {
    const bus = await prisma.bus.findFirst({ where: { id: busId, tenantId }, select: { code: true } });
    busCode = bus?.code ?? null;
  }

  const data = await getQualityCached({
    tenantId,
    startISO: start.toISOString(),
    endISO: end.toISOString(),
    busCode,
    limit: 1000,
  });
  return NextResponse.json(data);
}
