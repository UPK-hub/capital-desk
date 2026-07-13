export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { CAPABILITIES } from "@/lib/capabilities";
import { asDateInput, normalizeRvrChecklist, parseDateInput } from "@/lib/rvr";
import { loadRvrObservationCatalogByCode } from "@/lib/rvr-observation-catalog";
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

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = (session.user as any).role as Role;
  const capabilities = (session.user as any).capabilities as string[] | undefined;
  if (!isRvrAllowed(role, capabilities)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const date =
    parseDateInput(req.nextUrl.searchParams.get("date")) ??
    parseDateInput(asDateInput(new Date()));
  if (!date) {
    return NextResponse.json({ error: "Fecha inválida." }, { status: 400 });
  }

  const format = String(req.nextUrl.searchParams.get("format") ?? "xlsx")
    .trim()
    .toLowerCase();

  const review = await prisma.remoteVisualReview.findUnique({
    where: {
      tenantId_reviewDate: {
        tenantId,
        reviewDate: date,
      },
    },
    include: {
      buses: {
        orderBy: { busCode: "asc" },
      },
    },
  });

  if (!review) {
    return NextResponse.json({ error: "No hay revisión RVR para esa fecha." }, { status: 404 });
  }

  const observationByCode = await loadRvrObservationCatalogByCode();
  const rows: Record<string, unknown>[] = [];
  const dateToken = asDateInput(review.reviewDate);

  for (const busReview of review.buses) {
    const checklist = normalizeRvrChecklist(busReview.checklist);
    const failedRows = checklist.filter((row) => row.complies === "N");

    if (failedRows.length === 0 && !busReview.requiresCorrective) continue;

    if (failedRows.length === 0) {
      rows.push({
        fecha_rvr: dateToken,
        bus: busReview.busCode,
        placa: busReview.busPlate ?? "",
        ip_nvr: busReview.nvrIp ?? "",
        camara: "",
        codigo_rvr: "",
        resultado: "",
        categoria: "",
        motivo: "",
        observacion: String(busReview.relevantFindings ?? "").trim(),
        accion_sugerida: "",
        estado_siguiente_sugerido: "",
        requiere_correctivo: busReview.requiresCorrective ? "S" : "N",
        ticket_upk: busReview.ticketUpk ?? "",
        ot_capitalbus: busReview.capitalbusOt ?? "",
        caso_correctivo: busReview.correctiveCaseNo ?? "",
        ot_correctiva: busReview.correctiveWorkOrderNo ?? "",
      });
      continue;
    }

    for (const item of failedRows) {
      const code = String(item.observationCode ?? "").trim().toUpperCase();
      const meta = code ? observationByCode.get(code) : undefined;
      rows.push({
        fecha_rvr: dateToken,
        bus: busReview.busCode,
        placa: busReview.busPlate ?? "",
        ip_nvr: busReview.nvrIp ?? "",
        camara: item.camera,
        codigo_rvr: code,
        resultado: meta?.result ?? "",
        categoria: meta?.category ?? "",
        motivo: meta?.reason ?? "",
        observacion: item.observation ?? "",
        accion_sugerida: meta?.suggestedAction ?? "",
        estado_siguiente_sugerido: meta?.nextStatus ?? "",
        requiere_correctivo: busReview.requiresCorrective ? "S" : "N",
        ticket_upk: busReview.ticketUpk ?? "",
        ot_capitalbus: busReview.capitalbusOt ?? "",
        caso_correctivo: busReview.correctiveCaseNo ?? "",
        ot_correctiva: busReview.correctiveWorkOrderNo ?? "",
      });
    }
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No hay novedades RVR para exportar en la fecha seleccionada." },
      { status: 404 }
    );
  }

  const fileDate = dateToken.replace(/-/g, "");
  if (format === "csv") {
    const csv = toCsv(rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="rvr_novedades_${fileDate}.csv"`,
      },
    });
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "novedades_rvr");
  const xlsxBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(xlsxBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="rvr_novedades_${fileDate}.xlsx"`,
    },
  });
}
