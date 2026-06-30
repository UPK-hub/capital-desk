// Festivos de Colombia y cálculo de tiempo hábil (sin domingos ni festivos).
// Puro: lo usan servidor y cliente. Zona horaria fija America/Bogota (UTC-5, sin horario de verano).

const COT_MS = 5 * 3600000; // Bogotá = UTC-5
const DAY = 86400000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Domingo de Pascua (algoritmo de Gauss/Meeus, calendario gregoriano).
function easterSundayUtc(year: number): number {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = marzo, 4 = abril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(year, month - 1, day);
}

// Traslada una fecha (UTC) al lunes siguiente si no cae en lunes (Ley Emiliani).
function nextMondayUtc(ms: number): number {
  const dow = new Date(ms).getUTCDay(); // 0 = domingo, 1 = lunes
  return ms + ((8 - dow) % 7) * DAY;
}

function ymdUtc(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

const cache = new Map<number, Set<string>>();

// Conjunto de festivos "YYYY-MM-DD" de Colombia para un año.
export function colombianHolidays(year: number): Set<string> {
  const hit = cache.get(year);
  if (hit) return hit;

  const out = new Set<string>();

  // Festivos fijos (no se trasladan).
  const fixed: [number, number][] = [
    [1, 1], // Año Nuevo
    [5, 1], // Día del Trabajo
    [7, 20], // Independencia
    [8, 7], // Batalla de Boyacá
    [12, 8], // Inmaculada Concepción
    [12, 25], // Navidad
  ];
  for (const [mo, da] of fixed) out.add(`${year}-${pad(mo)}-${pad(da)}`);

  // Ley Emiliani: se trasladan al lunes siguiente.
  const emiliani: [number, number][] = [
    [1, 6], // Reyes Magos
    [3, 19], // San José
    [6, 29], // San Pedro y San Pablo
    [8, 15], // Asunción de la Virgen
    [10, 12], // Día de la Raza
    [11, 1], // Todos los Santos
    [11, 11], // Independencia de Cartagena
  ];
  for (const [mo, da] of emiliani) out.add(ymdUtc(nextMondayUtc(Date.UTC(year, mo - 1, da))));

  // Basados en la Pascua.
  const easter = easterSundayUtc(year);
  out.add(ymdUtc(easter - 3 * DAY)); // Jueves Santo (no se traslada)
  out.add(ymdUtc(easter - 2 * DAY)); // Viernes Santo (no se traslada)
  out.add(ymdUtc(easter + 43 * DAY)); // Ascensión del Señor (lunes)
  out.add(ymdUtc(easter + 64 * DAY)); // Corpus Christi (lunes)
  out.add(ymdUtc(easter + 71 * DAY)); // Sagrado Corazón (lunes)

  cache.set(year, out);
  return out;
}

// Fecha "YYYY-MM-DD" en hora Colombia para un instante.
function bogotaDateStr(ms: number): string {
  const d = new Date(ms - COT_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function bogotaDow(ms: number): number {
  return new Date(ms - COT_MS).getUTCDay(); // 0 = domingo
}
function bogotaDayStartMs(ms: number): number {
  const d = new Date(ms - COT_MS);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + COT_MS; // 00:00 Bogotá en ms UTC
}

export function isColombianHoliday(ms: number): boolean {
  const str = bogotaDateStr(ms);
  return colombianHolidays(Number(str.slice(0, 4))).has(str);
}

// Día hábil = no es domingo y no es festivo en Colombia.
export function isWorkingDayCO(ms: number): boolean {
  if (bogotaDow(ms) === 0) return false;
  if (isColombianHoliday(ms)) return false;
  return true;
}

// Suma "horas hábiles" a un instante, saltando domingos y festivos de Colombia.
export function addWorkingHoursCO(startMs: number, hours: number): number {
  let remaining = Math.max(0, hours) * 3600000;
  let cur = startMs;
  let guard = 0;
  while (remaining > 0 && guard < 4000) {
    guard += 1;
    if (isWorkingDayCO(cur)) {
      const nextDay = bogotaDayStartMs(cur) + DAY;
      const avail = nextDay - cur;
      if (avail >= remaining) {
        cur += remaining;
        remaining = 0;
      } else {
        remaining -= avail;
        cur = nextDay;
      }
    } else {
      cur = bogotaDayStartMs(cur) + DAY; // salta el día no hábil completo
    }
  }
  return cur;
}
