export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function fmtDateTime(d: Date | null) {
  if (!d) return "";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const role = (session.user as any).role as Role;

  if (![Role.ADMIN, Role.BACKOFFICE, Role.TECHNICIAN].includes(role)) {
    return new Response("Forbidden", { status: 403 });
  }

  const workOrderId = String(ctx.params.id);
  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, tenantId },
    include: {
      case: { include: { bus: true, busEquipment: { include: { equipmentType: true } } } },
      interventionReceipt: true,
    },
  });
  if (!wo) return new Response("WorkOrder not found", { status: 404 });
  if (!wo.interventionReceipt) return new Response("Receipt not found", { status: 404 });

  const r = wo.interventionReceipt;

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 48;
  const lineHeight = 16;
  const pageWidth = 595;
  const pageHeight = 842;

  const page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  function drawLine(text: string, bold = false) {
    page.drawText(text, {
      x: margin,
      y,
      size: 11,
      font: bold ? fontBold : font,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= lineHeight;
  }

  drawLine("Recibo de intervención", true);
  drawLine(`ID Ticket: ${r.ticketNo}`, true);
  drawLine(`OT: ${wo.workOrderNo ?? ""}`);
  drawLine(`Caso: ${wo.case.caseNo ?? wo.caseId}`);
  drawLine(`Bus: ${wo.case.bus.code} ${wo.case.bus.plate ?? ""}`.trim());
  if (wo.case.busEquipment) {
    drawLine(
      `Equipo: ${wo.case.busEquipment.equipmentType.name} ${wo.case.busEquipment.serial ?? ""}`.trim()
    );
  }
  y -= lineHeight / 2;

  drawLine("== Horas para TransMilenio ==", true);
  drawLine(`Inicio (TM): ${fmtDateTime(r.tmStartedAt)}`);
  drawLine(`Cierre (TM): ${fmtDateTime(r.tmEndedAt)}`);

  y -= lineHeight / 2;
  drawLine("== Horas internas ==", true);
  drawLine(`Hora inicio (interno): ${r.internalStart ?? "—"}`);
  drawLine(`Hora cierre (interno): ${r.internalEnd ?? "—"}`);

  y -= lineHeight / 2;
  drawLine(`Generado: ${fmtDateTime(r.createdAt)}`);

  const bytes = await pdf.save();
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename=recibo-${r.ticketNo}.pdf`,
    },
  });
}
