export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Role } from "@prisma/client";
import { CAPABILITIES } from "@/lib/capabilities";
import { asDateInput, parseDateInput } from "@/lib/rvr";
import { generateDailyRvr } from "@/lib/rvr/generate";

function isRvrAllowed(role: Role, capabilities: string[] | undefined) {
  if (role === Role.ADMIN || role === Role.SUPERVISOR) return true;
  if (role === Role.BACKOFFICE) return !capabilities?.includes(CAPABILITIES.VIDEOS_ONLY);
  return false;
}

// Genera (o refresca) la lista priorizada de la RVR del día. Idempotente.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as Role;
  const capabilities = (session.user as any).capabilities as string[] | undefined;
  if (!isRvrAllowed(role, capabilities)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;

  const body = await req.json().catch(() => ({}));
  const reviewDate = parseDateInput(body?.date) ?? parseDateInput(asDateInput(new Date()))!;

  try {
    const res = await generateDailyRvr(tenantId, reviewDate, userId);
    return NextResponse.json({ ok: true, date: asDateInput(reviewDate), ...res });
  } catch (e) {
    console.error("RVR_GENERATE_FAILED", e);
    return NextResponse.json({ error: "No se pudo generar la lista priorizada." }, { status: 500 });
  }
}
