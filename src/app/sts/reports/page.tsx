import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { StsKpiMetric, StsKpiPeriodicity } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function pct(num: number, den: number) {
  if (!den) return "0%";
  return `${Math.round((num / den) * 100)}%`;
}

export default async function StsReportsPage() {
  const session = await getServerSession(authOptions);
  const tenantId = (session?.user as any)?.tenantId as string;
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const tickets = await prisma.stsTicket.findMany({
    where: { tenantId, closedAt: { gte: since } },
    include: { component: true },
  });

  const byComponentSeverity = new Map<string, { total: number; responseBreaches: number; resolutionBreaches: number }>();
  for (const t of tickets) {
    const key = `${t.component.name}|${t.severity}`;
    const row = byComponentSeverity.get(key) ?? { total: 0, responseBreaches: 0, resolutionBreaches: 0 };
    row.total += 1;
    if (t.breachResponse) row.responseBreaches += 1;
    if (t.breachResolution) row.resolutionBreaches += 1;
    byComponentSeverity.set(key, row);
  }

  const weeklyAvailability = await prisma.stsKpiMeasurement.findMany({
    where: { tenantId, metric: StsKpiMetric.AVAILABILITY, periodicity: StsKpiPeriodicity.WEEKLY },
    orderBy: { periodStart: "desc" },
    take: 20,
    include: { component: true },
  });

  const dailyKpis = await prisma.stsKpiMeasurement.findMany({
    where: {
      tenantId,
      metric: { in: [StsKpiMetric.TRANSMISSION, StsKpiMetric.DATA_CAPTURE, StsKpiMetric.RECORDING] },
      periodicity: StsKpiPeriodicity.DAILY,
    },
    orderBy: { periodStart: "desc" },
    take: 50,
    include: { component: true },
  });

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Reportes STS</h1>
          <p className="text-sm text-muted-foreground">Cumplimiento SLA y KPIs.</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link className="underline" href="/api/sts/reports/tickets">
            Exportar CSV
          </Link>
          <Link className="underline" href="/api/sts/reports/tickets?format=xlsx">
            Exportar Excel
          </Link>
        </div>
      </div>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">Cumplimiento SLA por componente y severidad (30 dias)</h2>
        <div className="mt-3 overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50">
              <tr>
                <th className="text-left p-2">Componente</th>
                <th className="text-left p-2">Severidad</th>
                <th className="text-left p-2">Cumpl. respuesta</th>
                <th className="text-left p-2">Cumpl. resolucion</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(byComponentSeverity.entries()).map(([key, row]) => {
                const [component, severity] = key.split("|");
                return (
                  <tr key={key} className="border-t">
                    <td className="p-2">{component}</td>
                    <td className="p-2">{severity}</td>
                    <td className="p-2">{pct(row.total - row.responseBreaches, row.total)}</td>
                    <td className="p-2">{pct(row.total - row.resolutionBreaches, row.total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">Disponibilidad semanal</h2>
        <div className="mt-3 overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50">
              <tr>
                <th className="text-left p-2">Componente</th>
                <th className="text-left p-2">Semana</th>
                <th className="text-left p-2">Valor</th>
              </tr>
            </thead>
            <tbody>
              {weeklyAvailability.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="p-2">{m.component.name}</td>
                  <td className="p-2">{m.periodStart.toLocaleDateString("es-CO")}</td>
                  <td className="p-2">{Number(m.value).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">KPIs diarios (transmision, captura, grabacion)</h2>
        <div className="mt-3 overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50">
              <tr>
                <th className="text-left p-2">Componente</th>
                <th className="text-left p-2">KPI</th>
                <th className="text-left p-2">Fecha</th>
                <th className="text-left p-2">Valor</th>
              </tr>
            </thead>
            <tbody>
              {dailyKpis.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="p-2">{m.component.name}</td>
                  <td className="p-2">{m.metric}</td>
                  <td className="p-2">{m.periodStart.toLocaleDateString("es-CO")}</td>
                  <td className="p-2">{Number(m.value).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
