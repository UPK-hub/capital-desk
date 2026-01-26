export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, StsKpiMetric, StsKpiPeriodicity } from "@prisma/client";
import { canStsAdmin, canStsRead } from "@/lib/sts/access";
import { z } from "zod";

const createSchema = z.object({
  componentId: z.string().min(1),
  metric: z.nativeEnum(StsKpiMetric),
  periodicity: z.nativeEnum(StsKpiPeriodicity),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  value: z.number(),
  source: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = session.user.role as Role;
  const caps = (session.user as any).capabilities as string[] | undefined;
  if (!canStsRead(role, caps)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const tenantId = (session.user as any).tenantId as string;
  const metric = req.nextUrl.searchParams.get("metric");
  const periodicity = req.nextUrl.searchParams.get("periodicity");

  const items = await prisma.stsKpiMeasurement.findMany({
    where: {
      tenantId,
      ...(metric ? { metric: metric as StsKpiMetric } : {}),
      ...(periodicity ? { periodicity: periodicity as StsKpiPeriodicity } : {}),
    },
    orderBy: { periodStart: "desc" },
    take: 100,
  });

  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = session.user.role as Role;
  const caps = (session.user as any).capabilities as string[] | undefined;
  if (!canStsAdmin(role, caps)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const tenantId = (session.user as any).tenantId as string;
  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validacion fallida", issues: parsed.error.issues }, { status: 400 });
  }

  const created = await prisma.stsKpiMeasurement.create({
    data: {
      tenantId,
      componentId: parsed.data.componentId,
      metric: parsed.data.metric,
      periodicity: parsed.data.periodicity,
      periodStart: new Date(parsed.data.periodStart),
      periodEnd: new Date(parsed.data.periodEnd),
      value: parsed.data.value,
      source: parsed.data.source ?? null,
    },
  });

  return NextResponse.json({ ok: true, item: created }, { status: 201 });
}
