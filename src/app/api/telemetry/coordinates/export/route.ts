export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import ExcelJS from "exceljs";
import { authOptions } from "@/lib/auth";
import { getCoordinateQuality } from "@/lib/telemetry/coordinates";

const REP = 50;

function dateTag(d: Date) {
  return new Date(d).toISOString().slice(0, 10);
}

function estado(r: { ceroCount: number; maxRep: number }) {
  if (r.ceroCount > 0) return "En 0";
  if (r.maxRep >= REP) return "Coordenada repetida";
  return "OK";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const tenantId = (session.user as any).tenantId as string;
  const rows = await getCoordinateQuality(tenantId);

  const cero = rows.filter((r) => r.ceroCount > 0).length;
  const repetida = rows.filter((r) => r.ceroCount === 0 && r.maxRep >= REP).length;
  const ok = rows.length - cero - repetida;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Capital Desk";
  wb.created = new Date();

  const resumen = wb.addWorksheet("Resumen");
  resumen.columns = [
    { header: "Indicador", key: "k", width: 36 },
    { header: "Valor", key: "v", width: 22 },
  ];
  resumen.getRow(1).font = { bold: true };
  resumen.addRows([
    { k: "Generado", v: new Date().toLocaleString("es-CO") },
    { k: "Buses con GPS hoy", v: rows.length },
    { k: "OK (moviéndose)", v: ok },
    { k: `Coordenada repetida (>= ${REP} veces)`, v: repetida },
    { k: "En 0 (0,0)", v: cero },
  ]);

  const det = wb.addWorksheet("Detalle");
  det.columns = [
    { header: "Bus", key: "busCode", width: 14 },
    { header: "Placa", key: "plate", width: 14 },
    { header: "Coord. frecuente - lat", key: "lat", width: 18 },
    { header: "Coord. frecuente - lon", key: "lon", width: 18 },
    { header: "Máx repetida", key: "maxRep", width: 14 },
    { header: "Coords distintas", key: "distintas", width: 16 },
    { header: "Tramas GPS hoy", key: "total", width: 16 },
    { header: "Tramas en 0,0", key: "ceroCount", width: 14 },
    { header: "Estado", key: "estado", width: 22 },
  ];
  det.getRow(1).font = { bold: true };
  rows.forEach((r) =>
    det.addRow({
      busCode: r.busCode,
      plate: r.plate ?? "",
      lat: r.topLat ?? "",
      lon: r.topLon ?? "",
      maxRep: r.maxRep,
      distintas: r.distintas,
      total: r.total,
      ceroCount: r.ceroCount,
      estado: estado(r),
    })
  );

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `coordenadas_${dateTag(new Date())}.xlsx`;
  return new Response(buffer as any, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
