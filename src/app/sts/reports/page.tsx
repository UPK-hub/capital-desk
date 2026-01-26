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
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 fade-up">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Reportes STS</h1>
          <p className="text-sm text-muted-foreground">Cumplimiento SLA y KPIs.</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link className="sts-btn-ghost" href="/api/sts/reports/tickets">
            Exportar CSV
          </Link>
          <Link className="sts-btn-primary" href="/api/sts/reports/tickets?format=xlsx">
            Exportar Excel
          </Link>
        </div>
      </div>

      <section className="sts-card p-5 fade-up">
        <h2 className="text-base font-semibold">Cumplimiento SLA por componente y severidad (30 dias)</h2>
        <div className="mt-3 overflow-auto sts-card">
          <table className="sts-table">
            <thead>
              <tr>
                <th>Componente</th>
                <th>Severidad</th>
                <th>Cumpl. respuesta</th>
                <th>Cumpl. resolucion</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(byComponentSeverity.entries()).map(([key, row]) => {
                const [component, severity] = key.split("|");
                return (
                  <tr key={key}>
                    <td>{component}</td>
                    <td>{severity}</td>
                    <td>{pct(row.total - row.responseBreaches, row.total)}</td>
                    <td>{pct(row.total - row.resolutionBreaches, row.total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="sts-card p-5 fade-up">
        <h2 className="text-base font-semibold">Disponibilidad semanal</h2>
        <div className="mt-3 overflow-auto sts-card">
          <table className="sts-table">
            <thead>
              <tr>
                <th>Componente</th>
                <th>Semana</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {weeklyAvailability.map((m) => (
                <tr key={m.id}>
                  <td>{m.component.name}</td>
                  <td>{m.periodStart.toLocaleDateString("es-CO")}</td>
                  <td>{Number(m.value).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="sts-card p-5 fade-up">
        <h2 className="text-base font-semibold">KPIs diarios (transmision, captura, grabacion)</h2>
        <div className="mt-3 overflow-auto sts-card">
          <table className="sts-table">
            <thead>
              <tr>
                <th>Componente</th>
                <th>KPI</th>
                <th>Fecha</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {dailyKpis.map((m) => (
                <tr key={m.id}>
                  <td>{m.component.name}</td>
                  <td>{m.metric}</td>
                  <td>{m.periodStart.toLocaleDateString("es-CO")}</td>
                  <td>{Number(m.value).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
