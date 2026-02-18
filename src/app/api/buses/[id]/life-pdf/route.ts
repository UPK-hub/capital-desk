export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { caseStatusLabels, caseTypeLabels, labelFromMap, workOrderStatusLabels } from "@/lib/labels";

function fmtDate(d?: Date | null) {
  if (!d) return "-";
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function safe(value: unknown) {
  return String(value ?? "").trim() || "-";
}

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const role = (session.user as any).role as Role;
  if (role !== Role.ADMIN && role !== Role.BACKOFFICE) {
    return new Response("Forbidden", { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const busId = String(ctx.params.id);

  const bus = await prisma.bus.findFirst({
    where: { id: busId, tenantId },
    select: {
      id: true,
      code: true,
      plate: true,
      linkSmartHelios: true,
      ipSimcard: true,
      active: true,
      createdAt: true,
      equipments: {
        orderBy: [{ equipmentType: { name: "asc" } }, { id: "asc" }],
        select: {
          id: true,
          serial: true,
          ipAddress: true,
          location: true,
          active: true,
          brand: true,
          model: true,
          equipmentType: { select: { name: true } },
        },
      },
      cases: {
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          caseNo: true,
          title: true,
          type: true,
          status: true,
          priority: true,
          createdAt: true,
          workOrder: {
            select: {
              id: true,
              workOrderNo: true,
              status: true,
              assignedAt: true,
              startedAt: true,
              finishedAt: true,
            },
          },
        },
      },
      lifecycle: {
        orderBy: { occurredAt: "desc" },
        take: 250,
        select: {
          eventType: true,
          summary: true,
          occurredAt: true,
          caseId: true,
          workOrderId: true,
        },
      },
    },
  });

  if (!bus) return new Response("Bus not found", { status: 404 });

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 42;
  const pageWidth = 595;
  const pageHeight = 842;
  const lineHeight = 13;
  const maxTextWidth = pageWidth - margin * 2;

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  function ensureSpace(lines = 2) {
    if (y - lines * lineHeight < margin) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  }

  function drawText(text: string, bold = false, size = 10) {
    ensureSpace(1);
    page.drawText(text, {
      x: margin,
      y,
      size,
      font: bold ? fontBold : font,
      color: rgb(0.1, 0.1, 0.1),
      maxWidth: maxTextWidth,
      lineHeight,
    });
    y -= lineHeight;
  }

  function drawSection(title: string) {
    ensureSpace(2);
    y -= 4;
    page.drawText(title, {
      x: margin,
      y,
      size: 11,
      font: fontBold,
      color: rgb(0.08, 0.08, 0.08),
    });
    y -= lineHeight + 2;
  }

  drawText(`CapitalDesk · Hoja de vida del bus`, true, 14);
  drawText(`Generado: ${fmtDate(new Date())}`);
  y -= 6;

  drawSection("Resumen del bus");
  drawText(`Código: ${safe(bus.code)}`);
  drawText(`Placa: ${safe(bus.plate)}`);
  drawText(`Estado: ${bus.active ? "Activo" : "Inactivo"}`);
  drawText(`SmartHelios: ${safe(bus.linkSmartHelios)}`);
  drawText(`IP SIM: ${safe(bus.ipSimcard)}`);
  drawText(`Creado: ${fmtDate(bus.createdAt)}`);

  drawSection(`Inventario (${bus.equipments.length})`);
  if (!bus.equipments.length) {
    drawText("Sin equipos asociados.");
  } else {
    for (const eq of bus.equipments) {
      drawText(
        `• ${safe(eq.equipmentType.name)} | Serial: ${safe(eq.serial)} | IP: ${safe(eq.ipAddress)} | Estado: ${
          eq.active ? "Activo" : "Inactivo"
        }`
      );
    }
  }

  drawSection(`Casos (${bus.cases.length})`);
  if (!bus.cases.length) {
    drawText("Sin casos.");
  } else {
    for (const c of bus.cases) {
      drawText(
        `• CASO-${String(c.caseNo ?? "-")} | ${safe(c.title)} | ${labelFromMap(c.type, caseTypeLabels)} | ${labelFromMap(
          c.status,
          caseStatusLabels
        )} | Prioridad ${c.priority} | ${fmtDate(c.createdAt)}`
      );
      if (c.workOrder) {
        drawText(
          `  OT-${String(c.workOrder.workOrderNo ?? "-")} | ${labelFromMap(
            c.workOrder.status,
            workOrderStatusLabels
          )} | Asignada: ${fmtDate(c.workOrder.assignedAt)} | Inicio: ${fmtDate(c.workOrder.startedAt)} | Fin: ${fmtDate(
            c.workOrder.finishedAt
          )}`
        );
      }
    }
  }

  drawSection(`Timeline (${bus.lifecycle.length})`);
  if (!bus.lifecycle.length) {
    drawText("Sin eventos.");
  } else {
    for (const ev of bus.lifecycle) {
      drawText(
        `• ${fmtDate(ev.occurredAt)} | ${safe(ev.eventType)} | ${safe(ev.summary)} | Caso: ${safe(ev.caseId)} | OT: ${safe(
          ev.workOrderId
        )}`
      );
    }
  }

  const bytes = await pdf.save();
  const filename = `hoja-vida-${safe(bus.code).replace(/[^\w.-]+/g, "_")}.pdf`;
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
    },
  });
}

