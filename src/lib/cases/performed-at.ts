/**
 * Fecha de realización de un caso (sobre todo del preventivo).
 *
 * El problema que resuelve: el preventivo de un bus se ejecuta un día y el
 * técnico lo carga y lo cierra al día siguiente. Cuando eso cruza el fin de
 * mes, el trabajo aparecía contado en el mes equivocado.
 *
 * Regla: la fecha de realización es `performedAt` si alguien la corrigió, y si
 * no, la fecha de creación del caso. Nunca la de cierre.
 */
import { CaseType } from "@prisma/client";

/** Colombia es UTC-5 todo el año. */
const COT_OFFSET_MS = 5 * 60 * 60 * 1000;

export function casePerformedAt(c: { performedAt?: Date | null; createdAt: Date }): Date {
  return c.performedAt ?? c.createdAt;
}

/** Valor para un <input type="date">, en hora Colombia. */
export function performedDateInputValue(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - COT_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Convierte "YYYY-MM-DD" (lo que escribe el usuario) al instante que se guarda:
 * mediodía de Colombia, para que el día no se corra por zona horaria.
 */
export function parsePerformedDateInput(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? "").trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(`${y}-${mo}-${d}T12:00:00.000-05:00`);
  if (Number.isNaN(date.getTime())) return null;
  const year = Number(y);
  if (year < 2015 || year > 2100) return null;
  return date;
}

/**
 * Filtro de "casos del mes" que respeta la fecha de realización.
 *
 * - Preventivos: cuentan en el mes de `performedAt`; si no tiene, en el de
 *   creación.
 * - Los demás tipos: como siempre, por fecha de creación.
 */
export function monthScopeWhere(monthStart: Date, monthEnd: Date) {
  const inMonth = { gte: monthStart, lt: monthEnd };
  return {
    OR: [
      { type: { not: CaseType.PREVENTIVO }, createdAt: inMonth },
      { type: CaseType.PREVENTIVO, performedAt: inMonth },
      { type: CaseType.PREVENTIVO, performedAt: null, createdAt: inMonth },
    ],
  };
}
