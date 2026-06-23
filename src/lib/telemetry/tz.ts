// Helpers de día en hora de Colombia (America/Bogota = UTC-5, sin horario de verano).
// Una "etiqueta de día" es un Date a medianoche UTC que representa la fecha local COT.

export const BOG_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Fecha local COT de un instante, como etiqueta (medianoche UTC de esa fecha). */
export function bogDayLabel(instant: Date): Date {
  const shifted = new Date(instant.getTime() - BOG_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

/** Clave YYYY-MM-DD (fecha COT) de un instante o etiqueta. */
export function bogDayKey(instant: Date): string {
  return bogDayLabel(instant).toISOString().slice(0, 10);
}

/** Instante UTC de las 00:00 COT del día representado por la etiqueta. */
export function bogDayStartInstant(label: Date): Date {
  return new Date(label.getTime() + BOG_OFFSET_MS);
}

/** Etiqueta del día COT de hoy. */
export function bogToday(): Date {
  return bogDayLabel(new Date());
}

/** Suma n días a una etiqueta (puede ser negativo). */
export function addDaysLabel(label: Date, n: number): Date {
  const d = new Date(label);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

/** Lista de etiquetas de día COT entre dos instantes/etiquetas, inclusivo. */
export function eachBogDay(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const cur = bogDayLabel(start);
  const last = bogDayLabel(end);
  let guard = 0;
  while (cur.getTime() <= last.getTime() && guard < 400) {
    days.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
    guard += 1;
  }
  return days;
}
