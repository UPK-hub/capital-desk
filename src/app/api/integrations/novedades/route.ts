// src/app/api/integrations/novedades/route.ts
//
// Ingesta de novedades reportadas por clientes desde canales externos
// (ej. el bot de Telegram). Crea SOLO el caso NOVEDAD (estado NUEVO) para que
// el equipo lo revise y decida si genera correctivo/OT. No requiere sesión de
// navegador: se autentica con un secreto compartido en el header
// `x-integration-secret` (env NOVEDADES_INTAKE_SECRET), siguiendo el mismo
// patrón que /api/integrations/tramas.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { nextNumbers } from "@/lib/tenant-sequence";
import { saveUpload } from "@/lib/uploads";
import { notifyTenantUsers } from "@/lib/notifications";
import { CaseEventType, CaseStatus, NotificationType, Role } from "@prisma/client";

const DEFAULT_TENANT_CODE = (
  process.env.NOVEDADES_TENANT_CODE ||
  process.env.TENANT_CODE ||
  "CAPITALBUS"
)
  .trim()
  .toUpperCase();

// Etiquetas legibles para los equipos del catálogo de novedades.
const EQUIPMENT_LABELS: Record<string, string> = {
  NVR: "NVR / Grabador",
  CAMARAS: "Cámaras",
  ROUTER_SIM: "Router / SIM (comunicación)",
  SWITCH_POE: "Switch PoE",
  GPS: "GPS",
  CMS: "CMS / Plataforma",
  IO_SENSORES: "Sensores / I-O",
  FIRMWARE: "Firmware",
  SOFTWARE: "Software",
  PARAMETRIZACION: "Parametrización",
  OTRO: "Otro",
};

function normalizeCode(input: unknown): string {
  return String(input ?? "").trim().toUpperCase();
}

type Evidence = {
  filePath: string;
  fileName: string;
  mimeType: string;
  size: number;
};

export async function POST(req: NextRequest) {
  // 1) Autenticación por secreto compartido.
  const expected = (process.env.NOVEDADES_INTAKE_SECRET || "").trim();
  if (!expected) {
    return NextResponse.json(
      { error: "Intake no configurado (falta NOVEDADES_INTAKE_SECRET)." },
      { status: 503 }
    );
  }
  const provided = req.headers.get("x-integration-secret") || "";
  if (provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2) Leer cuerpo: JSON simple o multipart (cuando incluye foto).
  const contentType = req.headers.get("content-type") ?? "";
  let body: any = {};
  let evidenceFile: File | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ error: "Formulario inválido." }, { status: 400 });
    }
    const payload = form.get("payload");
    try {
      body = JSON.parse(typeof payload === "string" ? payload : "{}");
    } catch {
      return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
    }
    const f = form.get("evidence");
    if (f instanceof File && f.size > 0) evidenceFile = f;
  } else {
    body = await req.json().catch(() => ({}));
  }

  // 3) Normalizar y validar campos.
  const busCode = normalizeCode(body.busCode);
  const reportedNovelty = String(body.reportedNovelty ?? body.description ?? "").trim();
  const affectedEquipmentRaw = String(body.affectedEquipment ?? "").trim().toUpperCase();
  const observations = String(body.observations ?? "").trim();
  const reporterName = String(body.reporterName ?? body?.reporter?.name ?? "").trim();
  const reporterPhone = String(body.reporterPhone ?? body?.reporter?.phone ?? "").trim();
  const source = (String(body.source ?? "telegram").trim() || "telegram").slice(0, 40);
  const tenantCode = normalizeCode(body.tenantCode) || DEFAULT_TENANT_CODE;

  if (!busCode) {
    return NextResponse.json({ error: "Falta el código del bus." }, { status: 400 });
  }
  if (reportedNovelty.length < 3) {
    return NextResponse.json(
      { error: "La novedad reportada es muy corta." },
      { status: 400 }
    );
  }

  const affectedEquipment = affectedEquipmentRaw || "NO_ESPECIFICADO";
  const affectedEquipmentLabel = EQUIPMENT_LABELS[affectedEquipment] ?? affectedEquipment;

  // 4) Resolver tenant y bus (por código).
  const tenant = await prisma.tenant.findUnique({
    where: { code: tenantCode },
    select: { id: true, code: true },
  });
  if (!tenant) {
    return NextResponse.json(
      { error: `Tenant no encontrado (${tenantCode}).` },
      { status: 400 }
    );
  }

  const bus = await prisma.bus.findFirst({
    where: { tenantId: tenant.id, code: busCode },
    select: { id: true, code: true, plate: true },
  });
  if (!bus) {
    return NextResponse.json(
      { error: `No encontré el bus con código ${busCode}.`, code: "BUS_NOT_FOUND" },
      { status: 404 }
    );
  }

  // 5) Guardar evidencia (si vino). No bloquea el registro si falla.
  let evidence: Evidence | null = null;
  if (evidenceFile) {
    try {
      const filePath = await saveUpload(evidenceFile, `novedades/telegram/${bus.code}`, {
        fileNamePrefix: bus.code,
      });
      evidence = {
        filePath,
        fileName: evidenceFile.name || "evidencia",
        mimeType: evidenceFile.type || "application/octet-stream",
        size: evidenceFile.size,
      };
    } catch (e) {
      console.error("NOVEDAD_TELEGRAM_EVIDENCE_FAILED", e);
    }
  }

  // 6) Crear SOLO el caso NOVEDAD.
  const description = [
    `Equipo afectado: ${affectedEquipmentLabel}`,
    `Novedad reportada: ${reportedNovelty}`,
    observations ? `Observaciones: ${observations}` : null,
    reporterName || reporterPhone
      ? `Reportado por: ${[reporterName, reporterPhone].filter(Boolean).join(" · ")}`
      : null,
    `Canal: ${source}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const created = await prisma.$transaction(
      async (tx) => {
        const { caseNo } = await nextNumbers(tx as any, tenant.id, { case: true });

        const noveltyCase = await tx.case.create({
          data: {
            tenantId: tenant.id,
            caseNo: caseNo!,
            type: "NOVEDAD",
            status: CaseStatus.NUEVO,
            priority: 3,
            title: `Novedad ${bus.code} - ${reportedNovelty}`.slice(0, 180),
            description,
            busId: bus.id,
          },
        });

        await tx.caseEvent.createMany({
          data: [
            {
              caseId: noveltyCase.id,
              type: CaseEventType.CREATED,
              message: "Novedad reportada por cliente (Telegram).",
              meta: {
                source,
                channel: "telegram",
                reporter: { name: reporterName || null, phone: reporterPhone || null },
                affectedEquipment,
                affectedEquipmentLabel,
                reportedNovelty,
                observations: observations || null,
                evidence,
              },
            },
            {
              caseId: noveltyCase.id,
              type: CaseEventType.COMMENT,
              message:
                "Hemos recibido su novedad y está pendiente de revisión por el equipo.",
              meta: { automated: true, source },
            },
            ...(evidence
              ? [
                  {
                    caseId: noveltyCase.id,
                    type: CaseEventType.COMMENT,
                    message: "Evidencia adjunta por el cliente.",
                    meta: { source, evidence },
                  },
                ]
              : []),
          ],
        });

        return noveltyCase;
      },
      { maxWait: 10000, timeout: 20000 }
    );

    // 7) Avisar a quienes triagean. In-app por defecto; correo si se activa.
    const sendEmail =
      String(process.env.NOVEDADES_NOTIFY_EMAIL ?? "false").toLowerCase() === "true";
    await notifyTenantUsers({
      tenantId: tenant.id,
      roles: [Role.SUPERVISOR, Role.PLANNER],
      type: NotificationType.CASE_CREATED,
      title: `Nueva novedad de cliente (${bus.code})`,
      body: `CASO-${String(created.caseNo ?? "").padStart(3, "0")} · ${affectedEquipmentLabel} · ${reportedNovelty}`.slice(
        0,
        240
      ),
      meta: { caseId: created.id, source, busCode: bus.code },
      sendEmail,
    });

    return NextResponse.json({
      ok: true,
      caseId: created.id,
      caseNo: created.caseNo ?? null,
      caseRef: `CASO-${String(created.caseNo ?? "").padStart(3, "0")}`,
      bus: { code: bus.code, plate: bus.plate ?? null },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "No se pudo registrar la novedad.", detail: e?.message ?? String(e) },
      { status: 400 }
    );
  }
}
