// src/lib/datetime.ts
export function parseCoDateTime(input: unknown): Date | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;

  // 1) ISO / Date parseable (e.g. 2026-01-10T17:47:00.000Z)
  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;

  // Normaliza a.m./p.m. (incluye variantes con puntos y espacios)
  const s = raw
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/a\.?\s*m\.?/g, "am")
    .replace(/p\.?\s*m\.?/g, "pm")
    .trim();

  // 2) dd/mm/yyyy hh:mm am|pm  (ej: 10/01/2026 05:47 pm)
  // 3) dd/mm/yyyy hh:mm        (24h)
  const m = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?:\s*(am|pm))?)?$/
  );
  if (!m) return null;

  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);

  let hh = m[4] ? Number(m[4]) : 0;
  const min = m[5] ? Number(m[5]) : 0;
  const ap = (m[6] ?? "") as "am" | "pm" | "";

  if (
    !Number.isFinite(dd) || !Number.isFinite(mm) || !Number.isFinite(yyyy) ||
    !Number.isFinite(hh) || !Number.isFinite(min)
  ) return null;

  // Validación básica rangos
  if (mm < 1 || mm > 12) return null;
  if (dd < 1 || dd > 31) return null;
  if (hh < 0 || hh > 23) return null;
  if (min < 0 || min > 59) return null;

  // Convierte 12h -> 24h si viene am/pm
  if (ap) {
    if (hh < 1 || hh > 12) return null;
    if (ap === "am") {
      if (hh === 12) hh = 0;
    } else {
      if (hh !== 12) hh = hh + 12;
    }
  }

  const d = new Date(yyyy, mm - 1, dd, hh, min, 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}
