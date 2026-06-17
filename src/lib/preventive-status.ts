import renovData from "@/data/renovacion-tecnologica.json";

// Lógica compartida para el estado de preventivo de un móvil (bus).
//
// Combina:
//  - Fecha de renovación tecnológica (renovacion-tecnologica.json).
//  - Último preventivo del bus.
//  - La regla expectedForBus: 1 preventivo por mes A PARTIR DEL MES SIGUIENTE
//    a la renovación (alineada con src/lib/buses-report.ts).

const RENOV: Record<string, string> = renovData as Record<string, string>;

export type PreventiveStatus = "al_dia" | "pendiente" | "no_aplica";

export type PreventiveStatusResult = {
  status: PreventiveStatus;
  days: number | null; // días desde el último preventivo (o null si no hay)
  lastDate: string | null; // ISO del último preventivo (o null)
  renovDate: string | null; // YYYY-MM-DD de la renovación (o null si no está en el listado)
  message: string;
};

// Umbral (en días) para considerar "reciente" un preventivo (alineado con
// check-recent-preventive). Si hubo uno reciente, el bus está al día.
export const RECENT_PREVENTIVE_DAYS = 30;

/** Fecha de renovación tecnológica para un código de bus, o null. */
export function renovDateForBusCode(code: string | null | undefined): Date | null {
  if (!code) return null;
  const iso = RENOV[code.trim().toUpperCase()];
  return iso ? new Date(iso + "T00:00:00") : null;
}

function monthIndex(d: Date): number {
  return d.getFullYear() * 12 + (d.getMonth() + 1);
}

/**
 * Calcula el estado de preventivo de un bus.
 *
 * - no_aplica: el bus no está en el listado de renovación, o aún no llega el
 *   primer mes con preventivo esperado (mes siguiente a la renovación).
 * - pendiente: ya corresponde preventivo (mes en curso >= primer mes esperado)
 *   y no hay un preventivo reciente ni uno registrado en el mes en curso.
 * - al_dia: hubo un preventivo reciente / del mes en curso (o ya no aplica más).
 */
export function preventiveStatusForBus(params: {
  busCode: string | null | undefined;
  lastPreventiveAt: Date | null;
  now?: Date;
}): PreventiveStatusResult {
  const now = params.now ?? new Date();
  const renov = renovDateForBusCode(params.busCode);
  const last = params.lastPreventiveAt ?? null;

  const days = last ? Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24)) : null;
  const lastDate = last ? last.toISOString() : null;
  const renovDate = renov ? renov.toISOString().slice(0, 10) : null;

  // Sin fecha de renovación: no se puede determinar el ciclo de preventivos.
  if (!renov) {
    return {
      status: "no_aplica",
      days,
      lastDate,
      renovDate,
      message: "Sin fecha de renovación: no requiere preventivo programado.",
    };
  }

  const currentIdx = monthIndex(now);
  // Primer preventivo esperado: el mes SIGUIENTE a la renovación.
  const firstDueIdx = renov.getFullYear() * 12 + (renov.getMonth() + 1) + 1;

  // Aún no llega el primer mes con preventivo esperado.
  if (currentIdx < firstDueIdx) {
    return {
      status: "no_aplica",
      days,
      lastDate,
      renovDate,
      message: "Aún no aplica preventivo (anterior al primer mes posterior a la renovación).",
    };
  }

  // ¿Hubo un preventivo reciente? -> al día.
  if (days !== null && days < RECENT_PREVENTIVE_DAYS) {
    return {
      status: "al_dia",
      days,
      lastDate,
      renovDate,
      message: `Al día: último preventivo hace ${days} día(s).`,
    };
  }

  // ¿Hubo un preventivo en el mes en curso? -> al día (no se exige otro este mes).
  if (last && monthIndex(last) === currentIdx) {
    return {
      status: "al_dia",
      days,
      lastDate,
      renovDate,
      message: "Al día: ya tuvo preventivo este mes.",
    };
  }

  // Corresponde preventivo este mes y no hay uno reciente/del mes.
  return {
    status: "pendiente",
    days,
    lastDate,
    renovDate,
    message: last
      ? `Le toca preventivo este mes (último hace ${days} día(s)).`
      : "Le toca preventivo este mes (sin preventivos previos).",
  };
}
