export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { canStsRead } from "@/lib/sts/access";
import * as XLSX from "xlsx";

function toCsv(rows: Record<string, any>[]) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    const s = String(v ?? "");
    if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
      return `"${s.replace(/\"/g, "\"\"")}"`;
    }
    return s;
  };
  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ];
  return lines.join("\n");
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = session.user.role as Role;
  const caps = (session.user as any).capabilities as string[] | undefined;
  if (!canStsRead(role, caps)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const tenantId = (session.user as any).tenantId as string;
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  const items = await prisma.stsTicket.findMany({
    where: {
      tenantId,
      ...(from ? { openedAt: { gte: new Date(from) } } : {}),
      ...(to ? { openedAt: { lte: new Date(to) } } : {}),
    },
    include: { component: true, assignedTo: true },
    orderBy: { openedAt: "desc" },
  });

  const rows = items.map((t) => ({
    id: t.id,
    component: t.component.name,
    severity: t.severity,
    status: t.status,
    channel: t.channel,
    opened_at: t.openedAt.toISOString(),
    first_response_at: t.firstResponseAt ? t.firstResponseAt.toISOString() : "",
    resolved_at: t.resolvedAt ? t.resolvedAt.toISOString() : "",
    closed_at: t.closedAt ? t.closedAt.toISOString() : "",
    assigned_to: t.assignedTo?.name ?? "",
    breach_response: t.breachResponse ? "yes" : "no",
    breach_resolution: t.breachResolution ? "yes" : "no",
  }));

  const format = String(req.nextUrl.searchParams.get("format") ?? "csv").toLowerCase();
  if (format === "xlsx") {
    const sheet = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "tickets");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=\"sts_tickets.xlsx\"",
      },
    });
  }

  const csv = toCsv(rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"sts_tickets.csv\"",
    },
  });
}
