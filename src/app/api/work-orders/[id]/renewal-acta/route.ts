export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import fs from "node:fs/promises";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CaseType, Role, WorkOrderStatus } from "@prisma/client";
import {
  buildRenewalPlaceholders,
  generateRenewalActaDocxBuffer,
  resolveRenewalActaTemplatePath,
} from "@/lib/renewal-acta-docx";

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const role = (session.user as any).role as Role;
  const allowedRoles = new Set<string>(["ADMIN", "BACKOFFICE", "TECHNICIAN"]);
  if (!allowedRoles.has(String(role))) {
    return new Response("Forbidden", { status: 403 });
  }

  const workOrderId = String(ctx.params.id);
  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, tenantId },
    include: {
      case: { include: { bus: true } },
      renewalTechReport: true,
    },
  });
  if (!wo) return new Response("WorkOrder not found", { status: 404 });
  if (wo.case.type !== CaseType.RENOVACION_TECNOLOGICA && wo.case.type !== CaseType.MEJORA_PRODUCTO) {
    return new Response("Solo aplica para renovacion/mejora de producto", { status: 400 });
  }
  if (wo.status !== WorkOrderStatus.FINALIZADA) {
    return new Response("OT pendiente de cierre/validacion", { status: 409 });
  }
  if (!wo.renewalTechReport) {
    return new Response("Formato de renovacion no encontrado", { status: 404 });
  }

  const report = wo.renewalTechReport as any;
  const installation = report?.newInstallation && typeof report.newInstallation === "object"
    ? (report.newInstallation as Record<string, any>)
    : {};
  const equipmentUpdates = Array.isArray(installation.equipmentUpdates) ? installation.equipmentUpdates : [];

  const templatePath = resolveRenewalActaTemplatePath();
  try {
    await fs.access(templatePath);
  } catch {
    return new Response(`Plantilla no encontrada: ${templatePath}`, { status: 500 });
  }

  const origin = new URL(req.url).origin;
  const placeholders = buildRenewalPlaceholders({
    origin,
    busCode: report.busCode ?? wo.case.bus.code,
    plate: report.plate ?? wo.case.bus.plate ?? null,
    verificationDate: installation.verificationDate ?? wo.finishedAt ?? null,
    equipmentUpdates,
  });

  const docx = await generateRenewalActaDocxBuffer(templatePath, placeholders);
  const ticketNo = String(report.ticketNumber ?? wo.workOrderNo ?? workOrderId).replace(/[^\w.-]+/g, "_");
  const fileName =
    wo.case.type === CaseType.MEJORA_PRODUCTO
      ? `ACTA-MEJORA-PRODUCTO-${ticketNo}.docx`
      : `ACTA-RENOVACION-${ticketNo}.docx`;

  return new Response(Buffer.from(docx), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
