export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Role } from "@prisma/client";
import { CAPABILITIES } from "@/lib/capabilities";
import { asDateInput } from "@/lib/rvr";
import { getRvrQueues } from "@/lib/rvr/priority";
import * as XLSX from "xlsx";

function isRvrAllowed(role: Role, capabilities: string[] | undefined) {
  if (role === Role.ADMIN || role === Role.SUPERVISOR) return true;
  if (role === Role.BACKOFFICE) {
    return !capabilities?.includes(CAPABILITIES.VIDEOS_ONLY);
  }
  return false;
}

function toCsv(rows: Record<string, any>[]) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const text = String(value ?? "");
    if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
      return `"${text.replace(/"/g, "\"\"")}"`;
    }
    return text;
  };
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(",")),
  ].join("\n");
}

// Exportable (xlsx/csv) de la cola "Prioridad de correctivo" del RVR: los buses
// con falla técnica en orden de importancia (no reporta, odómetro 0, coords 0).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as Role;
  const capabilities = (session.user as any).capabilities as string[] | undefined;
  if (!isRvrAllowed(role, capabilities)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const format = String(req.nextUrl.searchParams.get("format") ?? "xlsx").trim().toLowerCase();

  const { corrective } = await getRvrQueues(tenantId);

  const rows = corrective.map((item) => ({
    prioridad: item.rank,
    bus: item.busCode,
    placa: item.busPlate ?? "",
    motivo: item.reasonLabel,
    detalle: item.detail ?? "",
    novedad_abierta: item.hasOpenNovedad ? "S" : "N",
    ultimo_preventivo: item.lastPreventiveAt ? item.lastPreventiveAt.slice(0, 10) : "",
    ultima_revision: item.lastReviewedAt ? item.lastReviewedAt.slice(0, 10) : "",
  }));

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No hay buses en la prioridad de correctivo para exportar." },
      { status: 404 }
    );
  }

  const fileDate = asDateInput(new Date()).replace(/-/g, "");
  if (format === "csv") {
    const csv = toCsv(rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="rvr_prioridad_correctivo_${fileDate}.csv"`,
      },
    });
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "prioridad_correctivo");
  const xlsxBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(xlsxBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="rvr_prioridad_correctivo_${fileDate}.xlsx"`,
    },
  });
}
