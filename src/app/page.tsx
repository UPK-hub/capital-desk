import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import DashboardClient from "@/components/dashboard/DashboardClient";
import { computeAccessFlags } from "@/lib/dashboard/access";
import type { DashboardData } from "@/lib/dashboard/catalog";
import PanoramaOperativo from "@/components/dashboard/PanoramaOperativo";
import { getPanoramaOperativo, type Panorama } from "@/lib/dashboard/panorama";
import { recentMonths } from "@/lib/cases/summary";
import { canViewPanic } from "@/lib/panic/access";

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

  // Panorama operativo: solo para quien ve la operación completa. Si falla una
  // consulta no se cae el Inicio: el tablero de widgets sigue funcionando.
  const mes = recentMonths(1)[0];
  let panorama: Panorama | null = null;
  if (flags.canBackoffice) {
    try {
      panorama = await getPanoramaOperativo({ tenantId, monthKey: mes.key });
    } catch (e) {
      console.error("[inicio] panorama operativo no disponible:", e);
    }
  }

  // Con el panorama operativo arriba, el tablero de widgets repetía los mismos
  // indicadores (casos abiertos, OTs, actividad, preventivos por día). Se deja
  // solo para los perfiles que no ven el panorama: técnicos y videos.
  return (
    <div className="space-y-5">
      {panorama ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">Panorama operativo</h2>
            <span className="text-xs text-slate-500">
              {tenant?.name ?? "CapitalBus"} · {mes.label}
            </span>
          </div>
          <PanoramaOperativo data={panorama} verPanico={canViewPanic({ role, capabilities: caps })} />
        </section>
      ) : null}

      {panorama ? null : (
        <DashboardClient
          flags={flags}
          initialData={initialData}
          userName={name}
          tenantName={tenant?.name ?? "CapitalBus"}
        />
      )}
    </div>
  );
}
