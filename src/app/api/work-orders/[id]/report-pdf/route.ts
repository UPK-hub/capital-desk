export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveUploadPath } from "@/lib/uploads";

type MediaInfo = { kind: string; filePath: string };

function isImageFile(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  return ext === ".png" || ext === ".jpg" || ext === ".jpeg";
}

function yesNo(v: any) {
  return v ? "Sí" : "No";
}

function fmtDate(v: any) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function renderPreventive(report: Record<string, any>) {
  const lines: string[] = [];
  const push = (label: string, value: any) => {
    if (value === null || value === undefined || value === "") return;
    lines.push(`${label}: ${value}`);
  };

  lines.push("== Datos del biarticulado ==");
  push("Ticket", report.ticketNumber);
  push("OT", report.workOrderNumber);
  push("Bus (TM)", report.biarticuladoNo);
  push("Placa", report.plate);
  push("Kilometraje", report.mileage);
  push("Programado", fmtDate(report.scheduledAt));
  push("Ejecutado", fmtDate(report.executedAt));
  push("Reprogramado", fmtDate(report.rescheduledAt));

  // Dispositivos instalados eliminado por solicitud

  lines.push("");
  lines.push("== Actividades ==");
  const activities = Array.isArray(report.activities) ? report.activities : [];
  if (!activities.length) {
    lines.push("Sin registros.");
  } else {
    activities.forEach((a: any, idx: number) => {
      const result = a.result ? ` | Resultado: ${a.result}` : "";
      const value = a.value ? ` | Valor: ${a.value}` : "";
      const obs = a.observation ? ` | Observación: ${a.observation}` : "";
      lines.push(`${idx + 1}. [${a.area ?? ""}] ${a.activity ?? ""}${result}${value}${obs}`);
    });
  }

  lines.push("");
  lines.push("== Cierre ==");
  push("Observaciones", report.observations);
  push("Hora inicio", report.timeStart);
  push("Hora fin", report.timeEnd);
  push("Responsable UPK", report.responsibleUpk);
  push("Responsable Capital Bus", report.responsibleCapitalBus);

  return lines;
}

function renderCorrective(report: Record<string, any>) {
  const lines: string[] = [];
  const push = (label: string, value: any) => {
    if (value === null || value === undefined || value === "") return;
    lines.push(`${label}: ${value}`);
  };

  lines.push("== Datos del dispositivo/equipo ==");
  push("Ticket", report.ticketNumber);
  push("OT", report.workOrderNumber);
  push("Bus (TM)", report.busCode);
  push("Placa", report.plate);
  push("Tipo dispositivo", report.deviceType);
  push("Marca", report.brand);
  push("Modelo", report.model);
  push("Serial", report.serial);
  push("Tipo procedimiento", report.procedureType);
  push("Procedimiento (otro)", report.procedureOther);
  push("Ubicación", report.location);
  push("Ubicación (otro)", report.locationOther);
  push("Fecha desmonte", fmtDate(report.dateDismount));
  push("Fecha entrega", fmtDate(report.dateDelivered));

  lines.push("");
  lines.push("== Descripción de la falla ==");
  push("Accesorios suministrados", yesNo(report.accessoriesSupplied));
  push("Accesorios (cuáles)", report.accessoriesWhich);
  push("Tipo de falla", report.failureType);
  push("Tipo de falla (otro)", report.failureOther);
  push("Estado físico", report.physicalState);
  push("Diagnóstico", report.diagnosis);
  push("Solución", report.solution);
  push("Tiempo solución fabricante", report.manufacturerEta);
  push("Hora inicio (interno)", report.timeStart);
  push("Hora cierre (interno)", report.timeEnd);

  lines.push("");
  lines.push("== Cambio de componente ==");
  push("Fecha instalación", fmtDate(report.installDate));
  push("Marca nueva", report.newBrand);
  push("Modelo nuevo", report.newModel);
  push("Serial nuevo", report.newSerial);
  if (!report.installDate && !report.newBrand && !report.newModel && !report.newSerial) {
    lines.push("No aplica.");
  }

  return lines;
}

async function readImageBytes(filePath: string) {
  if (!isImageFile(filePath)) return null;
  const abs = resolveUploadPath(filePath);
  return fs.readFile(abs);
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
  const url = new URL(req.url);
  const requestedKind = url.searchParams.get("kind")?.toUpperCase() ?? "";

  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, tenantId },
    include: {
      case: {
        include: { bus: true, busEquipment: { include: { equipmentType: true } } },
      },
      preventiveReport: true,
      correctiveReport: true,
      steps: { include: { media: true } },
    },
  });
  if (!wo) return new Response("WorkOrder not found", { status: 404 });

  const kind =
    requestedKind === "PREVENTIVE" || requestedKind === "CORRECTIVE"
      ? requestedKind
      : wo.preventiveReport
      ? "PREVENTIVE"
      : wo.correctiveReport
      ? "CORRECTIVE"
      : "";

  const report = kind === "PREVENTIVE" ? wo.preventiveReport : kind === "CORRECTIVE" ? wo.correctiveReport : null;
  if (!report) return new Response("Report not found", { status: 404 });
  const corrective = kind === "CORRECTIVE" ? wo.correctiveReport : null;

  const media: MediaInfo[] = [];
  for (const s of wo.steps ?? []) {
    for (const m of s.media ?? []) {
      media.push({ kind: m.kind, filePath: m.filePath });
    }
  }

  const startPhoto = media.find((m) => m.kind === "FOTO_INICIO");
  const finishPhoto = media.find((m) => m.kind === "FOTO_FIN");

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 48;
  const lineHeight = 14;
  const pageWidth = 595;
  const pageHeight = 842;

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  function drawLine(text: string, bold = false) {
    page.drawText(text, {
      x: margin,
      y,
      size: 10,
      font: bold ? fontBold : font,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= lineHeight;
    if (y < margin) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  }

  drawLine(`Capital Desk - Formato ${kind === "PREVENTIVE" ? "Preventivo" : "Correctivo"}`, true);
  drawLine(`Caso: ${wo.case.title}`);
  drawLine(`OT: ${wo.workOrderNo ?? ""} | Bus: ${wo.case.bus.code} ${wo.case.bus.plate ?? ""}`.trim());
  if (wo.case.busEquipment) {
    drawLine(
      `Equipo: ${wo.case.busEquipment.equipmentType.name} ${wo.case.busEquipment.serial ?? ""}`.trim()
    );
  }
  drawLine(`Generado: ${new Date().toISOString()}`);
  y -= lineHeight;

  const lines =
    kind === "PREVENTIVE" ? renderPreventive(report as any) : kind === "CORRECTIVE" ? renderCorrective(report as any) : [];
  for (const l of lines) drawLine(l);

  async function addImagePage(title: string, filePath: string) {
    const bytes = await readImageBytes(filePath);
    if (!bytes) return;

    const img = filePath.toLowerCase().endsWith(".png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);

    const imgPage = pdf.addPage([pageWidth, pageHeight]);
    imgPage.drawText(title, { x: margin, y: pageHeight - margin, size: 12, font: fontBold });

    const maxWidth = pageWidth - margin * 2;
    const maxHeight = pageHeight - margin * 2 - 20;
    const scale = Math.min(maxWidth / img.width, maxHeight / img.height);

    const w = img.width * scale;
    const h = img.height * scale;
    const x = (pageWidth - w) / 2;
    const yImg = (pageHeight - h) / 2 - 10;

    imgPage.drawImage(img, { x, y: yImg, width: w, height: h });
  }

  if (startPhoto?.filePath) await addImagePage("Foto inicio", startPhoto.filePath);
  if (finishPhoto?.filePath) await addImagePage("Foto fin", finishPhoto.filePath);
  if (corrective?.photoSerialCurrent) {
    await addImagePage("Foto serial actual", corrective.photoSerialCurrent);
  }
  if (corrective?.photoSerialNew) {
    await addImagePage("Foto serial nuevo", corrective.photoSerialNew);
  }

  const bytes = await pdf.save();
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename=work-order-${wo.id}.pdf`,
    },
  });
}
