export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Role } from "@prisma/client";
import { computeAccessFlags } from "@/lib/dashboard/access";
import { resolveMany } from "@/lib/dashboard/metrics";

// Resuelve los datos de un conjunto de widgets para el usuario actual.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as any).role as Role;
  const tenantId = String((session.user as any).tenantId ?? "");
  const userId = String((session.user as any).id ?? "");
  const caps = (session.user as any).capabilities as string[] | undefined;
  if (!tenantId || !userId) {
    return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });
  }

  const flags = computeAccessFlags(role, caps);

  const body = await req.json().catch(() => ({}));
  const rawWidgets = Array.isArray(body?.widgets) ? body.widgets : [];
  const rangeDays = Number(body?.rangeDays) || 14;

  const widgets = rawWidgets
    .filter(
      (w: any) => w && typeof w.i === "string" && typeof w.metric === "string"
    )
    .slice(0, 40)
    .map((w: any) => ({ i: w.i, metric: w.metric }));

  const data = await resolveMany(
    { tenantId, userId, role, caps, flags, rangeDays },
    widgets
  );

  return NextResponse.json({ ok: true, data });
}
