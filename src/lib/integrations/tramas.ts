import { IntegrationInboundStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function normalizeText(value: unknown): string | null {
  const v = String(value ?? "").trim();
  return v.length ? v : null;
}

function normalizeSeverity(value: unknown): string | null {
  const raw = normalizeText(value);
  return raw ? raw.toUpperCase() : null;
}

function parseEventDate(value: unknown): Date | null {
  const raw = normalizeText(value);
  if (!raw) return null;

  // Formato ETB esperado: dd/MM/yyyy HH:mm:ss.SS (sin zona horaria)
  const etbMatch = raw.match(
    /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})(?:[.,](\d{1,3}))?$/
  );
  if (etbMatch) {
    const day = Number(etbMatch[1]);
    const month = Number(etbMatch[2]);
    const year = Number(etbMatch[3]);
    const hh = Number(etbMatch[4]);
    const mm = Number(etbMatch[5]);
    const ss = Number(etbMatch[6]);
    const frac = etbMatch[7] ?? "0";
    const ms =
      frac.length === 1 ? Number(frac) * 100 : frac.length === 2 ? Number(frac) * 10 : Number(frac);

    if ([day, month, year, hh, mm, ss, ms].every((n) => Number.isFinite(n))) {
      const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${String(ms).padStart(3, "0")}-05:00`;
      const date = new Date(iso);
      if (!Number.isNaN(date.getTime())) return date;
    }
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function shouldCreateLifecycleEvent(params: {
  eventType: string;
  severity: string | null;
  payload: unknown;
}): boolean {
  const payload = (params.payload ?? {}) as Record<string, unknown>;
  if (Boolean(payload.timeline)) return true;

  const severity = String(params.severity ?? "").toUpperCase();
  if (["EMERGENCY", "CRITICAL", "HIGH", "ALTA"].includes(severity)) return true;

  const event = String(params.eventType ?? "").toUpperCase();
  const keywords = [
    "PANIC",
    "PÁNICO",
    "ALARM",
    "ALARMA",
    "OFFLINE",
    "ONLINE",
    "DESCONECT",
    "SIN TRAMA",
    "SIN VIDEO",
    "FALLA",
    "FAIL",
    "ERROR",
  ];

  return keywords.some((word) => event.includes(word));
}

function buildLifecycleSummary(params: {
  eventType: string;
  severity: string | null;
  message: string | null;
}): string {
  const pieces = [params.eventType];
  if (params.severity) pieces.push(`sev=${params.severity}`);
  if (params.message) pieces.push(params.message);
  return pieces.join(" • ");
}

export type ProcessInboundResult = {
  picked: number;
  processed: number;
  rejected: number;
  errored: number;
  lifecycleCreated: number;
};

export async function processInboundTelemetryBatch(params: {
  tenantId: string;
  limit?: number;
}): Promise<ProcessInboundResult> {
  const limit = Math.max(1, Math.min(params.limit ?? 200, 1000));

  const pending = await prisma.integrationInboundEvent.findMany({
    where: {
      tenantId: params.tenantId,
      status: { in: [IntegrationInboundStatus.RECEIVED, IntegrationInboundStatus.ERROR] },
      retries: { lt: 5 },
    },
    orderBy: { receivedAt: "asc" },
    take: limit,
  });

  const result: ProcessInboundResult = {
    picked: pending.length,
    processed: 0,
    rejected: 0,
    errored: 0,
    lifecycleCreated: 0,
  };

  for (const row of pending) {
    try {
      if (!row.busId) {
        await prisma.integrationInboundEvent.update({
          where: { id: row.id },
          data: {
            status: IntegrationInboundStatus.REJECTED,
            processedAt: new Date(),
            error: `BUS_NOT_FOUND (${row.busCode})`,
          },
        });
        result.rejected += 1;
        continue;
      }

      const eventAt = row.eventAt ?? row.receivedAt;
      const severity = normalizeSeverity(row.severity);
      const message = normalizeText(row.message);
      const shouldTimeline = shouldCreateLifecycleEvent({
        eventType: row.eventType,
        severity,
        payload: row.payload,
      });

      await prisma.$transaction(async (tx) => {
        await tx.busTelemetryState.upsert({
          where: { busId: row.busId! },
          create: {
            busId: row.busId!,
            tenantId: row.tenantId,
            lastSeenAt: row.receivedAt,
            lastEventAt: eventAt,
            lastEventType: row.eventType,
            lastSeverity: severity,
            lastMessage: message,
            lastPayload: row.payload,
          },
          update: {
            lastSeenAt: row.receivedAt,
            lastEventAt: eventAt,
            lastEventType: row.eventType,
            lastSeverity: severity,
            lastMessage: message,
            lastPayload: row.payload,
          },
        });

        if (shouldTimeline) {
          await tx.busLifecycleEvent.create({
            data: {
              busId: row.busId!,
              eventType: `INGEST:${row.eventType}`,
              summary: buildLifecycleSummary({
                eventType: row.eventType,
                severity,
                message,
              }),
              occurredAt: eventAt,
            },
          });
        }

        await tx.integrationInboundEvent.update({
          where: { id: row.id },
          data: {
            status: IntegrationInboundStatus.PROCESSED,
            processedAt: new Date(),
            error: null,
          },
        });
      });

      result.processed += 1;
      if (shouldTimeline) result.lifecycleCreated += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error procesando evento";
      await prisma.integrationInboundEvent.update({
        where: { id: row.id },
        data: {
          status: IntegrationInboundStatus.ERROR,
          retries: { increment: 1 },
          error: message.slice(0, 1000),
        },
      });
      result.errored += 1;
    }
  }

  return result;
}

export function normalizeBusCode(input: unknown): string {
  return String(input ?? "").trim().toUpperCase();
}

export function normalizeInboundDate(input: unknown): Date | null {
  return parseEventDate(input);
}
