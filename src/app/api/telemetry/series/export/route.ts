export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import ExcelJS from "exceljs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSeriesCached } from "@/lib/telemetry/cache";
import { parseQualityRange } from "@/lib/telemetry/quality-params";

const NOUN: Record<string, string> = { eventos: "Eventos", alarmas: "Alarmas", periodicas: "Periódicas" };

function fmtDay(iso: string) {
  const p = String(iso).split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if ((session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const tenantId = (session.user as any).tenantId as string;

  const { start, end, busId } = parseQualityRange(req);
  const typeParam = req.nextUrl.searchParams.get("type");
  const type = typeParam === "alarmas" ? "alarmas" : typeParam === "periodicas" ? "periodicas" : "eventos";
  const code = req.nextUrl.searchParams.get("code");

  let busCode: string | null = null;
  if (busId) {
    const bus = await prisma.bus.findFirst({ where: { id: busId, tenantId }, select: { code: true } });
    busCode = bus?.code ?? null;
  }

  const data = await getSeriesCached({
    tenantId,
    type,
    startISO: start.toISOString(),
    endISO: end.toISOString(),
    busCode,
    code: code || null,
  });

  const noun = NOUN[type] ?? "Telemetría";
  const lower = noun.toLowerCase();
  const perBus = [...((data as any).perBus ?? [])].sort((a: any, b: any) => (b.total ?? 0) - (a.total ?? 0));
  const perDay: any[] = (data as any).perDay ?? [];
  const split: any[] | null = (data as any).perDaySplit ?? null;
  const totalAll = (data as any).total ?? 0;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Capital Desk";
  wb.created = new Date();

  // Hoja 1: Resumen
  const resumen = wb.addWorksheet("Resumen");
  resumen.columns = [
    { header: "Indicador", key: "k", width: 30 },
    { header: "Valor", key: "v", width: 30 },
  ];
  resumen.getRow(1).font = { bold: true };
  const avgDay = perDay.length ? Math.round(totalAll / perDay.length) : 0;
  const peak = perDay.reduce((best: any, d: any) => (!best || d.total > best.total ? d : best), null as any);
  resumen.addRows([
    { k: "Reporte", v: noun },
    { k: "Generado", v: new Date().toLocaleString("es-CO") },
    { k: "Rango", v: `${fmtDay(start.toISOString().slice(0, 10))} → ${fmtDay(end.toISOString().slice(0, 10))}` },
    { k: "Bus", v: busCode ?? "Toda la flota" },
    { k: "Filtro por tipo", v: code || "Todos" },
    { k: `Total ${lower}`, v: totalAll },
    { k: "Promedio por día", v: avgDay },
    { k: "Día pico", v: peak && peak.total > 0 ? `${fmtDay(peak.date)} (${peak.total})` : "—" },
    { k: "Buses con datos", v: perBus.length },
  ]);

  // Hoja 2: Por bus (todos)
  const sheetBus = wb.addWorksheet("Por bus");
  sheetBus.columns = [
    { header: "Bus", key: "busCode", width: 16 },
    { header: `Total ${lower}`, key: "total", width: 20 },
    { header: "% del total", key: "pct", width: 14 },
  ];
  sheetBus.getRow(1).font = { bold: true };
  perBus.forEach((r: any) => {
    sheetBus.addRow({
      busCode: r.busCode,
      total: r.total ?? 0,
      pct: totalAll > 0 ? Number((((r.total ?? 0) / totalAll) * 100).toFixed(1)) : 0,
    });
  });

  // Hoja 3: Por día
  const sheetDay = wb.addWorksheet("Por día");
  if (split) {
    sheetDay.columns = [
      { header: "Día", key: "date", width: 14 },
      { header: "P20 (cada 20 s)", key: "P20", width: 18 },
      { header: "P60 (cada 60 s)", key: "P60", width: 18 },
    ];
    sheetDay.getRow(1).font = { bold: true };
    split.forEach((d: any) => sheetDay.addRow({ date: fmtDay(d.date), P20: d.P20 ?? 0, P60: d.P60 ?? 0 }));
  } else {
    sheetDay.columns = [
      { header: "Día", key: "date", width: 14 },
      { header: `Total ${lower}`, key: "total", width: 20 },
    ];
    sheetDay.getRow(1).font = { bold: true };
    perDay.forEach((d: any) => sheetDay.addRow({ date: fmtDay(d.date), total: d.total ?? 0 }));
  }

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `telemetria_${type}_${end.toISOString().slice(0, 10)}${busCode ? `_${busCode}` : ""}${code ? `_${code}` : ""}.xlsx`;
  return new Response(buffer as any, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
