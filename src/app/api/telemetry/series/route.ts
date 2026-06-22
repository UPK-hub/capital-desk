export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSeriesCached } from "@/lib/telemetry/cache";
import { parseQualityRange } from "@/lib/telemetry/quality-params";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const tenantId = (session.user as any).tenantId as string;
  const { start, end, busId } = parseQualityRange(req);
  const typeParam = req.nextUrl.searchParams.get("type");
  const type = typeParam === "alarmas" ? "alarmas" : typeParam === "periodicas" ? "periodicas" : "eventos";
  const code = req.nextUrl.searchParams.get("code");
  const data = await getSeriesCached({
    tenantId,
    type,
    startISO: start.toISOString(),
    endISO: end.toISOString(),
    busId,
    code: code || null,
  });
  return NextResponse.json(data);
}
