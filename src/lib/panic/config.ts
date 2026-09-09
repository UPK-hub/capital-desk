// Configuración del módulo de videos de botón de pánico.
//
// Por cada activación del botón, cada cámara del bus envía DOS clips: el minuto
// anterior a la activación y los cinco minutos posteriores. Con 13 cámaras por
// bus, un evento completo son 26 archivos.
// Aquí se centralizan los umbrales que usan la ingesta y la vista de revisión.

function intFromEnv(name: string, fallback: number) {
  const raw = Number(String(process.env[name] ?? "").trim());
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

/** Duración nominal del clip posterior a la activación, en segundos. */
export const PANIC_CLIP_TARGET_SECONDS = intFromEnv("PANIC_CLIP_TARGET_SECONDS", 300);

/** Duración nominal del clip previo a la activación, en segundos. */
export const PANIC_PRE_CLIP_TARGET_SECONDS = intFromEnv("PANIC_PRE_CLIP_TARGET_SECONDS", 60);

/** Tolerancia admitida sobre la duración nominal antes de marcar el clip como incompleto. */
export const PANIC_CLIP_TOLERANCE_SECONDS = intFromEnv("PANIC_CLIP_TOLERANCE_SECONDS", 30);

/** Cámaras por bus en la flota de CapitalBus. */
export const PANIC_CAMERAS_PER_BUS = intFromEnv("PANIC_CAMERAS_PER_BUS", 13);

/**
 * Clips esperados por evento. Cada cámara envía dos: el minuto previo a la
 * activación y los cinco minutos posteriores, de modo que 13 cámaras producen
 * 26 archivos. Determina el semáforo de completitud del cargue.
 */
export const PANIC_EXPECTED_CLIPS = intFromEnv("PANIC_EXPECTED_CLIPS", PANIC_CAMERAS_PER_BUS * 2);

/** Tamaño máximo admitido por clip (bytes). */
export const PANIC_MAX_CLIP_BYTES = intFromEnv("PANIC_MAX_CLIP_BYTES", 2 * 1024 * 1024 * 1024);

/** Tamaño mínimo para considerar que un clip llegó con contenido útil (bytes). */
export const PANIC_MIN_CLIP_BYTES = intFromEnv("PANIC_MIN_CLIP_BYTES", 64 * 1024);

/** Años de retención obligatoria del material (política del cliente). */
export const PANIC_RETENTION_YEARS = intFromEnv("PANIC_RETENTION_YEARS", 5);

/** Prefijo de las rutas relativas dentro de cada volumen de almacenamiento. */
export const PANIC_PATH_PREFIX = "panic-videos";

/** Fecha hasta la cual un clip no puede eliminarse. */
export function retentionUntil(receivedAt: Date): Date {
  const until = new Date(receivedAt.getTime());
  until.setFullYear(until.getFullYear() + PANIC_RETENTION_YEARS);
  return until;
}

/** Duración nominal esperada según el tramo del clip. */
export function targetSecondsForSegment(segment: "PREVIO" | "POSTERIOR"): number {
  return segment === "PREVIO" ? PANIC_PRE_CLIP_TARGET_SECONDS : PANIC_CLIP_TARGET_SECONDS;
}

export function isClipDurationAcceptable(
  durationSec: number | null | undefined,
  segment: "PREVIO" | "POSTERIOR" = "POSTERIOR"
): boolean {
  if (!durationSec || durationSec <= 0) return true; // sin dato: no se penaliza
  return Math.abs(durationSec - targetSecondsForSegment(segment)) <= PANIC_CLIP_TOLERANCE_SECONDS;
}
