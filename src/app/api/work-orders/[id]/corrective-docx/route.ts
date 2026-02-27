export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import JSZip from "jszip";
import { readUploadBinary, saveGeneratedUpload } from "@/lib/uploads";

function text(v: unknown) {
  return String(v ?? "").trim();
}

function safeToken(value: string | null | undefined, fallback = "BUS") {
  const clean = String(value ?? "")
    .trim()
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return clean || fallback;
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fileName(value: unknown) {
  return text(value).split("/").pop() ?? "";
}

function fmtDateTime(v: unknown) {
  if (!v) return "";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return text(v);
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(d);
}

function fmtDateOnly(v: unknown) {
  if (!v) return "";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return text(v);
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeZone: "America/Bogota",
  }).format(d);
}

async function resolveTemplatePath() {
  const envPath = text(process.env.CORRECTIVE_DOCX_TEMPLATE_PATH);
  const candidates = [
    envPath,
    path.join(process.cwd(), "Formato_Correctivo_STS_PLANTILLA.docx"),
    path.join(process.cwd(), "Formato_Correctivo_STS.docx"),
    path.join(process.cwd(), "templates", "Formato_Correctivo_STS_PLANTILLA.docx"),
    path.join(process.cwd(), "templates", "Formato_Correctivo_STS.docx"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // continue
    }
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

  const report = wo.correctiveReport as any;
  const templateData =
    report?.templateData && typeof report.templateData === "object" && !Array.isArray(report.templateData)
      ? (report.templateData as Record<string, unknown>)
      : {};
  const pick = (key: string, fallback = "") => text(templateData[key] ?? fallback);

  const busCode = text(report.busCode || wo.case.bus.code);
  const otToken = safeToken(text(report.workOrderNumber || wo.workOrderNo || workOrderId), "OT");
  const busToken = safeToken(busCode, "BUS");
  const filename = `FORMATO-CORRECTIVO-STS-${busToken}-${otToken}.docx`;
  const cachedRelPath = `work-orders/${wo.id}/generated/${filename}`;
  const url = new URL(_req.url);
  const regenerate = String(url.searchParams.get("regenerate") ?? "").toLowerCase() === "true";

  if (!regenerate) {
    const cached = await readUploadBinary(cachedRelPath);
    if (cached) {
      return new Response(cached.buffer, {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "X-Document-Source": `cached-${cached.source}`,
        },
      });
    }
  }

  const workOrderNo = text(
    report.workOrderNumber || (wo.workOrderNo ? `OT-${String(wo.workOrderNo).padStart(3, "0")}` : "")
  );
  const isComponentChange = text(report.procedureType).toUpperCase() === "CAMBIO_COMPONENTE";

  const placeholders: Record<string, string> = {
    NUM_TICKET: text(report.ticketNumber) || "N/A",
    ORDEN_TRABAJO: workOrderNo || "N/A",
    NO_BIARTICULADO: busCode || "N/A",
    NO_PRODUCCION: pick("productionSp") || "N/A",
    PLACA: text(report.plate || wo.case.bus.plate) || "N/A",
    FECHA_HORA: pick("interventionDateTime", fmtDateTime(new Date())),
    TECNICO: text(wo.assignedTo?.name) || "N/A",
    FOTO_BUS:
      fileName(pick("photoBusFile")) ||
      fileName(pick("evidenceBeforeAfterFile")) ||
      fileName(pick("evidenceLogsFile")) ||
      "N/A",
    TIPO_DISPOSITIVO: text(report.deviceType) || "N/A",
    MARCA_DISPOSITIVO: text(report.brand) || "N/A",
    MODELO_DISPOSITIVO: text(report.model) || "N/A",
    SERIAL_DISPOSITIVO: text(report.serial) || "N/A",
    UBICACION: text(report.locationOther || report.location) || "N/A",
    DESCRIPCION_TICKET:
      pick("briefDescription") || pick("symptomNovelty") || text(wo.case.title) || "N/A",
    DIAGNOSTICO: text(report.diagnosis) || "N/A",
    SOLUCION: text(report.solution) || "N/A",
    OTRO_PROCEDIMIENTO: text(report.procedureOther || report.procedureType) || "N/A",
    SERIAL_NUEVO: isComponentChange ? text(report.newSerial) || "N/A" : "NO APLICA",
    FECHA_INSTALACION: isComponentChange ? fmtDateOnly(report.installDate) || "N/A" : "NO APLICA",
    MARCA_NUEVO: isComponentChange ? text(report.newBrand) || "N/A" : "NO APLICA",
    MODELO_NUEVO: isComponentChange ? text(report.newModel) || "N/A" : "NO APLICA",
  };

  const templatePath = await resolveTemplatePath();
  if (!templatePath) {
    return new Response(
      "Plantilla DOCX de correctivo no encontrada. Carga Formato_Correctivo_STS_PLANTILLA.docx en la raiz o templates/.",
      { status: 500 }
    );
  }

  let templateBuffer: Buffer;
  try {
    templateBuffer = await fs.readFile(templatePath);
  } catch (error: any) {
    return new Response(`No se pudo leer la plantilla DOCX: ${String(error?.message ?? error)}`, {
      status: 500,
    });
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(templateBuffer);
  } catch (error: any) {
    return new Response(`Plantilla DOCX invalida: ${String(error?.message ?? error)}`, { status: 500 });
  }

  const docEntry = zip.file("word/document.xml");
  if (!docEntry) return new Response("Plantilla DOCX incompleta (word/document.xml)", { status: 500 });

  let documentXml = await docEntry.async("string");
  for (const [key, value] of Object.entries(placeholders)) {
    documentXml = documentXml.split(`{{${key}}}`).join(xmlEscape(value));
  }
  documentXml = documentXml.replace(/\{\{[^}]+\}\}/g, "");

  zip.file("word/document.xml", documentXml);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  await saveGeneratedUpload(cachedRelPath, buffer, {
    originalName: filename,
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  return new Response(Buffer.from(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Document-Source": "generated",
    },
  });
}
