import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import DashboardClient from "@/components/dashboard/DashboardClient";
import { computeAccessFlags } from "@/lib/dashboard/access";
import type { DashboardData } from "@/lib/dashboard/catalog";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const role = (session.user as any).role as Role;
  const tenantId = (session.user as any).tenantId as string;
  const caps = (session.user as any).capabilities as string[] | undefined;
  const name = ((session.user as any).name as string | undefined) ?? "";
  const userId = String((session.user as any).id ?? "");

  const flags = computeAccessFlags(role, caps);

  const [row, tenant] = await Promise.all([
    userId
      ? prisma.dashboardLayout.findUnique({ where: { userId } })
      : Promise.resolve(null),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
  ]);

  const initialData = (row?.data as DashboardData | undefined) ?? null;

  return (
    <DashboardClient
      flags={flags}
      initialData={initialData}
      userName={name}
      tenantName={tenant?.name ?? "CapitalBus"}
    />
  );
}
