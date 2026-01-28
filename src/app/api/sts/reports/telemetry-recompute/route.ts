export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Role } from "@prisma/client";
import { canStsWrite } from "@/lib/sts/access";
import { applyTelemetryKpisForTenant } from "@/lib/sts/telemetry-kpi";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = session.user.role as Role;
  const caps = (session.user as any).capabilities as string[] | undefined;
  if (!canStsWrite(role, caps)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const tenantId = (session.user as any).tenantId as string;
  await applyTelemetryKpisForTenant(tenantId);
  return NextResponse.json({ ok: true });
}
