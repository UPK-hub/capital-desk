// Motor de priorización de la Revisión Remota (RVR).
//
// Arma dos colas a partir de tramas/telemetría/casos:
//   - VALIDACIÓN (revisión remota): buses a revisar hoy, en este orden:
//       1) No están transmitiendo (sin P20/P60 en las últimas NO_TX_HOURS h)
//       2) Con alarmas de desconexión de cámara (ALA5/ALA6) recientes
//       3) Con mantenimiento preventivo el día anterior
//       4) Con preventivo hace >= PREV_MIN_DAYS días (más antiguo primero)
//       5) Recurrencia: última revisión remota hace >= RECHECK_DAYS días
//     Se excluyen los revisados en los últimos COOLDOWN_DAYS días, salvo que
//     entren por un motivo crítico (no transmite / alarma de cámara).
//
//   - CORRECTIVO (prioridad de correctivo), en este orden:
//       1) No reportó (silencioso / no transmite) y tiene falla efectiva
//       2) Odómetro en 0 en los últimos 3 días
//       3) Coordenadas en 0 en los últimos 3 días
//
// Todo es solo-lectura (no crea nada). Las consultas usan índices existentes.
import { prisma } from "@/lib/prisma";
import { CaseStatus, CaseType, WorkOrderStatus } from "@prisma/client";
import { getLatestOdometer } from "@/lib/telemetry/odometer";
import { getCoordinateQuality } from "@/lib/telemetry/coordinates";

const DAY = 86400000;
export const RVR_DEFAULTS = {
  NO_TX_HOURS: 24, // sin P20/P60 en 24 h = no transmite
  ALARM_DAYS: 3, // alarmas de cámara miradas en los últimos 3 días
  PREV_MIN_DAYS: 10, // preventivo hace >= 10 días
  RECHECK_DAYS: 15, // vuelve a revisión a los 15 días
  COOLDOWN_DAYS: 15, // no re-revisar dentro de 15 días (salvo crítico)
  DAILY_LIMIT: 30, // 30 buses/día
  TELEMETRY_DAYS: 3, // odómetro/coordenadas en los últimos 3 días
};

export type RvrValReason =
  | "NO_TRANSMITE"
  | "ALARMA_CAMARA"
  | "PREVENTIVO_AYER"
  | "PREVENTIVO_10D"
  | "RECHECK_15D";

export type RvrCorrReason = "NO_REPORTA_CON_FALLA" | "ODOMETRO_CERO" | "COORDENADAS_CERO";

export const RVR_VAL_REASON_LABEL: Record<RvrValReason, string> = {
  NO_TRANSMITE: "No está transmitiendo",
  ALARMA_CAMARA: "Alarma de desconexión de cámara",
  PREVENTIVO_AYER: "Preventivo el día anterior",
  PREVENTIVO_10D: "Preventivo hace 10+ días",
  RECHECK_15D: "Toca re-revisar (15 días)",
};
export const RVR_CORR_REASON_LABEL: Record<RvrCorrReason, string> = {
  NO_REPORTA_CON_FALLA: "No reporta / no transmite (posible falla)",
  ODOMETRO_CERO: "Odómetro en 0 (últimos 3 días)",
  COORDENADAS_CERO: "Coordenadas en 0 (últimos 3 días)",
};

export type RvrQueueItem = {
  busId: string;
  busCode: string;
  busPlate: string | null;
  rank: number; // 1 = más prioritario
  reason: string; // clave (RvrValReason | RvrCorrReason)
  reasonLabel: string;
  detail: string; // texto legible extra
  lastPreventiveAt: string | null;
  lastReviewedAt: string | null;
  hasOpenNovedad: boolean;
};

type BusRow = { id: string; code: string; plate: string | null };

// ------------------------------- Fuentes -----------------------------------

async function fetchSignals(tenantId: string) {
  const now = Date.now();
  const noTxCut = new Date(now - RVR_DEFAULTS.NO_TX_HOURS * 3600 * 1000);
  const alarmCut = new Date(now - RVR_DEFAULTS.ALARM_DAYS * DAY);

  const [buses, lastTrama, camAlarms, preventives, lastReviews, openNov, odo, coords] = await Promise.all([
    prisma.bus.findMany({ where: { tenantId, active: true }, select: { id: true, code: true, plate: true } }),
    // Última P20/P60 por bus (para detectar "no transmite"). Acotado a 7 días:
    // si no hubo P20/P60 en 7 días, con más razón no transmite (umbral 24 h).
    prisma.integrationInboundEvent.groupBy({
      by: ["busCode"],
      where: { tenantId, tramaSubtype: { in: ["P20", "P60"] }, eventAt: { gte: new Date(now - 7 * DAY) } },
      _max: { eventAt: true },
    }),
    // Alarmas de desconexión de cámara recientes (ALA5/ALA6).
    prisma.integrationInboundEvent.findMany({
      where: { tenantId, alarmCode: { in: ["ALA5", "ALA6"] }, eventAt: { gte: alarmCut } },
      distinct: ["busCode"],
      select: { busCode: true, eventAt: true, alarmLabel: true },
      orderBy: { eventAt: "desc" },
    }),
    // Último preventivo finalizado por bus.
    prisma.workOrder.findMany({
      where: {
        tenantId,
        status: WorkOrderStatus.FINALIZADA,
        finishedAt: { not: null },
        case: { type: CaseType.PREVENTIVO },
      },
      select: { finishedAt: true, case: { select: { busId: true } } },
      orderBy: { finishedAt: "desc" },
    }),
    // Última revisión remota por bus (para recurrencia/cooldown).
    prisma.remoteVisualReviewBus.groupBy({
      by: ["busId"],
      where: { reviewedAt: { not: null }, review: { tenantId } },
      _max: { reviewedAt: true },
    }),
    // Novedades abiertas por bus.
    prisma.case.findMany({
      where: { tenantId, type: CaseType.NOVEDAD, status: { notIn: [CaseStatus.CERRADO, CaseStatus.RESUELTO] } },
      select: { busId: true },
      distinct: ["busId"],
    }),
    getLatestOdometer(tenantId).catch(() => []),
    getCoordinateQuality(tenantId).catch(() => []),
  ]);

  const lastTramaByCode = new Map<string, Date | null>();
  for (const r of lastTrama) lastTramaByCode.set(r.busCode, r._max.eventAt ?? null);

  const camAlarmByCode = new Map<string, { at: Date | null; label: string | null }>();
  for (const a of camAlarms) if (!camAlarmByCode.has(a.busCode)) camAlarmByCode.set(a.busCode, { at: a.eventAt, label: a.alarmLabel });

  const lastPrevByBus = new Map<string, Date>();
  for (const w of preventives) {
    const bid = w.case?.busId;
    if (bid && w.finishedAt && !lastPrevByBus.has(bid)) lastPrevByBus.set(bid, w.finishedAt);
  }

  const lastReviewByBus = new Map<string, Date | null>();
  for (const r of lastReviews) lastReviewByBus.set(r.busId, r._max.reviewedAt ?? null);

  const openNovByBus = new Set<string>();
  for (const c of openNov) if (c.busId) openNovByBus.add(c.busId);

  const odoZeroByCode = new Set<string>();
  for (const r of odo as any[]) {
    const km = r?.odometer;
    if (km === 0 || km === "0" || (typeof km === "number" && km === 0)) odoZeroByCode.add(String(r.busCode));
  }
  const coordZeroByCode = new Set<string>();
  for (const r of coords as any[]) {
    if (Number(r?.ceroCount ?? 0) > 0) coordZeroByCode.add(String(r.busCode));
  }

  return {
    now,
    noTxCut,
    buses: buses as BusRow[],
    lastTramaByCode,
    camAlarmByCode,
    lastPrevByBus,
    lastReviewByBus,
    openNovByBus,
    odoZeroByCode,
    coordZeroByCode,
  };
}

// ---------------------------- Cola de VALIDACIÓN ----------------------------

export async function buildRvrValidationQueue(
  tenantId: string,
  limit = RVR_DEFAULTS.DAILY_LIMIT
): Promise<RvrQueueItem[]> {
  const s = await fetchSignals(tenantId);
  const now = s.now;
  const ayerDesde = new Date(now - 2 * DAY); // "día anterior": entre hace 2 y 1 día
  const ayerHasta = new Date(now - 1 * DAY);
  const prevMinCut = new Date(now - RVR_DEFAULTS.PREV_MIN_DAYS * DAY);
  const cooldownCut = new Date(now - RVR_DEFAULTS.COOLDOWN_DAYS * DAY);
  const recheckCut = new Date(now - RVR_DEFAULTS.RECHECK_DAYS * DAY);

  const items: RvrQueueItem[] = [];
  for (const b of s.buses) {
    const lastReview = s.lastReviewByBus.get(b.id) ?? null;
    const revisadoReciente = lastReview != null && lastReview >= cooldownCut;
    const lastPrev = s.lastPrevByBus.get(b.id) ?? null;
    const base = {
      busId: b.id,
      busCode: b.code,
      busPlate: b.plate,
      lastPreventiveAt: lastPrev ? lastPrev.toISOString() : null,
      lastReviewedAt: lastReview ? lastReview.toISOString() : null,
      hasOpenNovedad: s.openNovByBus.has(b.id),
    };

    // 1) No transmite (crítico: ignora cooldown).
    const lastTx = s.lastTramaByCode.get(b.code) ?? null;
    if (!lastTx || lastTx < s.noTxCut) {
      items.push({ ...base, rank: 1, reason: "NO_TRANSMITE", reasonLabel: RVR_VAL_REASON_LABEL.NO_TRANSMITE, detail: lastTx ? `Última trama: ${lastTx.toISOString()}` : "Sin P20/P60 registradas" });
      continue;
    }
    // 2) Alarma de desconexión de cámara (crítico: ignora cooldown).
    const alarm = s.camAlarmByCode.get(b.code);
    if (alarm) {
      items.push({ ...base, rank: 2, reason: "ALARMA_CAMARA", reasonLabel: RVR_VAL_REASON_LABEL.ALARMA_CAMARA, detail: alarm.label || "ALA5/ALA6" });
      continue;
    }
    // 3) y 4) y 5): respetan cooldown (no re-revisar dentro de 15 días).
    if (revisadoReciente) continue;
    // 3) Preventivo el día anterior.
    if (lastPrev && lastPrev >= ayerDesde && lastPrev < ayerHasta) {
      items.push({ ...base, rank: 3, reason: "PREVENTIVO_AYER", reasonLabel: RVR_VAL_REASON_LABEL.PREVENTIVO_AYER, detail: `Preventivo: ${lastPrev.toISOString().slice(0, 10)}` });
      continue;
    }
    // 4) Preventivo hace >= 10 días.
    if (lastPrev && lastPrev < prevMinCut) {
      items.push({ ...base, rank: 4, reason: "PREVENTIVO_10D", reasonLabel: RVR_VAL_REASON_LABEL.PREVENTIVO_10D, detail: `Preventivo: ${lastPrev.toISOString().slice(0, 10)}` });
      continue;
    }
    // 5) Recurrencia: última revisión hace >= 15 días (o nunca revisado y sin preventivo reciente).
    if (lastReview != null && lastReview < recheckCut) {
      items.push({ ...base, rank: 5, reason: "RECHECK_15D", reasonLabel: RVR_VAL_REASON_LABEL.RECHECK_15D, detail: `Última RVR: ${lastReview.toISOString().slice(0, 10)}` });
      continue;
    }
  }

  return sortAndLimit(items, limit, (a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    // Dentro de "preventivo 10+ días": más antiguo primero.
    if (a.rank === 4 || a.rank === 5) {
      const ax = a.rank === 4 ? a.lastPreventiveAt : a.lastReviewedAt;
      const bx = b.rank === 4 ? b.lastPreventiveAt : b.lastReviewedAt;
      return (ax ?? "").localeCompare(bx ?? "");
    }
    return a.busCode.localeCompare(b.busCode);
  });
}

// ---------------------------- Cola de CORRECTIVO ----------------------------

export async function buildRvrCorrectiveQueue(
  tenantId: string,
  limit = RVR_DEFAULTS.DAILY_LIMIT
): Promise<RvrQueueItem[]> {
  const s = await fetchSignals(tenantId);
  const items: RvrQueueItem[] = [];
  for (const b of s.buses) {
    const base = {
      busId: b.id,
      busCode: b.code,
      busPlate: b.plate,
      lastPreventiveAt: (s.lastPrevByBus.get(b.id) ?? null)?.toISOString() ?? null,
      lastReviewedAt: (s.lastReviewByBus.get(b.id) ?? null)?.toISOString() ?? null,
      hasOpenNovedad: s.openNovByBus.has(b.id),
    };
    const lastTx = s.lastTramaByCode.get(b.code) ?? null;
    // 1) No reporta (no transmite) y tiene falla efectiva.
    if (!lastTx || lastTx < s.noTxCut) {
      items.push({ ...base, rank: 1, reason: "NO_REPORTA_CON_FALLA", reasonLabel: RVR_CORR_REASON_LABEL.NO_REPORTA_CON_FALLA, detail: lastTx ? `Última trama: ${lastTx.toISOString()}` : "Sin P20/P60" });
      continue;
    }
    // 2) Odómetro en 0 (últimos 3 días).
    if (s.odoZeroByCode.has(b.code)) {
      items.push({ ...base, rank: 2, reason: "ODOMETRO_CERO", reasonLabel: RVR_CORR_REASON_LABEL.ODOMETRO_CERO, detail: "Odómetro reportando 0" });
      continue;
    }
    // 3) Coordenadas en 0 (últimos 3 días).
    if (s.coordZeroByCode.has(b.code)) {
      items.push({ ...base, rank: 3, reason: "COORDENADAS_CERO", reasonLabel: RVR_CORR_REASON_LABEL.COORDENADAS_CERO, detail: "Coordenadas en 0,0" });
      continue;
    }
  }
  return sortAndLimit(items, limit, (a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.busCode.localeCompare(b.busCode)));
}

function sortAndLimit(items: RvrQueueItem[], limit: number, cmp: (a: RvrQueueItem, b: RvrQueueItem) => number): RvrQueueItem[] {
  return [...items].sort(cmp).slice(0, limit);
}
