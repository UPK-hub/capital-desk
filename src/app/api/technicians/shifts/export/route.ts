export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import * as XLSX from "xlsx";
import { shiftDurationMinutes } from "@/lib/technician-schedule";

function fmtDate(d: Date | null) {
  if (!d) return "";
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function hoursDiff(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  return Math.max(0, ms / (1000 * 60 * 60));
}

function fmtHours(v: number | null) {
  return v === null ? "" : v.toFixed(2);
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const role = (session.user as any).role as Role;

  if (![Role.ADMIN, Role.BACKOFFICE, Role.SUPERVISOR].includes(role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const where: any = { tenantId };
  if (from || to) {
    where.startedAt = {};
    if (from) where.startedAt.gte = new Date(from);
    if (to) where.startedAt.lte = new Date(to);
  }

  const logs = await prisma.technicianShiftLog.findMany({
    where,
    orderBy: { startedAt: "desc" },
    include: {
      user: {
        select: {
          name: true,
          email: true,
          technicianSchedule: { select: { shiftType: true } },
        },
      },
    },
  });

  const rows = logs.map((log) => {
    const shiftType = log.user.technicianSchedule?.shiftType ?? null;
    const expected = shiftType ? shiftDurationMinutes(shiftType) / 60 : null;
    const worked = log.endedAt ? hoursDiff(log.startedAt, log.endedAt) : null;
    const overtime = worked !== null && expected !== null ? Math.max(0, worked - expected) : null;

    return {
      Tecnico: log.user.name,
      Email: log.user.email ?? "",
      TurnoAsignado: shiftType ?? "Sin asignar",
      Inicio: fmtDate(log.startedAt),
      Salida: fmtDate(log.endedAt),
      HorasTrabajadas: fmtHours(worked),
      HorasExtra: fmtHours(overtime),
    };
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Turnos");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const filename = "turnos-tecnicos.xlsx";

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
