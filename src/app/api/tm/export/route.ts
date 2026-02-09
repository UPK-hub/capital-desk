export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildTmReport } from "@/lib/tm-report";
import { utils, write } from "xlsx";

function parseDate(value?: string | null) {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const role = session.user.role;
  if (role !== "ADMIN" && role !== "BACKOFFICE") return new Response("Forbidden", { status: 403 });

  const tenantId = (session.user as any).tenantId as string;
  const { searchParams } = new URL(req.url);
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");
  const busId = searchParams.get("busId");

  const now = new Date();
  const start = parseDate(startParam) ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const end = parseDate(endParam) ?? now;

  const report = await buildTmReport({ tenantId, start, end, busId });

  const summarySheet = utils.json_to_sheet([
    {
      "Tickets totales": report.totals.totalTickets,
      "Tickets abiertos": report.totals.openTickets,
      "Tickets cerrados": report.totals.closedTickets,
      "SLA respuesta %": report.totals.responseCompliance,
      "SLA resolución %": report.totals.resolutionCompliance,
      "Breaches respuesta": report.totals.responseBreaches,
      "Breaches resolución": report.totals.resolutionBreaches,
      "Promedio respuesta (min)": report.totals.avgResponseMinutes,
      "Promedio resolución (min)": report.totals.avgResolutionMinutes,
    },
  ]);

  const slaSheet = utils.json_to_sheet(report.componentSeverityRows);
  const kpiSheet = utils.json_to_sheet(
    report.kpiRows.map((row) => ({
      ...row,
      periodStart: row.periodStart.toISOString().slice(0, 10),
    }))
  );

  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, summarySheet, "Resumen");
  utils.book_append_sheet(workbook, slaSheet, "SLA_Componentes");
  utils.book_append_sheet(workbook, kpiSheet, "KPIs");

  const buffer = write(workbook, { type: "buffer", bookType: "xlsx" });
  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=tm-report.xlsx",
    },
  });
}
