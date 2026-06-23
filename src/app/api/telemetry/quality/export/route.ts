export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import ExcelJS from "exceljs";
import { authOptions } from "@/lib/auth";
import { buildTramaQuality } from "@/lib/telemetry/quality";
import { parseQualityRange } from "@/lib/telemetry/quality-params";

function fmt(d: Date | null) {
  return d ? new Date(d).toLocaleString("es-CO") : "";
}

function dateTag(d: Date) {
  return new Date(d).toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const tenantId = (session.user as any).tenantId as string;
  const { start, end, busId } = parseQualityRange(req);
  const data = await buildTramaQuality({ tenantId, start, end, busId, limit: 10000 });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Capital Desk";
  wb.created = new Date();

  const resumen = wb.addWorksheet("Resumen");
  resumen.columns = [
    { header: "Indicador", key: "k", width: 38 },
    { header: "Valor", key: "v", width: 28 },
  ];
  resumen.getRow(1).font = { bold: true };
  resumen.addRows([
    { k: "Rango (desde)", v: fmt(start) },
    { k: "Rango (hasta)", v: fmt(end) },
    { k: "Filtro por bus", v: busId ? busId : "Toda la flota" },
    { k: "Tramas retransmitidas", v: data.counts.retransmittedTotal },
    { k: "Grupos duplicados (mismo idRegistro)", v: data.counts.duplicatedGroups },
    { k: "Tramas duplicadas adicionales", v: data.counts.duplicatedExtraRows },
  ]);

  const s1 = wb.addWorksheet("Retransmitidas");
  s1.columns = [
    { header: "Bus", key: "busCode", width: 14 },
    { header: "idRegistro", key: "idRegistro", width: 28 },
    { header: "Tipo trama", key: "tramaType", width: 12 },
    { header: "Clase", key: "kind", width: 14 },
    { header: "Fecha lectura", key: "eventAt", width: 22 },
    { header: "Recibido", key: "receivedAt", width: 22 },
  ];
  s1.getRow(1).font = { bold: true };
  data.retransmitted.forEach((r) =>
    s1.addRow({
      busCode: r.busCode,
      idRegistro: r.idRegistro ?? "",
      tramaType: r.tramaType ?? "",
      kind: r.kind,
      eventAt: fmt(r.eventAt),
      receivedAt: fmt(r.receivedAt),
    })
  );

  const s2 = wb.addWorksheet("Duplicadas");
  s2.columns = [
    { header: "Bus", key: "busCode", width: 14 },
    { header: "Fecha/hora lectura", key: "lecturaAt", width: 24 },
    { header: "Tipo trama", key: "tramaType", width: 12 },
    { header: "Repeticiones", key: "count", width: 14 },
    { header: "Primera recepción", key: "firstReceived", width: 22 },
    { header: "Última recepción", key: "lastReceived", width: 22 },
  ];
  s2.getRow(1).font = { bold: true };
  data.duplicated.forEach((r) =>
    s2.addRow({
      busCode: r.busCode ?? "",
      lecturaAt: r.lecturaAt,
      tramaType: r.tramaType ?? "",
      count: r.count,
      firstReceived: fmt(r.firstReceived),
      lastReceived: fmt(r.lastReceived),
    })
  );

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `calidad-tramas_${dateTag(start)}_a_${dateTag(end)}.xlsx`;
  return new Response(buffer as any, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
