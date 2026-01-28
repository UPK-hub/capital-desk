export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, StsTelemetryKind } from "@prisma/client";
import { canStsRead } from "@/lib/sts/access";
import * as XLSX from "xlsx";

function rowsFromPayload(payload: any) {
  if (payload && Array.isArray(payload.rows)) {
    return payload.rows as Array<Array<unknown>>;
  }
  return [];
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = session.user.role as Role;
  const caps = (session.user as any).capabilities as string[] | undefined;
  if (!canStsRead(role, caps)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const tenantId = (session.user as any).tenantId as string;
  const entries = await prisma.stsTelemetryEntry.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });

  const latestByKind = new Map<StsTelemetryKind, typeof entries[number]>();
  for (const entry of entries) {
    if (!latestByKind.has(entry.kind)) {
      latestByKind.set(entry.kind, entry);
    }
  }

  const wb = XLSX.utils.book_new();
  const tramas = latestByKind.get(StsTelemetryKind.TRAMAS);
  const alarmas = latestByKind.get(StsTelemetryKind.ALARMAS);
  const panic = latestByKind.get(StsTelemetryKind.PANIC);
  const eventos = latestByKind.get(StsTelemetryKind.EVENTOS);

  if (tramas) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rowsFromPayload(tramas.payload)), "Tramas");
  }
  if (alarmas) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rowsFromPayload(alarmas.payload)), "Alarmas");
  }
  if (panic) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rowsFromPayload(panic.payload)), "Boton_panico");
  }
  if (eventos) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rowsFromPayload(eventos.payload)), "Eventos");
  }

  if (wb.SheetNames.length === 0) {
    return NextResponse.json({ error: "No hay telemetría cargada" }, { status: 404 });
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=\"sts_telemetria_cargada.xlsx\"",
    },
  });
}
