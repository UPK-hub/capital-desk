export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import ExcelJS from "exceljs";
import { Role } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { CAPABILITIES } from "@/lib/capabilities";
import { formatFechaCO, formatFechaHoraCO } from "@/lib/datetime";
import { recentMonths } from "@/lib/cases/summary";
import {
  ESTADO_LABEL,
  getDetalleFlota,
  JORNADA_CORTE_HORA,
  type EstadoBus,
  type FilaFlota,
} from "@/lib/dashboard/panorama";

const AZUL = "FF1B3A7A";
const GRIS_SUAVE = "FFF1F5FA";
const COLOR_ESTADO: Record<EstadoBus, string> = {
  AL_DIA: "FFE7F6EC",
  PENDIENTE: "FFFDF3E2",
  CORRECTIVO: "FFFDECEC",
  SIN_REPORTE: "FFEFF2F7",
};

const GRUPOS: Record<string, EstadoBus | "TODOS"> = {
  TODOS: "TODOS",
  AL_DIA: "AL_DIA",
  PENDIENTE: "PENDIENTE",
  CORRECTIVO: "CORRECTIVO",
  SIN_REPORTE: "SIN_REPORTE",
};

function encabezado(hoja: ExcelJS.Worksheet, fila = 1) {
  const r = hoja.getRow(fila);
  r.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  r.alignment = { vertical: "middle" };
  r.height = 22;
  r.eachCell((celda) => {
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    celda.border = { bottom: { style: "thin", color: { argb: "FFD8E0EC" } } };
  });
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = (session.user as any).role as Role;
  const caps = (session.user as any).capabilities as string[] | undefined;
  const tenantId = (session.user as any).tenantId as string;
  const soloVideos = role === Role.BACKOFFICE && caps?.includes(CAPABILITIES.VIDEOS_ONLY);
  if ((role !== Role.ADMIN && role !== Role.BACKOFFICE) || soloVideos) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const meses = recentMonths(1);
  const mesKey = req.nextUrl.searchParams.get("mes") || meses[0].key;
  const grupoParam = (req.nextUrl.searchParams.get("grupo") || "TODOS").toUpperCase();
  const grupo = GRUPOS[grupoParam] ?? "TODOS";

  const { filas, mesInicio, mesFin } = await getDetalleFlota({ tenantId, monthKey: mesKey });
  const seleccion = grupo === "TODOS" ? filas : filas.filter((f) => f.estado === grupo);

  const cuenta = (e: EstadoBus) => filas.filter((f) => f.estado === e).length;
  const conPreventivo = filas.filter((f) => f.preventivoMesAt).length;
  const etiquetaMes =
    meses.find((m) => m.key === mesKey)?.label ??
    `${mesKey}`;
  const etiquetaGrupo = grupo === "TODOS" ? "Toda la flota" : ESTADO_LABEL[grupo];

  const wb = new ExcelJS.Workbook();
  wb.creator = "Capital Desk · UP KEEP SERVICES";
  wb.created = new Date();

  // ------------------------------------------------------------- Resumen
  const resumen = wb.addWorksheet("Resumen", {
    views: [{ showGridLines: false }],
  });
  resumen.columns = [
    { key: "k", width: 42 },
    { key: "v", width: 26 },
  ];
  resumen.mergeCells("A1:B1");
  const titulo = resumen.getCell("A1");
  titulo.value = "Estado de la flota · CapitalBus";
  titulo.font = { bold: true, size: 16, color: { argb: "FF0D1626" } };
  resumen.getRow(1).height = 26;
  resumen.mergeCells("A2:B2");
  const sub = resumen.getCell("A2");
  sub.value = `${etiquetaGrupo} · ${etiquetaMes}`;
  sub.font = { size: 11, color: { argb: "FF5B6B86" } };

  resumen.addRow([]);
  const filasResumen: [string, string | number][] = [
    ["Generado", formatFechaHoraCO(new Date())],
    ["Mes analizado", etiquetaMes],
    ["Jornada considerada", `desde ${formatFechaCO(mesInicio)} ${String(JORNADA_CORTE_HORA).padStart(2, "0")}:00 hasta ${formatFechaCO(mesFin)} ${String(JORNADA_CORTE_HORA).padStart(2, "0")}:00`],
    ["Buses activos en la flota", filas.length],
    ["Con preventivo del mes", conPreventivo],
    ["Cumplimiento", filas.length ? `${Math.round((conPreventivo / filas.length) * 100)}%` : "—"],
    ["", ""],
    [ESTADO_LABEL.AL_DIA, cuenta("AL_DIA")],
    [ESTADO_LABEL.PENDIENTE, cuenta("PENDIENTE")],
    [ESTADO_LABEL.CORRECTIVO, cuenta("CORRECTIVO")],
    [ESTADO_LABEL.SIN_REPORTE, cuenta("SIN_REPORTE")],
    ["", ""],
    ["Buses incluidos en este archivo", seleccion.length],
  ];
  filasResumen.forEach(([k, v]) => {
    const fila = resumen.addRow({ k, v });
    if (k) {
      fila.getCell("k").font = { color: { argb: "FF5B6B86" }, size: 11 };
      fila.getCell("v").font = { bold: true, size: 11, color: { argb: "FF0D1626" } };
      fila.getCell("v").alignment = { horizontal: "left" };
    }
  });
  resumen.addRow([]);
  const nota = resumen.addRow({
    k: "El muro de flota pinta una sola condición por bus, la más crítica. Un bus con preventivo del mes y una alerta activa aparece en la categoría de la alerta, pero el cumplimiento sí lo cuenta.",
  });
  nota.getCell("k").font = { italic: true, size: 10, color: { argb: "FF8A99B3" } };
  nota.getCell("k").alignment = { wrapText: true, vertical: "top" };
  resumen.mergeCells(`A${nota.number}:B${nota.number}`);
  nota.height = 42;

  // -------------------------------------------------------------- Buses
  const hoja = wb.addWorksheet("Buses", { views: [{ state: "frozen", ySplit: 1 }] });
  hoja.columns = [
    { header: "Bus", key: "code", width: 12 },
    { header: "Placa", key: "plate", width: 12 },
    { header: "Estado", key: "estado", width: 30 },
    { header: "Preventivo del mes", key: "prevMes", width: 20 },
    { header: "Preventivos en el mes", key: "prevCount", width: 20 },
    { header: "Último preventivo", key: "ultimoPrev", width: 20 },
    { header: "Días desde el último", key: "diasPrev", width: 20 },
    { header: "Correctivos abiertos", key: "correctivos", width: 20 },
    { header: "Casos abiertos", key: "casos", width: 16 },
    { header: "Último reporte de telemetría", key: "reporte", width: 28 },
    { header: "Días sin reportar", key: "diasRep", width: 18 },
  ];
  encabezado(hoja);

  seleccion.forEach((f: FilaFlota, i) => {
    const fila = hoja.addRow({
      code: f.code,
      plate: f.plate ?? "",
      estado: f.estadoLabel,
      prevMes: f.preventivoMesAt ? formatFechaCO(f.preventivoMesAt) : "Sin preventivo",
      prevCount: f.preventivosEnElMes,
      ultimoPrev: f.ultimoPreventivoAt ? formatFechaCO(f.ultimoPreventivoAt) : "Sin registro",
      diasPrev: f.diasDesdePreventivo ?? "",
      correctivos: f.correctivosAbiertos,
      casos: f.casosAbiertos,
      reporte: f.ultimoReporte ? formatFechaCO(f.ultimoReporte) : "Sin telemetría",
      diasRep: f.diasSinReportar ?? "",
    });
    fila.getCell("code").font = { bold: true };
    fila.getCell("estado").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLOR_ESTADO[f.estado] },
    };
    if (i % 2 === 1) {
      fila.eachCell((celda, col) => {
        if (col !== 3) {
          celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS_SUAVE } };
        }
      });
    }
    ["prevCount", "diasPrev", "correctivos", "casos", "diasRep"].forEach((k) => {
      fila.getCell(k).alignment = { horizontal: "center" };
    });
  });

  hoja.autoFilter = { from: "A1", to: { row: 1, column: hoja.columnCount } };

  if (!seleccion.length) {
    const vacio = hoja.addRow({ code: "", estado: "No hay buses en esta categoría." });
    vacio.getCell("estado").font = { italic: true, color: { argb: "FF8A99B3" } };
  }

  const buffer = await wb.xlsx.writeBuffer();
  const nombre = `Flota_${grupo.toLowerCase()}_${mesKey}.xlsx`;
  return new NextResponse(buffer as any, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
