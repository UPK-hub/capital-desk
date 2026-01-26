export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, StsKpiMetric, StsKpiPeriodicity } from "@prisma/client";
import { canStsAdmin, canStsRead } from "@/lib/sts/access";
import { z } from "zod";

const itemSchema = z.object({
  componentId: z.string().min(1),
  metric: z.nativeEnum(StsKpiMetric),
  periodicity: z.nativeEnum(StsKpiPeriodicity),
  threshold: z.number().min(0).max(100),
});

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = session.user.role as Role;
  const caps = (session.user as any).capabilities as string[] | undefined;
  if (!canStsRead(role, caps)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const tenantId = (session.user as any).tenantId as string;
  const items = await prisma.stsKpiPolicy.findMany({
    where: { tenantId },
    orderBy: [{ componentId: "asc" }, { metric: "asc" }],
  });
  return NextResponse.json({ items });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = session.user.role as Role;
  const caps = (session.user as any).capabilities as string[] | undefined;
  if (!canStsAdmin(role, caps)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const tenantId = (session.user as any).tenantId as string;
  const body = await req.json().catch(() => ({}));
  const parsed = z.array(itemSchema).safeParse(body?.items ?? body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validacion fallida", issues: parsed.error.issues }, { status: 400 });
  }

  const ops = parsed.data.map((item) =>
    prisma.stsKpiPolicy.upsert({
      where: {
        tenantId_componentId_metric_periodicity: {
          tenantId,
          componentId: item.componentId,
          metric: item.metric,
          periodicity: item.periodicity,
        },
      },
      create: {
        tenantId,
        componentId: item.componentId,
        metric: item.metric,
        periodicity: item.periodicity,
        threshold: item.threshold,
      },
      update: { threshold: item.threshold },
    })
  );

  await prisma.$transaction(ops);
  return NextResponse.json({ ok: true });
}
