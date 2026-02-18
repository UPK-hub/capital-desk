export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { IntegrationInboundStatus, Role, StsTelemetryKind } from "@prisma/client";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/security/client-ip";
import {
  normalizeBusCode,
  normalizeInboundDate,
  processInboundTelemetryBatch,
} from "@/lib/integrations/tramas";

const CanonicalEventSchema = z.object({
  externalId: z.string().trim().min(1).max(191),
  busCode: z.string().trim().min(1).max(64),
  kind: z.nativeEnum(StsTelemetryKind).optional().default(StsTelemetryKind.TRAMAS),
  eventType: z.string().trim().min(1).max(120),
  severity: z.string().trim().max(40).optional().nullable(),
  message: z.string().trim().max(500).optional().nullable(),
  eventAt: z.string().trim().max(80).optional().nullable(),
  payload: z.unknown().optional(),
  timeline: z.boolean().optional(),
});

const EnvelopeSchema = z.object({
  tenantCode: z.string().trim().min(1).max(64).optional(),
  source: z.string().trim().min(1).max(80).optional(),
  events: z.array(z.unknown()).min(1).max(5000).optional(),
  event: z.unknown().optional(),
  processInline: z.boolean().optional(),
  processLimit: z.number().int().min(1).max(1000).optional(),
});

type ParsedEnvelope = z.infer<typeof EnvelopeSchema> & {
  events: unknown[];
};

function normalizeEnvelope(input: unknown): unknown {
  if (Array.isArray(input)) return { events: input };
  if (!input || typeof input !== "object") return input;

  const obj = input as Record<string, unknown>;
  if ("events" in obj || "event" in obj || "tenantCode" in obj) return obj;
  if ("externalId" in obj && "busCode" in obj) return { event: obj };
  // ETB raw event (single object)
  if ("idRegistro" in obj && "idVehiculo" in obj) return { event: obj };
  return obj;
}

function finalizeEnvelope(parsed: z.infer<typeof EnvelopeSchema>): ParsedEnvelope {
  const events = parsed.events ?? (parsed.event ? [parsed.event] : []);
  return { ...parsed, events };
}

type CanonicalEvent = z.infer<typeof CanonicalEventSchema>;

function mapFromEtbRawEvent(input: Record<string, unknown>): CanonicalEvent | null {
  const externalId = String(input.idRegistro ?? "").trim();
  const busCode = String(input.idVehiculo ?? "").trim();
  if (!externalId || !busCode) return null;

  const tipoTrama = Number(input.tipoTrama);
  const tipoTramaValid = Number.isFinite(tipoTrama) ? tipoTrama : null;
  const codigoEvento = String(input.codigoEvento ?? "").trim();

  const eventType =
    codigoEvento ||
    (tipoTramaValid !== null ? `TRAMA_${tipoTramaValid}` : "TRAMA");

  const severity = tipoTramaValid === 2 ? "HIGH" : null;
  const timeline = tipoTramaValid === 2 || Boolean(codigoEvento);

  return {
    externalId,
    busCode,
    kind: StsTelemetryKind.TRAMAS,
    eventType,
    severity,
    message: codigoEvento || null,
    eventAt: String(
      input.fechaHoraLecturaDato ?? input.fechaHoraEnvioDato ?? ""
    ).trim() || null,
    timeline,
    payload: input,
  };
}

function normalizeInboundEvent(raw: unknown):
  | { ok: true; event: CanonicalEvent }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Evento no es objeto JSON válido" };
  }

  const asObj = raw as Record<string, unknown>;

  // 1) Formato canónico (ya adaptado por integrador)
  const canonical = CanonicalEventSchema.safeParse(asObj);
  if (canonical.success) return { ok: true, event: canonical.data };

  // 2) Formato ETB crudo (register.log)
  const mapped = mapFromEtbRawEvent(asObj);
  if (mapped) {
    const parsedMapped = CanonicalEventSchema.safeParse(mapped);
    if (parsedMapped.success) return { ok: true, event: parsedMapped.data };
  }

  return {
    ok: false,
    error:
      "Evento inválido: requiere externalId+busCode (canónico) o idRegistro+idVehiculo (ETB crudo)",
  };
}

async function resolveTenant(params: {
  tenantCode: string | null;
  fallbackTenantId: string | null;
}) {
  if (params.tenantCode) {
    return prisma.tenant.findUnique({
      where: { code: params.tenantCode },
      select: { id: true, code: true },
    });
  }

  if (params.fallbackTenantId) {
    return prisma.tenant.findUnique({
      where: { id: params.fallbackTenantId },
      select: { id: true, code: true },
    });
  }

  return null;
}

export async function POST(req: NextRequest) {
  const integrationSecret = process.env.INTEGRATION_INGEST_SECRET;
  const incomingSecret = req.headers.get("x-integration-secret");

  let fallbackTenantId: string | null = null;

  if (integrationSecret) {
    if (!incomingSecret || incomingSecret !== integrationSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    const session = await getServerSession(authOptions);
    const role = session?.user?.role as Role | undefined;
    if (!session?.user || (role !== Role.ADMIN && role !== Role.BACKOFFICE)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    fallbackTenantId = (session.user as any).tenantId as string;
  }

  const body = await req.json().catch(() => null);
  const normalized = normalizeEnvelope(body);
  const parsed = EnvelopeSchema.safeParse(normalized);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Payload inválido",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  const envelope = finalizeEnvelope(parsed.data);
  if (!envelope.events.length) {
    return NextResponse.json({ error: "Debes enviar al menos un evento" }, { status: 400 });
  }

  const tenantCode =
    envelope.tenantCode ??
    req.headers.get("x-tenant-code") ??
    process.env.INTEGRATION_DEFAULT_TENANT_CODE ??
    null;

  const tenant = await resolveTenant({ tenantCode, fallbackTenantId });
  if (!tenant) {
    return NextResponse.json(
      {
        error: "Tenant no encontrado",
        details: "Envía tenantCode en body/header o configura INTEGRATION_DEFAULT_TENANT_CODE",
      },
      { status: 400 }
    );
  }

  const source = envelope.source ?? req.headers.get("x-source") ?? "etb-http";
  const processInline =
    envelope.processInline ?? process.env.INTEGRATION_PROCESS_INLINE === "true";
  const processLimit = envelope.processLimit ?? 200;

  const normalizedEvents: CanonicalEvent[] = [];
  const invalidEvents: Array<{ index: number; error: string }> = [];
  envelope.events.forEach((item, index) => {
    const normalized = normalizeInboundEvent(item);
    if (!normalized.ok) {
      invalidEvents.push({ index, error: normalized.error });
      return;
    }
    normalizedEvents.push(normalized.event);
  });

  if (invalidEvents.length) {
    return NextResponse.json(
      {
        error: "Payload inválido",
        details: "Algunos eventos no cumplen el formato esperado",
        invalid: invalidEvents.slice(0, 20),
      },
      { status: 400 }
    );
  }

  const uniqueByExternalId = new Map<string, CanonicalEvent>();
  for (const item of normalizedEvents) {
    uniqueByExternalId.set(item.externalId, item);
  }
  const dedupedEvents = Array.from(uniqueByExternalId.values());
  const externalIds = dedupedEvents.map((item) => item.externalId);

  const existing = await prisma.integrationInboundEvent.findMany({
    where: {
      tenantId: tenant.id,
      externalId: { in: externalIds },
    },
    select: { externalId: true },
  });
  const existingSet = new Set(existing.map((row) => row.externalId));

  const busCodes = Array.from(
    new Set(dedupedEvents.map((item) => normalizeBusCode(item.busCode)).filter(Boolean))
  );
  const buses = busCodes.length
    ? await prisma.bus.findMany({
        where: { tenantId: tenant.id, code: { in: busCodes } },
        select: { id: true, code: true },
      })
    : [];
  const busByCode = new Map(buses.map((bus) => [normalizeBusCode(bus.code), bus.id]));

  const requestMeta = {
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent"),
    contentType: req.headers.get("content-type"),
    host: req.headers.get("host"),
    sourceHeader: req.headers.get("x-source"),
  };

  const rowsToCreate = dedupedEvents
    .filter((item) => !existingSet.has(item.externalId))
    .map((item) => {
      const busCode = normalizeBusCode(item.busCode);
      const busId = busByCode.get(busCode) ?? null;
      const payloadBase =
        item.payload !== undefined && item.payload !== null
          ? typeof item.payload === "object"
            ? (item.payload as Record<string, unknown>)
            : { value: item.payload }
          : {};
      const payload = { ...payloadBase, timeline: item.timeline ?? false };

      return {
        tenantId: tenant.id,
        busId,
        busCode,
        source,
        externalId: item.externalId,
        kind: item.kind ?? StsTelemetryKind.TRAMAS,
        eventType: item.eventType,
        severity: item.severity ?? null,
        message: item.message ?? null,
        eventAt: normalizeInboundDate(item.eventAt),
        payload,
        status: IntegrationInboundStatus.RECEIVED,
        requestMeta,
      };
    });

  if (rowsToCreate.length) {
    await prisma.integrationInboundEvent.createMany({
      data: rowsToCreate,
      skipDuplicates: true,
    });
  }

  let processing: Awaited<ReturnType<typeof processInboundTelemetryBatch>> | null = null;
  if (processInline) {
    processing = await processInboundTelemetryBatch({
      tenantId: tenant.id,
      limit: processLimit,
    });
  }

  return NextResponse.json({
    ok: true,
    tenant: tenant.code,
    received: envelope.events.length,
    deduped: dedupedEvents.length,
    inserted: rowsToCreate.length,
    duplicates: existingSet.size,
    unknownBusCodes: Array.from(
      new Set(rowsToCreate.filter((row) => !row.busId).map((row) => row.busCode))
    ),
    processing,
  });
}
