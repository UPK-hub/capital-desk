/**
 * Configuración de la réplica automática a OneDrive de CapitalBus.
 *
 * Todo se lee del .env del servidor. Mientras ONEDRIVE_SYNC_ENABLED sea
 * distinto de "true" el módulo queda inerte: no encola, no sube, no falla.
 */

export const ONEDRIVE_SYNC_ENABLED =
  String(process.env.ONEDRIVE_SYNC_ENABLED ?? "false").trim().toLowerCase() === "true";

export const GRAPH_TENANT_ID = String(process.env.GRAPH_TENANT_ID ?? "").trim();
export const GRAPH_CLIENT_ID = String(process.env.GRAPH_CLIENT_ID ?? "").trim();
export const GRAPH_CLIENT_SECRET = String(process.env.GRAPH_CLIENT_SECRET ?? "").trim();
export const ONEDRIVE_DRIVE_ID = String(process.env.ONEDRIVE_DRIVE_ID ?? "").trim();

/** Carpeta raíz dentro del OneDrive de destino. */
export const ONEDRIVE_ROOT_FOLDER =
  String(process.env.ONEDRIVE_ROOT_FOLDER ?? "Descargas de video Capital Desk").trim();

/**
 * Tamaño de cada trozo de la subida por sesión.
 * Microsoft exige múltiplos de 320 KiB y máximo 60 MiB por petición.
 * 10 MiB es el punto cómodo entre pocas peticiones y reintentos baratos.
 */
const CHUNK_UNIT = 320 * 1024;
const rawChunk = Number(process.env.ONEDRIVE_CHUNK_BYTES ?? 10 * 1024 * 1024);
export const ONEDRIVE_CHUNK_BYTES =
  Math.max(CHUNK_UNIT, Math.floor(rawChunk / CHUNK_UNIT) * CHUNK_UNIT);

/** Por encima de este tamaño se usa sesión de carga en vez de PUT directo. */
export const ONEDRIVE_SIMPLE_MAX_BYTES = 4 * 1024 * 1024;

/** Intentos antes de dejar el adjunto en ERROR para revisión manual. */
export const ONEDRIVE_MAX_ATTEMPTS = Number(process.env.ONEDRIVE_MAX_ATTEMPTS ?? 8);

/** Cuántos adjuntos toma el worker por vuelta. */
export const ONEDRIVE_BATCH_SIZE = Number(process.env.ONEDRIVE_BATCH_SIZE ?? 3);

/** Descanso del worker cuando no hay nada pendiente, en milisegundos. */
export const ONEDRIVE_IDLE_MS = Number(process.env.ONEDRIVE_IDLE_MS ?? 30_000);

export function onedriveConfigured(): boolean {
  return Boolean(GRAPH_TENANT_ID && GRAPH_CLIENT_ID && GRAPH_CLIENT_SECRET && ONEDRIVE_DRIVE_ID);
}

export function onedriveConfigError(): string | null {
  const faltan: string[] = [];
  if (!GRAPH_TENANT_ID) faltan.push("GRAPH_TENANT_ID");
  if (!GRAPH_CLIENT_ID) faltan.push("GRAPH_CLIENT_ID");
  if (!GRAPH_CLIENT_SECRET) faltan.push("GRAPH_CLIENT_SECRET");
  if (!ONEDRIVE_DRIVE_ID) faltan.push("ONEDRIVE_DRIVE_ID");
  return faltan.length ? `Faltan variables en el .env: ${faltan.join(", ")}` : null;
}

/** Backoff exponencial con techo de 30 minutos. */
export function backoffMs(intento: number): number {
  const base = 30_000; // 30 s
  return Math.min(base * Math.pow(2, Math.max(0, intento - 1)), 30 * 60_000);
}
