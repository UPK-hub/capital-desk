export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { CAPABILITIES } from "@/lib/capabilities";
import { buildCasesWhere } from "@/lib/cases/filters";
import { restrictedCasesWhere } from "@/lib/access-control";
import { caseStatusLabels, caseTypeLabels, labelFromMap } from "@/lib/labels";
import { utils, write } from "xlsx";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const role = (session.user as any).role as Role;
  const caps = (session.user as any).capabilities as string[] | undefined;
  const userId = String((session.user as any).id ?? "");
  const tenantId = (session.user as any).tenantId as string;

  const isVideosOnly = role === Role.BACKOFFICE && caps?.includes(CAPABILITIES.VIDEOS_ONLY);
  if ((role !== Role.ADMIN && role !== Role.BACKOFFICE) || isVideosOnly) {
    return new Response("Forbidden", { status: 403 });
  }
  const ownOnly = role === Role.BACKOFFICE && !!caps?.includes(CAPABILITIES.OWN_CASES_ONLY);

  const sp: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    sp[k] = v;
  });

  const ownWhere = ownOnly ? await restrictedCasesWhere({ tenantId, userId }) : {};
  const { baseWhere, statusWhere } = buildCasesWhere(sp, { tenantId, ownOnly, userId, ownWhere });

  const cases = await prisma.case.findMany({
    where: { ...baseWhere, ...statusWhere },
    orderBy: { createdAt: "desc" },
    take: 5000,
    include: {
      bus: { select: { code: true, plate: true } },
      assignedTo: { select: { name: true } },
      workOrder: { select: { workOrderNo: true, assignedTo: { select: { name: true } } } },
    },
  });

  const fmt = (d: Date | null | undefined) =>
    d ? new Date(d).toLocaleString("es-CO", { timeZone: "America/Bogota" }) : "";

  const rows = cases.map((c) => ({
    "#": c.caseNo ?? "",
    Bus: c.bus?.code ?? "",
    Placa: c.bus?.plate ?? "",
    "Título": c.title,
    Tipo: labelFromMap(c.type, caseTypeLabels),
    Estado: labelFromMap(c.status, caseStatusLabels),
    Prioridad: c.priority,
    OT: c.workOrder?.workOrderNo ?? "",
    Asignado: c.assignedTo?.name ?? c.workOrder?.assignedTo?.name ?? "Sin asignar",
    Creado: fmt(c.createdAt),
    Actualizado: fmt(c.updatedAt),
  }));

  const wb = utils.book_new();
  utils.book_append_sheet(wb, utils.json_to_sheet(rows), "Casos");
  const buffer = write(wb, { type: "buffer", bookType: "xlsx" });
  const tag = new Date().toISOString().slice(0, 10);

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=casos-${tag}.xlsx`,
    },
  });
}
