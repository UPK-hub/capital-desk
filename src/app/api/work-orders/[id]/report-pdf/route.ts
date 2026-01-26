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

function reportToLines(report: Record<string, any>) {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(report)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.length} items]`);
      continue;
    }
    if (typeof value === "object") {
      lines.push(`${key}: ${JSON.stringify(value)}`);
      continue;
    }
    lines.push(`${key}: ${String(value)}`);
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

  const lines = reportToLines(report as any);
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

  const bytes = await pdf.save();
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename=work-order-${wo.id}.pdf`,
    },
  });
}
