export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, StsKpiMetric } from "@prisma/client";
import { canStsRead } from "@/lib/sts/access";
import * as XLSX from "xlsx";

const AUTO_METRICS = new Set<StsKpiMetric>([StsKpiMetric.SUPPORT_RESPONSE, StsKpiMetric.AVAILABILITY]);

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = session.user.role as Role;
  const caps = (session.user as any).capabilities as string[] | undefined;
  if (!canStsRead(role, caps)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const tenantId = (session.user as any).tenantId as string;
  const policies = await prisma.stsKpiPolicy.findMany({
    where: { tenantId },
    include: { component: true },
  });

  const rows = policies
    .filter((p) => !AUTO_METRICS.has(p.metric))
    .map((p) => ({
      componente: p.component.name,
      metrica: p.metric,
      periodicidad: p.periodicity,
      umbral: Number(p.threshold),
      valor: "N/D",
      fuente: "pendiente-integration",
    }));

  if (!rows.length) {
    rows.push({
      componente: "-",
      metrica: "-",
      periodicidad: "-",
      umbral: 0,
      valor: "N/D",
      fuente: "pendiente-integration",
    });
  }

  const sheet = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "faltantes");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=\"sts_kpis_faltantes.xlsx\"",
    },
  });
}
