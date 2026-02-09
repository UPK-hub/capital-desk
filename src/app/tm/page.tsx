import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { buildTmReport } from "@/lib/tm-report";
import TmDashboard from "./ui/TmDashboard";
import { StsTicketSeverity } from "@prisma/client";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function formatInputDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function TmPage({
  searchParams,
}: {
  searchParams?: { range?: string; start?: string; end?: string; busId?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const role = session.user.role;
  if (role !== "ADMIN" && role !== "BACKOFFICE") redirect("/");

  const tenantId = (session.user as any).tenantId as string;
  const now = new Date();

  const range = Number(searchParams?.range ?? 30);
  const safeRange = [7, 30, 90].includes(range) ? range : 30;

  let start = startOfDay(new Date(now.getTime() - safeRange * 24 * 60 * 60 * 1000));
  let end = endOfDay(now);

  if (searchParams?.start && searchParams?.end) {
    const s = new Date(`${searchParams.start}T00:00:00`);
    const e = new Date(`${searchParams.end}T23:59:59`);
    if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime())) {
      start = startOfDay(s);
      end = endOfDay(e);
    }
  }

  const busId = searchParams?.busId ?? null;
  const bus =
    busId
      ? await prisma.bus.findFirst({
          where: { id: busId, tenantId },
          select: { id: true, code: true, plate: true },
        })
      : null;

  const report = await buildTmReport({ tenantId, start, end, busId });

  const severityLabels: Record<StsTicketSeverity, string> = {
    EMERGENCY: "Emergencia",
    HIGH: "Alta",
    MEDIUM: "Media",
    LOW: "Baja",
  };

  return (
    <TmDashboard
      range={{ start: formatInputDate(start), end: formatInputDate(end), rangeDays: safeRange }}
      totals={report.totals}
      severityLabels={report.severityOrder.map((s) => severityLabels[s])}
      severityCounts={report.severityCounts}
      componentSeverityRows={report.componentSeverityRows}
      metricSummary={report.metricSummary}
      kpiRows={report.kpiRows.map((row) => ({
        ...row,
        periodStart: row.periodStart.toISOString().slice(0, 10),
      }))}
      selectedBus={bus}
    />
  );
}
