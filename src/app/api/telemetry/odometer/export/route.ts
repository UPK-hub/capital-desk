export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import ExcelJS from "exceljs";
import { authOptions } from "@/lib/auth";
import { getLatestOdometer } from "@/lib/telemetry/odometer";

function fmt(d: Date | null) {
  return d ? new Date(d).toLocaleString("es-CO") : "";
}

function dateTag(d: Date) {
  return new Date(d).toISOString().slice(0, 10);
}

function kmNum(v: string | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function estado(km: number | null): string {
  if (km == null) return "Sin reportar";
  if (km === 0) return "En 0";
  return "Con dato";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if ((session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const tenantId = (session.user as any).tenantId as string;
  const rows = await getLatestOdometer(tenantId);

  const withKm = rows.map((r) => kmNum(r.odometer)).filter((n): n is number => n != null);
  const zeros = withKm.filter((n) => n === 0).length;
  const validos = withKm.filter((n) => n > 0);
  const avg = validos.length ? Math.round(validos.reduce((a, b) => a + b, 0) / validos.length) : 0;
  const total = rows.length;
  const conDato = withKm.length;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Capital Desk";
  wb.created = new Date();

  const resumen = wb.addWorksheet("Resumen");
  resumen.columns = [
    { header: "Indicador", key: "k", width: 34 },
    { header: "Valor", key: "v", width: 22 },
  ];
  resumen.getRow(1).font = { bold: true };
  resumen.addRows([
    { k: "Generado", v: fmt(new Date()) },
    { k: "Flota (buses activos)", v: total },
    { k: "Con odómetro", v: conDato },
    { k: "Sin reportar", v: total - conDato },
    { k: "Odómetro en 0 (alerta)", v: zeros },
    { k: "Promedio km (válidos > 0)", v: avg },
  ]);

  const det = wb.addWorksheet("Detalle");
  det.columns = [
    { header: "Bus", key: "busCode", width: 14 },
    { header: "Placa", key: "plate", width: 14 },
    { header: "Último odómetro (km)", key: "km", width: 22 },
    { header: "Estado", key: "estado", width: 16 },
    { header: "Fecha lectura", key: "eventAt", width: 22 },
    { header: "Recibido", key: "receivedAt", width: 22 },
  ];
  det.getRow(1).font = { bold: true };
  rows.forEach((r) => {
    const n = kmNum(r.odometer);
    det.addRow({
      busCode: r.busCode,
      plate: r.plate ?? "",
      km: n != null ? n : "",
      estado: estado(n),
      eventAt: fmt(r.eventAt),
      receivedAt: fmt(r.receivedAt),
    });
  });

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `odometro_${dateTag(new Date())}.xlsx`;
  return new Response(buffer as any, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
