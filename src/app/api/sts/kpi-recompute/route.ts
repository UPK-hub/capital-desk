import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Role } from "@prisma/client";
import { recomputeStsKpisAllTenants, recomputeStsKpisForTenant } from "@/lib/sts/kpi-recompute";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("x-cron-secret");

  if (secret) {
    if (header !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await recomputeStsKpisAllTenants();
    return NextResponse.json({ ok: true });
  }

  const session = await getServerSession(authOptions);
  const role = session?.user?.role as Role | undefined;
  const tenantId = (session?.user as any)?.tenantId as string | undefined;

  if (!session?.user || role !== Role.ADMIN || !tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await recomputeStsKpisForTenant(tenantId);
  return NextResponse.json({ ok: true });
}
