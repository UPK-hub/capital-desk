export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, StsTicketSeverity, StsTicketStatus } from "@prisma/client";
import { canStsAdmin, canStsRead } from "@/lib/sts/access";
import { z } from "zod";

const itemSchema = z.object({
  componentId: z.string().min(1),
  severity: z.nativeEnum(StsTicketSeverity),
  responseMinutes: z.number().int().min(1),
  resolutionMinutes: z.number().int().min(1),
  pauseStatuses: z.array(z.nativeEnum(StsTicketStatus)).optional(),
});

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = session.user.role as Role;
  const caps = (session.user as any).capabilities as string[] | undefined;
  if (!canStsRead(role, caps)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const tenantId = (session.user as any).tenantId as string;
  const items = await prisma.stsSlaPolicy.findMany({
    where: { tenantId },
    orderBy: [{ componentId: "asc" }, { severity: "asc" }],
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
    prisma.stsSlaPolicy.upsert({
      where: {
        tenantId_componentId_severity: {
          tenantId,
          componentId: item.componentId,
          severity: item.severity,
        },
      },
      create: {
        tenantId,
        componentId: item.componentId,
        severity: item.severity,
        responseMinutes: item.responseMinutes,
        resolutionMinutes: item.resolutionMinutes,
        pauseStatuses: item.pauseStatuses ?? [StsTicketStatus.WAITING_VENDOR],
      },
      update: {
        responseMinutes: item.responseMinutes,
        resolutionMinutes: item.resolutionMinutes,
        pauseStatuses: item.pauseStatuses ?? [StsTicketStatus.WAITING_VENDOR],
      },
    })
  );

  await prisma.$transaction(ops);
  return NextResponse.json({ ok: true });
}
