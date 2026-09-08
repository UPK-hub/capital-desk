// Configuración del módulo de videos de botón de pánico.
//
// Los NVR de la flota envían, por cada activación del botón, un clip por cámara
// que cubre 1 minuto antes y 4 minutos después de la activación (5 minutos).
// Aquí se centralizan los umbrales que usan la ingesta y la vista de revisión.

function intFromEnv(name: string, fallback: number) {
  const raw = Number(String(process.env[name] ?? "").trim());
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

/** Duración nominal del clip en segundos (1 min antes + 4 min después). */
export const PANIC_CLIP_TARGET_SECONDS = intFromEnv("PANIC_CLIP_TARGET_SECONDS", 300);

/** Tolerancia admitida sobre la duración nominal antes de marcar el clip como incompleto. */
export const PANIC_CLIP_TOLERANCE_SECONDS = intFromEnv("PANIC_CLIP_TOLERANCE_SECONDS", 30);

/**
 * Cámaras esperadas por evento. Determina el semáforo de completitud del cargue.
 * La flota de CapitalBus tiene 13 cámaras por bus.
 */
export const PANIC_EXPECTED_CLIPS = intFromEnv("PANIC_EXPECTED_CLIPS", 13);

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

export function isClipDurationAcceptable(durationSec: number | null | undefined): boolean {
  if (!durationSec || durationSec <= 0) return true; // sin dato: no se penaliza
  return Math.abs(durationSec - PANIC_CLIP_TARGET_SECONDS) <= PANIC_CLIP_TOLERANCE_SECONDS;
}
