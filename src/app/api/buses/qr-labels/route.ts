export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFEmbeddedPage } from "pdf-lib";
import QRCode from "qrcode";
import { Role } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const TEMPLATE_PDF_FILENAME = "plantilla_qr.pdf";
const TEMPLATE_SVG_FILENAME = "plantilla_qr.svg";

type SlotRatio = {
  xRatio: number;
  yTopRatio: number;
  widthRatio: number;
  heightRatio: number;
};

const DEFAULT_SLOT_RATIOS: ReadonlyArray<SlotRatio> = [
  // Ratios base extraídos de plantilla_qr.svg (3 etiquetas por hoja)
  { xRatio: 299.82 / 10812, yTopRatio: 17210.94 / 19717, widthRatio: 3200 / 10812, heightRatio: 2500 / 19717 },
  { xRatio: 3812.16 / 10812, yTopRatio: 17180.45 / 19717, widthRatio: 3200 / 10812, heightRatio: 2500 / 19717 },
  { xRatio: 7322.16 / 10812, yTopRatio: 17210.94 / 19717, widthRatio: 3200 / 10812, heightRatio: 2500 / 19717 },
];

function parseSvgSlots(svgText: string): SlotRatio[] | null {
  const viewBoxMatch = svgText.match(
    /viewBox\s*=\s*"([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)"/i
  );
  if (!viewBoxMatch) return null;

  const minX = Number(viewBoxMatch[1]);
  const minY = Number(viewBoxMatch[2]);
  const viewWidth = Number(viewBoxMatch[3]);
  const viewHeight = Number(viewBoxMatch[4]);
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(viewWidth) || !Number.isFinite(viewHeight)) {
    return null;
  }
  if (viewWidth <= 0 || viewHeight <= 0) return null;

  const rectRegex = /<rect\b[^>]*\bx="([-\d.]+)"[^>]*\by="([-\d.]+)"[^>]*\bwidth="([-\d.]+)"[^>]*\bheight="([-\d.]+)"[^>]*>/gi;
  const rects: Array<{ x: number; y: number; width: number; height: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = rectRegex.exec(svgText)) !== null) {
    const x = Number(match[1]);
    const y = Number(match[2]);
    const width = Number(match[3]);
    const height = Number(match[4]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) continue;
    if (width <= 0 || height <= 0) continue;
    rects.push({ x, y, width, height });
  }
  if (rects.length < 3) return null;

  const likelySlots = rects.filter((r) => r.width >= viewWidth * 0.2 && r.height >= viewHeight * 0.1);
  const source = likelySlots.length >= 3 ? likelySlots : rects;
  const topThree = source
    .slice()
    .sort((a, b) => b.width * b.height - a.width * a.height)
    .slice(0, 3)
    .sort((a, b) => {
      const deltaY = Math.abs(a.y - b.y);
      if (deltaY <= viewHeight * 0.02) return a.x - b.x;
      return a.y - b.y;
    });

  if (topThree.length !== 3) return null;

  return topThree.map((r) => ({
    xRatio: (r.x - minX) / viewWidth,
    yTopRatio: (r.y - minY) / viewHeight,
    widthRatio: r.width / viewWidth,
    heightRatio: r.height / viewHeight,
  }));
}

function normalizeText(value: unknown, fallback = "-") {
  const clean = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return clean || fallback;
}

function safeToken(value: string | null | undefined, fallback = "FILE") {
  const clean = String(value ?? "")
    .trim()
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return clean || fallback;
}

function parsePositiveInt(raw: string | null) {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function chunkBy<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function toBool(raw: string | null) {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "si" || s === "sí";
}

function trimTrailingSlash(url: string) {
  return url.replace(/\/+$/, "");
}

function normalizeForMatch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fitSingleLine(text: string, font: PDFFont, fontSize: number, maxWidth: number) {
  const base = text.trim();
  if (!base) return "";
  if (font.widthOfTextAtSize(base, fontSize) <= maxWidth) return base;

  const ellipsis = "...";
  const ellipsisWidth = font.widthOfTextAtSize(ellipsis, fontSize);
  if (ellipsisWidth >= maxWidth) return "";

  let out = base;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}${ellipsis}`, fontSize) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}${ellipsis}`;
}

function repeatCountForEquipment(equipmentName: string) {
  const key = normalizeForMatch(equipmentName);
  if (key.includes("disco")) return 2;
  if (key.includes("bateria")) return 2;
  return 1;
}

function equipmentLabelWithCopy(equipmentName: string, copyIndex: number, copies: number) {
  if (copies <= 1) return equipmentName;
  return `${equipmentName} ${copyIndex + 1}`;
}

function parseInventoryCbEquipmentType(summary: string | null | undefined): string | null {
  const raw = String(summary ?? "").trim();
  if (!raw) return null;
  const match = raw.match(
    /^\[INVENTARIO_CB\](?:\[BASELINE\])?\s*([^:]+):/i
  );
  if (!match?.[1]) return null;
  const value = normalizeText(match[1], "").toUpperCase();
  return value || null;
}

function uniqueUpper(values: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const v = normalizeText(value, "").toUpperCase();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function isDiskEquipmentName(name: string) {
  const key = normalizeForMatch(name);
  return key.includes("disco");
}

function isAntennaEquipmentName(name: string) {
  const key = normalizeForMatch(name);
  return key.includes("antena");
}

function expandDesmonteEquipmentLabels(inventoryTypes: string[]): string[] {
  const base = uniqueUpper(inventoryTypes);
  const out: string[] = [];

  for (const item of base) {
    if (isDiskEquipmentName(item)) continue;
    if (isAntennaEquipmentName(item)) continue;
    out.push(item);
  }

  // Requerimiento: en desmonte generar 3 etiquetas de disco duro.
  out.push("DISCO DURO 1", "DISCO DURO 2", "DISCO DURO 3");
  // Requerimiento: en desmonte generar 3 antenas específicas.
  out.push("ANTENA WIFI", "ANTENA LTE", "ANTENA GPS");

  return uniqueUpper(out);
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const role = (session.user as any).role as Role;
  if (role !== Role.ADMIN) {
    return new Response("Forbidden", { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const { searchParams } = new URL(req.url);
  const busId = String(searchParams.get("busId") ?? "").trim();
  const busCodeFilter = String(searchParams.get("busCode") ?? "").trim();
  const onlyActive = toBool(searchParams.get("onlyActive"));
  const limit = parsePositiveInt(searchParams.get("limit"));
  const modeRaw = String(searchParams.get("mode") ?? "").trim().toLowerCase();
  const mode: "desmonte" | "instalacion" = modeRaw === "desmonte" ? "desmonte" : "instalacion";
  const isDesmonteMode = mode === "desmonte";
  const isInstalacionMode = mode === "instalacion";

  const buses = await prisma.bus.findMany({
    where: {
      tenantId,
      NOT: { code: "BUS_ID" },
      ...(busId ? { id: busId } : {}),
      ...(busCodeFilter ? { code: { contains: busCodeFilter, mode: "insensitive" } } : {}),
    },
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      equipments: {
        where: onlyActive ? { active: true } : undefined,
        orderBy: [{ equipmentType: { name: "asc" } }, { id: "asc" }],
        select: {
          id: true,
          equipmentType: { select: { name: true } },
        },
      },
      lifecycle: {
        where: {
          eventType: { in: ["BUS_INVENTORY_BASELINE_SYNC", "BUS_INVENTORY_BASELINE_CAPTURED"] },
        },
        select: { summary: true },
        orderBy: { occurredAt: "desc" },
        take: isDesmonteMode ? 400 : 0,
      },
    },
  });

  const baseUrl = trimTrailingSlash(
    String(process.env.APP_URL || process.env.NEXTAUTH_URL || new URL(req.url).origin).trim()
  );

  const labels = buses.flatMap((bus) => {
    const busCode = normalizeText(bus.code, "BUS");

    if (isInstalacionMode) {
      return bus.equipments.flatMap((equipment: any) => {
        const equipmentName = normalizeText(equipment.equipmentType.name, "Equipo");
        const copies = repeatCountForEquipment(equipmentName);
        const list: Array<{ busCode: string; equipmentName: string; url: string }> = [];

        for (let i = 0; i < copies; i += 1) {
          list.push({
            busCode,
            equipmentName: equipmentLabelWithCopy(equipmentName, i, copies),
            url: `${baseUrl}/equipments/${equipment.id}`,
          });
        }

        return list;
      });
    }

    const inventoryTypes = uniqueUpper(
      (bus as any).lifecycle?.map((ev: any) => parseInventoryCbEquipmentType(ev?.summary)).filter(Boolean) ?? []
    );
    // En modo desmonte, usar solo los equipos antiguos importados desde Inventario_CB.
    const equipmentTypes = expandDesmonteEquipmentLabels(inventoryTypes);

    return equipmentTypes.flatMap((equipmentName) => {
      return [
        {
          busCode,
          equipmentName,
          url: `${baseUrl}/buses/${bus.id}`,
        },
      ];
    });
  });

  const rows = limit ? labels.slice(0, limit) : labels;
  if (!rows.length) {
    return new Response("No hay buses/equipos para generar etiquetas.", { status: 404 });
  }

  const pdf = await PDFDocument.create();
  pdf.setTitle("Etiquetas QR buses/equipos");
  pdf.setSubject("Etiquetas QR para hoja de vida de equipos por bus");
  pdf.setCreator("CapitalDesk");

  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let templatePage: PDFEmbeddedPage;
  try {
    const templatePath = join(process.cwd(), TEMPLATE_PDF_FILENAME);
    const templateBytes = await readFile(templatePath);
    [templatePage] = await pdf.embedPdf(templateBytes, [0]);
  } catch {
    return new Response(
      `No se encontró la plantilla ${TEMPLATE_PDF_FILENAME} en la raíz del proyecto.`,
      { status: 500 }
    );
  }

  let slots: SlotRatio[] = [...DEFAULT_SLOT_RATIOS];
  try {
    const svgPath = join(process.cwd(), TEMPLATE_SVG_FILENAME);
    const svgText = await readFile(svgPath, "utf8");
    const parsed = parseSvgSlots(svgText);
    if (parsed && parsed.length === 3) {
      slots = parsed;
    }
  } catch {
    // Si falta SVG, se usan los ratios por defecto.
  }

  const pageWidth = templatePage.width;
  const pageHeight = templatePage.height;

  const groups = chunkBy(rows, slots.length);
  for (const group of groups) {
    const page = pdf.addPage([pageWidth, pageHeight]);
    page.drawPage(templatePage, {
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
    });

    for (let slotIndex = 0; slotIndex < group.length; slotIndex += 1) {
      const item = group[slotIndex];
      const slot = slots[slotIndex];
      if (!item || !slot) continue;

      const slotX = pageWidth * slot.xRatio;
      const slotY = pageHeight - pageHeight * (slot.yTopRatio + slot.heightRatio);
      const slotWidth = pageWidth * slot.widthRatio;
      const slotHeight = pageHeight * slot.heightRatio;

      // Limpia contenido de ejemplo dentro del recuadro de la plantilla
      // dejando visible el borde/forma externa.
      const contentInsetX = slotWidth * 0.08;
      const contentInsetY = slotHeight * 0.1;
      const contentX = slotX + contentInsetX;
      const contentY = slotY + contentInsetY;
      const contentWidth = slotWidth - contentInsetX * 2;
      const contentHeight = slotHeight - contentInsetY * 2;
      page.drawRectangle({
        x: contentX,
        y: contentY,
        width: contentWidth,
        height: contentHeight,
        color: rgb(1, 1, 1),
      });

      const padding = contentHeight * 0.06;
      const textBlockHeight = contentHeight * 0.34;
      const topLabelHeight = 0;
      const qrAvailableHeight = Math.max(
        contentHeight * 0.28,
        contentHeight - textBlockHeight - topLabelHeight - padding * 2
      );
      const qrSize = Math.max(contentHeight * 0.34, Math.min(contentWidth - padding * 2, qrAvailableHeight));
      const qrX = contentX + (contentWidth - qrSize) / 2;
      const qrY = contentY + textBlockHeight + padding;

      const qrBuffer = await QRCode.toBuffer(item.url, {
        type: "png",
        width: 220,
        margin: 0,
        errorCorrectionLevel: "M",
      });
      const qrImage = await pdf.embedPng(qrBuffer);
      page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });

      const textMaxWidth = contentWidth - padding * 2;
      const busFontSize = 9;
      const eqFontSize = 8;
      const busText = fitSingleLine(`BUS ${item.busCode}`, fontBold, busFontSize, textMaxWidth);
      const eqText = fitSingleLine(item.equipmentName, fontBold, eqFontSize, textMaxWidth);

      const busWidth = fontBold.widthOfTextAtSize(busText, busFontSize);
      const eqWidth = fontBold.widthOfTextAtSize(eqText, eqFontSize);
      const eqY = contentY + padding;
      const busY = eqY + eqFontSize + contentHeight * 0.04;

      page.drawText(busText, {
        x: contentX + (contentWidth - busWidth) / 2,
        y: busY,
        size: busFontSize,
        font: fontBold,
        color: rgb(0.03, 0.03, 0.03),
      });
      page.drawText(eqText, {
        x: contentX + (contentWidth - eqWidth) / 2,
        y: eqY,
        size: eqFontSize,
        font: fontBold,
        color: rgb(0.08, 0.08, 0.08),
      });

    }
  }

  const bytes = await pdf.save();
  const dateToken = new Date().toISOString().slice(0, 10);
  const scopeToken = busId && buses.length === 1 ? safeToken(buses[0]?.code, "bus") : "todos";
  const filename =
    mode === "desmonte"
      ? `etiquetas-qr-desmonte-${scopeToken}-${safeToken(dateToken, "hoy")}.pdf`
      : `etiquetas-qr-instalacion-${scopeToken}-${safeToken(dateToken, "hoy")}.pdf`;

  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
    },
  });
}
