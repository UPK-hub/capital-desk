// src/app/api/integrations/tramas-last/route.ts
//
// Consulta de solo lectura para el bot de tramas: dado el código de un bus,
// devuelve la ÚLTIMA trama P20 y la ÚLTIMA P60 que registró ese bus.
// Se autentica con el mismo secreto de integración (header x-integration-secret
// == NOVEDADES_INTAKE_SECRET).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { StsTelemetryKind } from "@prisma/client";

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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

// Busca el bus por código; si no aparece y es solo dígitos, prueba con "K".
async function findBus(tenantId: string, codeRaw: unknown) {
  const code = String(codeRaw ?? "").trim();
  if (!code) return null;
  // Match insensible a mayúsculas/minúsculas: k1402 = K1402.
  let bus = await prisma.bus.findFirst({
    where: { tenantId, code: { equals: code, mode: "insensitive" } },
    select: { id: true, code: true, plate: true },
  });
  // Si escribieron solo el número (1402), probar con prefijo "K".
  if (!bus && /^\d+$/.test(code)) {
    bus = await prisma.bus.findFirst({
      where: { tenantId, code: { equals: `K${code}`, mode: "insensitive" } },
      select: { id: true, code: true, plate: true },
    });
  }
  return bus;
}

async function lastTrama(tenantId: string, busCode: string, subtype: "P20" | "P60") {
  const e = await prisma.integrationInboundEvent.findFirst({
    where: {
      tenantId,
      busCode,
      kind: StsTelemetryKind.TRAMAS,
      tramaSubtype: { equals: subtype, mode: "insensitive" },
    },
    orderBy: [{ eventAt: { sort: "desc", nulls: "last" } }, { receivedAt: "desc" }],
    select: { eventAt: true, receivedAt: true, message: true, payload: true },
  });
  if (!e) return null;

  // Devolvemos el payload completo; el bot lo muestra con etiquetas claras.
  return {
    eventAt: e.eventAt ? e.eventAt.toISOString() : null,
    receivedAt: e.receivedAt.toISOString(),
    message: e.message ?? null,
    payload: (e.payload ?? null) as any,
  };
}

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

  const [p20, p60] = await Promise.all([
    lastTrama(tenant.id, bus.code, "P20"),
    lastTrama(tenant.id, bus.code, "P60"),
  ]);

  return NextResponse.json({
    ok: true,
    found: true,
    bus: { code: bus.code, plate: bus.plate ?? null },
    p20,
    p60,
  });
}
