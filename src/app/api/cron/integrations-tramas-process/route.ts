export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { IntegrationInboundStatus, Role } from "@prisma/client";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { processInboundTelemetryBatch } from "@/lib/integrations/tramas";

const BodySchema = z.object({
  tenantCode: z.string().trim().min(1).max(64).optional(),
  limitPerTenant: z.number().int().min(1).max(2000).optional(),
  maxTenants: z.number().int().min(1).max(100).optional(),
});

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("x-cron-secret");

  if (secret) {
    if (header !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    const session = await getServerSession(authOptions);
    const role = session?.user?.role as Role | undefined;
    if (!session?.user || (role !== Role.ADMIN && role !== Role.BACKOFFICE)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const bodyRaw = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(bodyRaw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Payload inválido",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  const limitPerTenant = parsed.data.limitPerTenant ?? 500;
  const maxTenants = parsed.data.maxTenants ?? 20;

  const tenants = parsed.data.tenantCode
    ? await prisma.tenant.findMany({
        where: { code: parsed.data.tenantCode },
        select: { id: true, code: true },
        take: 1,
      })
    : await prisma.integrationInboundEvent.findMany({
        where: {
          status: { in: [IntegrationInboundStatus.RECEIVED, IntegrationInboundStatus.ERROR] },
          retries: { lt: 5 },
        },
        select: { tenant: { select: { id: true, code: true } } },
        distinct: ["tenantId"],
        take: maxTenants,
      }).then((rows) => rows.map((row) => row.tenant));

  const summaries: Array<{
    tenant: string;
    picked: number;
    processed: number;
    rejected: number;
    errored: number;
    lifecycleCreated: number;
  }> = [];

  for (const tenant of tenants) {
    const result = await processInboundTelemetryBatch({
      tenantId: tenant.id,
      limit: limitPerTenant,
    });
    summaries.push({
      tenant: tenant.code,
      ...result,
    });
  }

  return NextResponse.json({
    ok: true,
    tenants: summaries.length,
    summaries,
  });
}
