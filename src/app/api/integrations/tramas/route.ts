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
  tramaType: z.number().int().optional().nullable(),
  tramaSubtype: z.string().trim().max(32).optional().nullable(),
  eventCode: z.string().trim().max(64).optional().nullable(),
  eventLabel: z.string().trim().max(200).optional().nullable(),
  alarmCode: z.string().trim().max(64).optional().nullable(),
  alarmLabel: z.string().trim().max(200).optional().nullable(),
  alarmLevelCode: z.string().trim().max(32).optional().nullable(),
  alarmLevelLabel: z.string().trim().max(120).optional().nullable(),
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

const TIPO2_EVENT_CATALOG: Record<string, string> = {
  EVE1: "Parada en estacion",
  EVE2: "Apertura y cierre de puertas",
  EVE3: "Estado de sistema de ventilacion",
  EVE4: "Estado sistema de iluminacion",
  EVE5: "Estado de sistema limpiaparabrisas",
  EVE6: "Encendido del vehiculo",
  EVE7: "Apagado del vehiculo",
  EVE8: "Cambio de conductor",
  EVE9: "Activacion de boton de panico",
  EVE10: "Accidente o colision",
  EVE11: "Por demanda",
  EVE12: "Desconexion de energia principal",
  EVE13: "Encendido del STS",
  EVE14: "Apagado del STS",
  EVE15: "Inicio de operacion",
  EVE16: "Fin de operacion",
  EVE17: "Reconexion de energia principal de STS",
  EVE18: "Silla vacia del conductor",
};

const TIPO3_ALARM_CATALOG: Record<string, string> = {
  ALA1: "Aceleracion Brusca",
  ALA2: "Frenada Brusca",
  ALA3: "Exceso de velocidad",
  ALA4: "Exceso de Peso",
  ALA5: "Ausencia imagen camara del conductor",
  ALA6: "Ausencia de imagen de alguna camara de CCTV distinta a la del conductor",
  ALA7: "Giro Brusco",
};

const TIPO3_LEVEL_CATALOG: Record<string, string> = {
  N1: "Critico Superior",
  N2: "Tolerable Superior",
  N3: "Normal (no genera alarma)",
  N4: "Tolerable Inferior",
  N5: "Critico Inferior",
};

function textValue(value: unknown): string | null {
  const v = String(value ?? "").trim();
  return v.length ? v : null;
}

function pickText(input: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = textValue(input[key]);
    if (value) return value;
  }
  return null;
}

function hasAnyField(input: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(input, key));
}

function normalizeSeverity(input: string | null): string | null {
  return input ? input.toUpperCase() : null;
}

function normalizeTipo2EventCode(code: string | null): string | null {
  if (!code) return null;
  const normalized = code.toUpperCase().replace(/\s+/g, "");
  const match = normalized.match(/^EVE?(\d{1,2})$/);
  if (!match) return normalized;
  return `EVE${Number(match[1])}`;
}

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  const text = String(value ?? "").trim().toLowerCase();
  if (["true", "si", "sí", "yes", "on"].includes(text)) return true;
  if (["false", "no", "off"].includes(text)) return false;
  return null;
}

function normalizeTipo3AlarmCode(code: string | null): string | null {
  if (!code) return null;
  const normalized = code.toUpperCase().replace(/\s+/g, "");
  const match = normalized.match(/^ALA(\d{1,2})$/);
  if (!match) return normalized;
  return `ALA${Number(match[1])}`;
}

function normalizeTipo3AlarmLevel(level: string | null): { code: string; label: string | null } | null {
  if (!level) return null;
  const normalized = level.toUpperCase().replace(/\s+/g, "");
  const match = normalized.match(/^N(?:IV(?:EL)?)?(\d)$/);
  if (!match) return { code: normalized, label: null };
  const code = `N${Number(match[1])}`;
  return { code, label: TIPO3_LEVEL_CATALOG[code] ?? null };
}

function pickBoolean(input: Record<string, unknown>, keys: string[]): boolean | null {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    const value = normalizeBoolean(input[key]);
    if (value !== null) return value;
  }
  return null;
}

function buildTipo2EventDetail(input: Record<string, unknown>, eventCode: string | null): string | null {
  const details: string[] = [];

  const boolByEvent: Record<string, { keys: string[]; label: string }> = {
    EVE3: { keys: ["estadoSistemaVentilacion"], label: "estadoSistemaVentilacion" },
    EVE4: { keys: ["estadoSistemaIluminacion"], label: "estadoSistemaIluminacion" },
    EVE5: { keys: ["estadoSistemaLimpiaparabrisas"], label: "estadoSistemaLimpiaparabrisas" },
    EVE9: { keys: ["activacionBotonPanico", "estadoBotonPanico"], label: "botonPanico" },
    EVE18: { keys: ["sillaVaciaConductor"], label: "sillaVaciaConductor" },
  };

  const boolConfig = eventCode ? boolByEvent[eventCode] : undefined;
  if (boolConfig) {
    const value = pickBoolean(input, boolConfig.keys);
    if (value !== null) details.push(`${boolConfig.label}: ${value ? "true" : "false"}`);
  } else {
    for (const [key, raw] of Object.entries(input)) {
      const value = normalizeBoolean(raw);
      if (value !== null) {
        details.push(`${key}: ${value ? "true" : "false"}`);
        break;
      }
    }
  }

  const photoRaw = pickText(input, ["fotoConductor", "foto_conductor", "imagenConductor"]);
  if (photoRaw) {
    details.push(`fotoConductor: base64 (${photoRaw.length} chars)`);
  }

  return details.length ? details.join(" | ") : null;
}

function buildTipo3AlarmDetail(input: Record<string, unknown>): string | null {
  const details: string[] = [];

  const peso = textValue(input.peso);
  if (peso) details.push(`peso: ${peso}`);

  const velocidad = pickText(input, ["velocidad", "velocidadVehiculo"]);
  if (velocidad) details.push(`velocidad: ${velocidad}`);

  const cameraRef = pickText(input, ["idCamara", "camara", "camaraAfectada", "ubicacionCamara"]);
  if (cameraRef) details.push(`camara: ${cameraRef}`);

  const photoRaw = pickText(input, ["fotoConductor", "foto", "imagen"]);
  if (photoRaw) {
    details.push(`foto: base64 (${photoRaw.length} chars)`);
  }

  return details.length ? details.join(" | ") : null;
}

function classifyTipo1Trama(input: Record<string, unknown>): "P20" | "P60" {
  const p20FixedKeys = new Set(["velocidadVehiculo", "aceleracionVehiculo"]);
  const orderedKeys = Object.keys(input);
  const idxTipoFreno = orderedKeys.indexOf("tipoFreno");

  if (idxTipoFreno >= 0) {
    const keysAfterTipoFreno = orderedKeys.slice(idxTipoFreno + 1);
    if (keysAfterTipoFreno.length > 0) {
      const nonP20Keys = keysAfterTipoFreno.filter((key) => !p20FixedKeys.has(key));
      return nonP20Keys.length === 0 ? "P20" : "P60";
    }
  }

  // Fallback por presencia de llaves cuando no se puede usar el orden del payload.
  const hasExtended = hasAnyField(input, [
    "temperaturaMotor",
    "presionAceiteMotor",
    "revolucionesMotor",
    "estadoDesgasteFrenos",
    "kilometrosOdometro",
    "consumoCombustible",
    "nivelTanqueCombustible",
    "consumoEnergia",
    "regeneracionEnergia",
    "nivelRestanteEnergia",
    "porcentajeEnergiaGenerada",
    "sentidoMarcha",
  ]);
  if (hasExtended) return "P60";

  return "P20";
}

function mapFromEtbRawEvent(input: Record<string, unknown>): CanonicalEvent | null {
  const externalId = String(input.idRegistro ?? "").trim();
  const busCode = String(input.idVehiculo ?? "").trim();
  if (!externalId || !busCode) return null;

  const tipoTrama = Number(input.tipoTrama);
  const tipoTramaValid = Number.isFinite(tipoTrama) ? tipoTrama : null;
  const codigoEvento = pickText(input, ["codigoEvento", "idEvento", "evento", "eventCode"]);
  const codigoEventoTipo2 = normalizeTipo2EventCode(codigoEvento);
  const descripcionEvento = pickText(input, [
    "descripcionEvento",
    "detalleEvento",
    "mensaje",
    "descripcion",
  ]);

  let kind: StsTelemetryKind = StsTelemetryKind.TRAMAS;
  let eventType = tipoTramaValid !== null ? `TRAMA_${tipoTramaValid}` : "TRAMA";
  let severity: string | null = null;
  let timeline = false;
  let message: string | null = null;
  let subtype: string | null = null;
  let alarmCode: string | null = null;
  let alarmLabel: string | null = null;
  let alarmLevelCode: string | null = null;
  let alarmLevelLabel: string | null = null;

  if (tipoTramaValid === 1) {
    subtype = classifyTipo1Trama(input);
    kind = StsTelemetryKind.TRAMAS;
    eventType = subtype;
    message = `Trama ${subtype}`;
    timeline = false;
  } else if (tipoTramaValid === 2) {
    kind = StsTelemetryKind.EVENTOS;
    eventType = `EVENTO:${codigoEventoTipo2 ?? codigoEvento ?? "SIN_CODIGO"}`;
    severity = normalizeSeverity(
      pickText(input, ["nivelEvento", "severidadEvento", "severity", "nivel"])
    );
    const eventLabel = codigoEventoTipo2 ? TIPO2_EVENT_CATALOG[codigoEventoTipo2] ?? null : null;
    const detail = buildTipo2EventDetail(input, codigoEventoTipo2);
    const primary = eventLabel ?? descripcionEvento ?? codigoEventoTipo2 ?? codigoEvento;
    message = [primary, detail].filter(Boolean).join(" • ") || null;
    timeline = true;
  } else if (tipoTramaValid === 3) {
    const codigoAlarmaRaw = pickText(input, [
      "codigoAlarma",
      "idAlarma",
      "alarma",
      "codigoEvento",
      "eventCode",
    ]);
    alarmCode = normalizeTipo3AlarmCode(codigoAlarmaRaw) ?? codigoAlarmaRaw;
    const rawLevel = pickText(input, ["nivelAlarma", "nivel", "severidad", "severity", "prioridad"]);
    const normalizedLevel = normalizeTipo3AlarmLevel(rawLevel);
    alarmLevelCode = normalizedLevel?.code ?? normalizeSeverity(rawLevel);
    alarmLevelLabel = normalizedLevel?.label ?? null;
    alarmLabel = alarmCode ? TIPO3_ALARM_CATALOG[alarmCode] ?? null : null;
    kind = StsTelemetryKind.ALARMAS;
    eventType = `ALARMA:${alarmCode ?? "SIN_CODIGO"}`;
    severity = alarmLevelCode;
    const detail = buildTipo3AlarmDetail(input);
    const primary = alarmLabel ?? descripcionEvento ?? alarmCode;
    const levelPart = alarmLevelCode
      ? `${alarmLevelCode}${alarmLevelLabel ? ` ${alarmLevelLabel}` : ""}`
      : null;
    message = [primary, levelPart, detail].filter(Boolean).join(" • ") || null;
    timeline = true;
  } else {
    eventType = codigoEvento || eventType;
    severity = tipoTramaValid === 2 ? "HIGH" : null;
    message = descripcionEvento ?? codigoEvento;
    timeline = tipoTramaValid === 2 || Boolean(codigoEvento);
  }

  return {
    externalId,
    busCode,
    kind,
    tramaType: tipoTramaValid,
    tramaSubtype: subtype,
    eventCode: codigoEventoTipo2 ?? codigoEvento,
    eventLabel: codigoEventoTipo2 ? TIPO2_EVENT_CATALOG[codigoEventoTipo2] ?? null : null,
    alarmCode,
    alarmLabel,
    alarmLevelCode,
    alarmLevelLabel,
    eventType,
    severity,
    message,
    eventAt: String(
      input.fechaHoraLecturaDato ?? input.fechaHoraEnvioDato ?? ""
    ).trim() || null,
    timeline,
    payload: {
      ...input,
      classification: {
        tipoTrama: tipoTramaValid,
        kind,
        subtype,
        eventCode: codigoEventoTipo2 ?? codigoEvento,
        eventLabel: codigoEventoTipo2 ? TIPO2_EVENT_CATALOG[codigoEventoTipo2] ?? null : null,
        alarmCode,
        alarmLabel,
        alarmLevelCode,
        alarmLevelLabel,
      },
    },
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
      const payloadClassification =
        typeof payloadBase.classification === "object" && payloadBase.classification !== null
          ? (payloadBase.classification as Record<string, unknown>)
          : null;
      const tramaTypeFromPayload = Number(payloadClassification?.tipoTrama);
      const tramaType =
        item.tramaType ??
        (Number.isFinite(tramaTypeFromPayload) ? Math.trunc(tramaTypeFromPayload) : null);
      const tramaSubtype =
        item.tramaSubtype ??
        (payloadClassification ? pickText(payloadClassification, ["subtype"]) : null);
      const eventCode =
        item.eventCode ??
        (payloadClassification ? pickText(payloadClassification, ["eventCode"]) : null);
      const eventLabel =
        item.eventLabel ??
        (payloadClassification ? pickText(payloadClassification, ["eventLabel"]) : null);
      const alarmCode =
        item.alarmCode ??
        (payloadClassification ? pickText(payloadClassification, ["alarmCode"]) : null);
      const alarmLabel =
        item.alarmLabel ??
        (payloadClassification ? pickText(payloadClassification, ["alarmLabel"]) : null);
      const alarmLevelCode =
        item.alarmLevelCode ??
        (payloadClassification ? pickText(payloadClassification, ["alarmLevelCode"]) : null);
      const alarmLevelLabel =
        item.alarmLevelLabel ??
        (payloadClassification ? pickText(payloadClassification, ["alarmLevelLabel"]) : null);

      return {
        tenantId: tenant.id,
        busId,
        busCode,
        source,
        externalId: item.externalId,
        kind: item.kind ?? StsTelemetryKind.TRAMAS,
        tramaType,
        tramaSubtype,
        eventCode,
        eventLabel,
        alarmCode,
        alarmLabel,
        alarmLevelCode,
        alarmLevelLabel,
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
