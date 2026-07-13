// src/app/api/integrations/preventivo-last/route.ts
//
// Consulta de solo lectura para el bot de preventivos: dado el código de un bus,
// devuelve su ÚLTIMO mantenimiento preventivo (fecha, OT, técnico, estado), las
// observaciones del reporte y los correctivos generados durante ese preventivo.
// Auth: header x-integration-secret == NOVEDADES_INTAKE_SECRET.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CaseEventType, CaseStatus, CaseType } from "@prisma/client";

const DEFAULT_TENANT_CODE = (
  process.env.NOVEDADES_TENANT_CODE ||
  process.env.TENANT_CODE ||
  "CAPITALBUS"
)
  .trim()
  .toUpperCase();

function normalizeCode(input: unknown): string {
  return String(input ?? "").trim().toUpperCase();
}

function checkSecret(req: NextRequest): NextResponse | null {
  const expected = (process.env.NOVEDADES_INTAKE_SECRET || "").trim();
  if (!expected) {
    return NextResponse.json(
      { error: "Consulta no configurada (falta NOVEDADES_INTAKE_SECRET)." },
      { status: 503 }
    );
  }
  if ((req.headers.get("x-integration-secret") || "") !== expected) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  return null;
}

async function findBus(tenantId: string, codeRaw: unknown) {
  const code = String(codeRaw ?? "").trim();
  if (!code) return null;
  let bus = await prisma.bus.findFirst({
    where: { tenantId, code: { equals: code, mode: "insensitive" } },
    select: { id: true, code: true, plate: true },
  });
  if (!bus && /^\d+$/.test(code)) {
    bus = await prisma.bus.findFirst({
      where: { tenantId, code: { equals: `K${code}`, mode: "insensitive" } },
      select: { id: true, code: true, plate: true },
    });
  }
  return bus;
}

const STATUS_LABEL: Record<string, string> = {
  NUEVO: "Nuevo",
  OT_ASIGNADA: "OT asignada",
  EN_EJECUCION: "En ejecución",
  RESUELTO: "Resuelto",
  CERRADO: "Cerrado",
};

export async function GET(req: NextRequest) {
  const unauth = checkSecret(req);
  if (unauth) return unauth;

  const url = new URL(req.url);
  const tenantCode = normalizeCode(url.searchParams.get("tenantCode")) || DEFAULT_TENANT_CODE;
  const tenant = await prisma.tenant.findUnique({
    where: { code: tenantCode },
    select: { id: true },
  });
  if (!tenant) return NextResponse.json({ error: "Tenant no encontrado." }, { status: 400 });

  const bus = await findBus(tenant.id, url.searchParams.get("busCode"));
  if (!bus) return NextResponse.json({ ok: true, found: false });

  // Último preventivo del bus (el más reciente).
  const prev = await prisma.case.findFirst({
    where: { tenantId: tenant.id, busId: bus.id, type: CaseType.PREVENTIVO },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      caseNo: true,
      status: true,
      createdAt: true,
      workOrder: {
        select: {
          workOrderNo: true,
          finishedAt: true,
          assignedTo: { select: { name: true } },
          preventiveReport: { select: { observations: true, executedAt: true } },
        },
      },
      events: {
        where: { type: CaseEventType.STATUS_CHANGE },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  if (!prev) {
    return NextResponse.json({
      ok: true,
      found: true,
      bus: { code: bus.code, plate: bus.plate ?? null },
      preventivo: null,
    });
  }

  // Correctivos generados durante ese preventivo (su descripción referencia el id).
  const correctivos = await prisma.case.findMany({
    where: {
      tenantId: tenant.id,
      type: CaseType.CORRECTIVO,
      description: { contains: prev.id },
    },
    orderBy: { caseNo: "asc" },
    select: { caseNo: true, status: true },
  });

  const wo = prev.workOrder;
  // Fecha real del mantenimiento: el último cambio de estado (cuando pasó a
  // resuelto/cerrado, de donde el sistema toma las fechas de resolución); si no,
  // la finalización de la OT; si no, lo reportado por el técnico; si no, creación.
  const fecha =
    prev.events?.[0]?.createdAt ??
    wo?.finishedAt ??
    wo?.preventiveReport?.executedAt ??
    prev.createdAt;

  return NextResponse.json({
    ok: true,
    found: true,
    bus: { code: bus.code, plate: bus.plate ?? null },
    preventivo: {
      caseNo: prev.caseNo ?? null,
      ref: `CASO-${String(prev.caseNo ?? "").padStart(3, "0")}`,
      status: prev.status,
      statusLabel: STATUS_LABEL[prev.status] ?? prev.status,
      cerrado: prev.status === CaseStatus.CERRADO,
      fecha: fecha ? new Date(fecha).toISOString() : null,
      otNo: wo?.workOrderNo ?? null,
      tecnico: wo?.assignedTo?.name ?? null,
      observaciones: wo?.preventiveReport?.observations ?? null,
      correctivos: correctivos.map((c) => ({
        ref: `CASO-${String(c.caseNo ?? "").padStart(3, "0")}`,
        status: c.status,
      })),
    },
  });
}
