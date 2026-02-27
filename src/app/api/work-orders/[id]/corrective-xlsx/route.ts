export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readUploadBinary } from "@/lib/uploads";
import { Role } from "@prisma/client";
import ExcelJS from "exceljs";

function safeToken(value: string | null | undefined, fallback = "BUS") {
  const clean = String(value ?? "")
    .trim()
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return clean || fallback;
}

function text(v: unknown) {
  return String(v ?? "").trim();
}

function fmtDateOnly(v: unknown) {
  if (!v) return "";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v ?? "");
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeZone: "America/Bogota",
  }).format(d);
}

function fmtDateTime(v: unknown) {
  if (!v) return "";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v ?? "");
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(d);
}

function setCellText(ws: ExcelJS.Worksheet, address: string, value: string) {
  const normalized = text(value);
  if (!normalized) return;
  ws.getCell(address).value = normalized;
}

function normalizeUploadRelPath(value: unknown) {
  return text(value).replace(/^\/+/, "").replace(/\\/g, "/");
}

function imageExtensionFromPath(filePath: string): "png" | "jpeg" | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "png";
  if (ext === ".jpg" || ext === ".jpeg") return "jpeg";
  return null;
}

function cellValueAsText(cell: ExcelJS.Cell) {
  const raw = cell.value as any;
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
    return String(raw).trim();
  }
  if (raw instanceof Date) return fmtDateTime(raw);
  if (Array.isArray(raw)) {
    return raw
      .map((item: any) => {
        if (!item) return "";
        if (typeof item === "string") return item;
        if (typeof item.text === "string") return item.text;
        return "";
      })
      .join("")
      .trim();
  }
  if (typeof raw === "object") {
    if (typeof raw.text === "string") return raw.text.trim();
    if (raw.result !== null && raw.result !== undefined) return String(raw.result).trim();
  }
  return "";
}

type EvidenceImageInput = {
  label: string;
  relPath: string;
  sourceCell?: string;
};

async function appendEvidenceImagesSheet(workbook: ExcelJS.Workbook, evidence: EvidenceImageInput[]) {
  const existing = workbook.getWorksheet("EVIDENCIAS");
  if (existing) {
    workbook.removeWorksheet(existing.id);
  }

  let sheet: ExcelJS.Worksheet | null = null;
  let rowCursor = 2;
  let embeddedCount = 0;
  const embeddedByCell = new Set<string>();
  const embeddedPaths = new Set<string>();

  const ensureSheet = () => {
    if (sheet) return sheet;
    sheet = workbook.addWorksheet("EVIDENCIAS");
    sheet.columns = [
      { header: "Evidencia", key: "evidence", width: 44 },
      { header: "Archivo", key: "file", width: 72 },
    ];
    const header = sheet.getRow(1);
    header.font = { bold: true };
    header.height = 22;
    return sheet;
  };

  for (const item of evidence) {
    const relPath = normalizeUploadRelPath(item.relPath);
    if (!relPath) continue;

    if (embeddedPaths.has(relPath)) {
      if (item.sourceCell) embeddedByCell.add(item.sourceCell);
      continue;
    }

    const extension = imageExtensionFromPath(relPath);
    if (!extension) continue;

    const upload = await readUploadBinary(relPath);
    if (!upload) continue;
    const bytes = upload.buffer;

    const ws = ensureSheet();
    const imageId = workbook.addImage({ buffer: Buffer.from(bytes), extension } as any);
    const fileName = path.basename(relPath);

    ws.getCell(`A${rowCursor}`).value = item.label;
    ws.getCell(`B${rowCursor}`).value = fileName;
    ws.getRow(rowCursor).font = { bold: true };
    ws.getRow(rowCursor).height = 22;
    rowCursor += 1;

    const imageWidthPx = 720;
    const imageHeightPx = 220;
    ws.addImage(imageId, {
      tl: { col: 0.2, row: rowCursor - 1 + 0.1 },
      ext: { width: imageWidthPx, height: imageHeightPx },
    });

    const occupiedRows = Math.ceil(imageHeightPx / 20) + 1;
    for (let i = 0; i < occupiedRows; i += 1) {
      ws.getRow(rowCursor + i).height = 20;
    }

    rowCursor += occupiedRows + 1;
    embeddedCount += 1;
    embeddedPaths.add(relPath);
    if (item.sourceCell) embeddedByCell.add(item.sourceCell);
  }

  return { embeddedCount, embeddedByCell };
}

async function resolveTemplatePath() {
  const candidates = [
    path.join(process.cwd(), "Formato corretivo.xlsx"),
    path.join(process.cwd(), "Formato correctivo.xlsx"),
    path.join(process.cwd(), "resources", "Formato corretivo.xlsx"),
    path.join(process.cwd(), "resources", "Formato correctivo.xlsx"),
  ];
  for (const p of candidates) {
    try {
      await fs.access(p);
      return p;
    } catch {}
  }
  return null;
}

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const role = (session.user as any).role as Role;
  const allowedRoles = new Set<string>(["ADMIN", "BACKOFFICE", "TECHNICIAN"]);
  if (!allowedRoles.has(String(role))) return new Response("Forbidden", { status: 403 });

  const workOrderId = String(ctx.params.id);
  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, tenantId },
    include: {
      assignedTo: { select: { name: true } },
      case: { include: { bus: true } },
      correctiveReport: true,
    },
  });
  if (!wo) return new Response("WorkOrder not found", { status: 404 });
  if (!wo.correctiveReport) return new Response("Formato correctivo no encontrado", { status: 404 });

  const templatePath = await resolveTemplatePath();
  if (!templatePath) {
    return new Response("Plantilla Excel de correctivo no encontrada", { status: 500 });
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(templatePath);
  } catch (error: any) {
    const reason = String(error?.message ?? error ?? "Error de lectura");
    return new Response(
      `No se pudo abrir la plantilla Excel. Cierra el archivo si está abierto y reintenta. (${reason})`,
      { status: 500 }
    );
  }
  const ws = workbook.getWorksheet("MTTO CORRECTIVO") ?? workbook.worksheets[0];
  if (!ws) return new Response("Hoja de plantilla no encontrada", { status: 500 });

  const report = wo.correctiveReport as any;
  const templateData =
    report?.templateData && typeof report.templateData === "object" && !Array.isArray(report.templateData)
      ? (report.templateData as Record<string, unknown>)
      : {};

  const pick = (key: string, fallback = "") => text(templateData[key] ?? fallback);
  const toFileName = (value: unknown) => text(value).split("/").pop() ?? "";
  const busCode = text(report.busCode || wo.case.bus.code);
  const plate = text(report.plate || wo.case.bus.plate || "");

  // A. Identificación ticket
  setCellText(ws, "E6", text(report.ticketNumber));
  setCellText(ws, "M6", text(report.workOrderNumber || (wo.workOrderNo ? `OT-${String(wo.workOrderNo).padStart(3, "0")}` : "")));
  setCellText(ws, "E7", pick("reportDateTime", fmtDateTime(wo.case.createdAt)));
  setCellText(ws, "M7", pick("reportChannel", "Mesa de Ayuda"));
  setCellText(ws, "E8", pick("reportedBy", "Mesa de Ayuda CAPITALBUS"));
  setCellText(ws, "M8", pick("reportContact"));

  // B. Bus
  setCellText(ws, "E11", busCode);
  setCellText(ws, "M11", pick("productionSp"));
  setCellText(ws, "E12", plate);
  setCellText(ws, "M12", pick("busType", "Biarticulado"));
  setCellText(ws, "E13", pick("yardLocation", "Capitalbus"));
  setCellText(ws, "M13", pick("routeService"));
  setCellText(ws, "E14", pick("interventionDateTime", fmtDateTime(new Date())));
  setCellText(ws, "M14", pick("interventionShift"));

  // C. Novedad reportada
  setCellText(ws, "E17", pick("affectedSystem"));
  setCellText(ws, "M17", pick("componentName", text(report.deviceType)));
  setCellText(ws, "E18", pick("symptomNovelty"));
  setCellText(ws, "M18", pick("operationImpact"));
  setCellText(ws, "E19", pick("briefDescription"));

  // D. Verificación rápida
  const quickActionSummary = [
    pick("nextActionResponsible"),
    pick("quickChecklistSummary") ? `Paso a paso: ${pick("quickChecklistSummary")}` : "",
    pick("quickEvidenceSummary") ? `Evidencia mínima: ${pick("quickEvidenceSummary")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  setCellText(ws, "E32", pick("quickCheckResult"));
  setCellText(ws, "M32", quickActionSummary);
  setCellText(ws, "E33", pick("requiresNightIntervention"));
  setCellText(ws, "M33", pick("nightBusStatus"));

  // E. Diagnóstico y solución
  setCellText(ws, "E36", pick("diagnosticStartAt", fmtDateTime(new Date())));
  setCellText(ws, "M36", pick("diagnosticEndAt", fmtDateTime(new Date())));
  setCellText(ws, "E37", wo.assignedTo?.name || "");
  setCellText(ws, "M37", pick("supportTechnician"));
  setCellText(ws, "E38", text(report.failureType || report.failureOther));
  setCellText(ws, "M38", pick("rootCause"));
  setCellText(ws, "E39", text(report.diagnosis));
  setCellText(ws, "E42", text(report.solution));

  const materials = pick("materialsUsed");
  if (materials) {
    const lines = materials.split(/\r?\n/).map((x) => x.trim()).filter(Boolean).slice(0, 4);
    if (lines[0]) setCellText(ws, "A48", lines[0]);
    if (lines[1]) setCellText(ws, "A49", lines[1]);
    if (lines[2]) setCellText(ws, "A50", lines[2]);
    if (lines[3]) setCellText(ws, "A51", lines[3]);
  }

  const removedIdentity = [text(report.brand), text(report.model), text(report.serial)].filter(Boolean).join(" / ");
  const installedIdentity = [text(report.newBrand), text(report.newModel), text(report.newSerial)].filter(Boolean).join(" / ");
  setCellText(ws, "E53", removedIdentity);
  setCellText(ws, "E54", text(report.physicalState));
  setCellText(ws, "E55", installedIdentity);
  setCellText(ws, "E56", fmtDateOnly(report.dateDismount));
  setCellText(ws, "M56", fmtDateOnly(report.installDate));

  // F. Evidencias y trazabilidad
  const evidenceBeforeAfterPath = pick("evidenceBeforeAfterFile");
  const evidenceLogsPath = pick("evidenceLogsFile");
  const evidenceOtherPath = pick("evidenceOtherFile");
  setCellText(ws, "E59", pick("evidenceTicketRef"));
  setCellText(ws, "E60", toFileName(evidenceBeforeAfterPath) || pick("evidenceBeforeAfter"));
  setCellText(ws, "E61", toFileName(evidenceLogsPath) || pick("evidenceLogs"));
  setCellText(ws, "E62", toFileName(evidenceOtherPath) || pick("evidenceOther"));

  // G. Cierre y conformidad
  setCellText(ws, "E65", pick("finalStatus"));
  setCellText(ws, "M65", pick("closureDateTime", fmtDateTime(report.updatedAt)));
  setCellText(ws, "E66", pick("clientConformity"));
  setCellText(ws, "M66", pick("receiverNameRole"));
  setCellText(ws, "E67", pick("closureNotes"));
  setCellText(ws, "A70", wo.assignedTo?.name || "");

  // Hoja técnica auxiliar con todo el payload (por trazabilidad)
  const debugRows: Array<Array<string>> = [
    ["Campo", "Valor"],
    ["workOrderId", workOrderId],
    ["busCode", busCode],
    ["plate", plate],
    ["ticketNumber", text(report.ticketNumber)],
    ["workOrderNumber", text(report.workOrderNumber)],
    ["deviceType", text(report.deviceType)],
    ["brand", text(report.brand)],
    ["model", text(report.model)],
    ["serial", text(report.serial)],
    ["procedureType", text(report.procedureType)],
    ["failureType", text(report.failureType)],
    ["diagnosis", text(report.diagnosis)],
    ["solution", text(report.solution)],
    ["newBrand", text(report.newBrand)],
    ["newModel", text(report.newModel)],
    ["newSerial", text(report.newSerial)],
  ];
  for (const [k, v] of Object.entries(templateData)) {
    debugRows.push([`templateData.${k}`, text(v)]);
  }
  const existingDebug = workbook.getWorksheet("DATOS_CAPITALDESK");
  if (existingDebug) {
    workbook.removeWorksheet(existingDebug.id);
  }
  const dataSheet = workbook.addWorksheet("DATOS_CAPITALDESK");
  for (const row of debugRows) {
    dataSheet.addRow(row);
  }

  const { embeddedCount, embeddedByCell } = await appendEvidenceImagesSheet(workbook, [
    { label: "Evidencia 1 (antes/después)", relPath: evidenceBeforeAfterPath, sourceCell: "E60" },
    { label: "Evidencia 2 (capturas/logs)", relPath: evidenceLogsPath, sourceCell: "E61" },
    { label: "Evidencia 3 (otros)", relPath: evidenceOtherPath, sourceCell: "E62" },
    { label: "Foto serial actual", relPath: text(report.photoSerialCurrent) },
    { label: "Foto serial nuevo", relPath: text(report.photoSerialNew) },
    { label: "Evidencia desmonte carrocería", relPath: text(report.photoBodyworkDismount) },
  ]);

  for (const cellAddress of ["E60", "E61", "E62"]) {
    if (!embeddedByCell.has(cellAddress)) continue;
    const current = cellValueAsText(ws.getCell(cellAddress));
    ws.getCell(cellAddress).value = current ? `${current} (ver hoja EVIDENCIAS)` : "Ver hoja EVIDENCIAS";
  }
  if (embeddedCount > 0 && !cellValueAsText(ws.getCell("E59"))) {
    ws.getCell("E59").value = `Evidencias embebidas: ${embeddedCount} (ver hoja EVIDENCIAS)`;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const busToken = safeToken(busCode, "BUS");
  const otToken = safeToken(text(report.workOrderNumber || wo.workOrderNo || workOrderId), "OT");
  const filename = `FORMATO-CORRECTIVO-${busToken}-${otToken}.xlsx`;

  return new Response(Buffer.from(buffer as ArrayBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
    },
  });
}
