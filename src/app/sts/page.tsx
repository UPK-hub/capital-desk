import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function pct(num: number, den: number) {
  if (!den) return "0%";
  return `${Math.round((num / den) * 100)}%`;
}

export default async function StsDashboardPage() {
  const session = await getServerSession(authOptions);
  const tenantId = (session?.user as any)?.tenantId as string;
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [openCounts, closedCounts, breaches, kpiPolicies] = await Promise.all([
    prisma.stsTicket.groupBy({
      by: ["status"],
      where: { tenantId },
      _count: { _all: true },
    }),
    prisma.stsTicket.count({
      where: { tenantId, closedAt: { gte: since } },
    }),
    prisma.stsTicket.findMany({
      where: { tenantId, OR: [{ breachResponse: true }, { breachResolution: true }] },
      include: { component: true },
      orderBy: { openedAt: "desc" },
      take: 5,
    }),
    prisma.stsKpiPolicy.findMany({
      where: { tenantId },
      include: { component: true },
    }),
  ]);

  const statusMap = new Map(openCounts.map((c) => [c.status, c._count._all]));

  const responseBreaches = await prisma.stsTicket.count({
    where: { tenantId, closedAt: { gte: since }, breachResponse: true },
  });
  const resolutionBreaches = await prisma.stsTicket.count({
    where: { tenantId, closedAt: { gte: since }, breachResolution: true },
  });

  const responseCompliance = pct(closedCounts - responseBreaches, closedCounts);
  const resolutionCompliance = pct(closedCounts - resolutionBreaches, closedCounts);

  const latestMeasurements = await prisma.stsKpiMeasurement.findMany({
    where: {
      tenantId,
      OR: kpiPolicies.map((p) => ({
        componentId: p.componentId,
        metric: p.metric,
        periodicity: p.periodicity,
      })),
    },
    orderBy: { periodStart: "desc" },
    take: 100,
  });

  const measurementMap = new Map<string, typeof latestMeasurements[0]>();
  for (const m of latestMeasurements) {
    const key = `${m.componentId}:${m.metric}:${m.periodicity}`;
    if (!measurementMap.has(key)) measurementMap.set(key, m);
  }

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard STS</h1>
          <p className="text-sm text-muted-foreground">Resumen mensual de SLA y KPIs.</p>
        </div>
        <Link className="underline text-sm" href="/sts/tickets">
          Ver tickets
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-muted-foreground">Tickets abiertos</p>
          <p className="mt-2 text-2xl font-semibold">{statusMap.get("OPEN") ?? 0}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-muted-foreground">En progreso</p>
          <p className="mt-2 text-2xl font-semibold">{statusMap.get("IN_PROGRESS") ?? 0}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-muted-foreground">SLA respuesta (30 dias)</p>
          <p className="mt-2 text-2xl font-semibold">{responseCompliance}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-muted-foreground">SLA resolucion (30 dias)</p>
          <p className="mt-2 text-2xl font-semibold">{resolutionCompliance}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold">Breaches recientes</h2>
          <div className="mt-3 space-y-2">
            {breaches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay incumplimientos recientes.</p>
            ) : (
              breaches.map((t) => (
                <div key={t.id} className="rounded-lg border p-3">
                  <p className="text-sm font-medium">{t.component.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.severity} | {t.status} | {t.openedAt.toLocaleString("es-CO")}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold">KPIs (ultimo valor)</h2>
          <div className="mt-3 space-y-2">
            {kpiPolicies.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay politicas KPI configuradas.</p>
            ) : (
              kpiPolicies.map((p) => {
                const key = `${p.componentId}:${p.metric}:${p.periodicity}`;
                const m = measurementMap.get(key);
                return (
                  <div key={p.id} className="rounded-lg border p-3">
                    <p className="text-sm font-medium">
                      {p.component.name} | {p.metric} ({p.periodicity})
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Umbral: {Number(p.threshold).toFixed(2)}% | Valor: {m ? Number(m.value).toFixed(2) : "-"}%
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
