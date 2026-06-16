export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Role } from "@prisma/client";
import { buildBusesReport } from "@/lib/buses-report";
import { utils, write } from "xlsx";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const role = (session.user as any).role as Role;
  if (![Role.ADMIN, Role.BACKOFFICE, Role.SUPERVISOR].includes(role)) {
    return new Response("Forbidden", { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year")) || new Date().getFullYear();
  const month = Number(searchParams.get("month")) || 0;

  const report = await buildBusesReport({ tenantId, year, month });

  const periodo = month ? `${MESES[month - 1]} ${year}` : `Año ${year}`;
  const resumen = [
    { Indicador: "Período", Valor: periodo },
    { Indicador: "Preventivos", Valor: report.kpis.prev },
    { Indicador: "Correctivos", Valor: report.kpis.corr },
    { Indicador: "Solicitudes de video", Valor: report.kpis.video },
    { Indicador: "OTs", Valor: report.kpis.ot },
  ];
  const porMes = report.months.map((m) => ({
    Mes: m.label,
    Preventivos: m.prev,
    Correctivos: m.corr,
    "Solicitudes video": m.video,
    OT: m.ot,
  }));
  const porBus = report.buses.map((b) => ({
    Bus: b.code,
    Placa: b.plate ?? "",
    Preventivos: b.prev,
    Correctivos: b.corr,
    "Solicitudes video": b.video,
    OT: b.ot,
    Total: b.total,
  }));

  const wb = utils.book_new();
  utils.book_append_sheet(wb, utils.json_to_sheet(resumen), "Resumen");
  utils.book_append_sheet(wb, utils.json_to_sheet(porMes), "Por mes");
  utils.book_append_sheet(wb, utils.json_to_sheet(porBus.length ? porBus : [{ Bus: "Sin datos" }]), "Por bus");

  const buffer = write(wb, { type: "buffer", bookType: "xlsx" });
  const fileTag = month ? `${year}-${String(month).padStart(2, "0")}` : `${year}`;
  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=reporte-buses-${fileTag}.xlsx`,
    },
  });
}
