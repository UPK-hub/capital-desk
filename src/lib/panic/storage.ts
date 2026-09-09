// Pool de volúmenes para los videos de botón de pánico.
//
// El material NO se guarda en el disco de la mesa (CBSTS3): se escribe en los
// servidores de almacenamiento (CBSTS1 y CBSTS2), montados como recursos de red.
// El pool se declara en la variable de entorno PANIC_STORAGE_VOLUMES con el
// formato:
//
//   PANIC_STORAGE_VOLUMES=cbsts1|\\10.216.170.194\panic|500|5600;cbsts2|\\10.216.170.195\panic|500|5800
//                          clave  | ruta o recurso de red | GB mínimos | capacidad GB
//
// El cuarto campo (capacidad) es opcional pero necesario sobre recursos de red:
// el cliente SMB de Windows no sabe informar el espacio libre de un volumen
// mayor a 4 TB y devuelve siempre ese tope. Cuando el dato del sistema operativo
// no es confiable, el espacio libre se calcula como la capacidad declarada menos
// los bytes que la mesa ha escrito en ese volumen.
//
// El orden declarado es el orden de llenado: se escribe en el primer volumen con
// espacio suficiente y, cuando este baja del mínimo, la ingesta pasa sola al
// siguiente (desbordamiento). La clave del volumen queda guardada en cada clip
// (PanicVideoClip.storage), de modo que el archivo siempre se puede volver a
// resolver aunque después se agreguen o reordenen volúmenes.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { PANIC_PATH_PREFIX } from "@/lib/panic/config";

export type PanicVolume = {
  key: string;
  root: string;
  minFreeBytes: number;
  /** Capacidad declarada del volumen. Necesaria cuando el sistema operativo no
   *  sabe informar el espacio libre real (el cliente SMB de Windows tope a 4 TB
   *  sobre recursos de red). */
  capacityBytes: number | null;
};

export type VolumeUsage = {
  key: string;
  root: string;
  minFreeBytes: number;
  totalBytes: number | null;
  freeBytes: number | null;
  usedBytes: number | null;
  /** De dónde salió el dato de espacio: del sistema de archivos o de la
   *  contabilidad propia (capacidad declarada menos lo que la mesa ha escrito). */
  source: "filesystem" | "contabilidad" | "desconocido";
  usable: boolean;
  error?: string;
};

const GB = 1024 * 1024 * 1024;
const DEFAULT_MIN_FREE_GB = 100;

function parseVolumes(): PanicVolume[] {
  const raw = String(process.env.PANIC_STORAGE_VOLUMES ?? "").trim();

  if (raw) {
    const volumes: PanicVolume[] = [];
    for (const chunk of raw.split(/[;\n]+/)) {
      const line = chunk.trim();
      if (!line) continue;
      const [keyRaw, rootRaw, minFreeRaw, capacityRaw] = line
        .split("|")
        .map((part) => String(part ?? "").trim());
      if (!keyRaw || !rootRaw) continue;
      const minFreeGb = Number(minFreeRaw);
      const capacityGb = Number(capacityRaw);
      volumes.push({
        key: keyRaw.toLowerCase().replace(/[^a-z0-9_-]/g, ""),
        root: rootRaw,
        minFreeBytes: (Number.isFinite(minFreeGb) && minFreeGb >= 0 ? minFreeGb : DEFAULT_MIN_FREE_GB) * GB,
        capacityBytes: Number.isFinite(capacityGb) && capacityGb > 0 ? capacityGb * GB : null,
      });
    }
    if (volumes.length) return volumes;
  }

  // Compatibilidad: un solo destino declarado como ruta simple.
  const single = String(process.env.PANIC_UPLOADS_DIR ?? "").trim();
  if (single) {
    return [{ key: "panic", root: single, minFreeBytes: DEFAULT_MIN_FREE_GB * GB, capacityBytes: null }];
  }

  // Último recurso (entorno de desarrollo): carpeta local del proyecto.
  return [
    {
      key: "local",
      root: path.join(process.cwd(), "uploads", PANIC_PATH_PREFIX),
      minFreeBytes: 0,
      capacityBytes: null,
    },
  ];
}

let cachedVolumes: PanicVolume[] | null = null;

export function getPanicVolumes(): PanicVolume[] {
  if (!cachedVolumes) cachedVolumes = parseVolumes();
  return cachedVolumes;
}

export function getPanicVolume(key: string | null | undefined): PanicVolume | null {
  const clean = String(key ?? "").trim().toLowerCase();
  if (!clean) return null;
  return getPanicVolumes().find((volume) => volume.key === clean) ?? null;
}

// Valores que delatan que el sistema operativo no está informando la realidad:
// el cliente SMB de Windows satura en 2^32-1 bloques / 4 TiB sobre recursos de
// red, y devuelve siempre ese mismo tope sin importar el tamaño del volumen.
const UINT32_MAX = 4294967295;
const FOUR_TIB = 4 * 1024 * GB;

async function readFilesystemSpace(
  root: string
): Promise<{ free: number | null; total: number | null; reliable: boolean; error?: string }> {
  try {
    // statfs existe en Node >= 18.15 (también sobre unidades de red montadas).
    const stats: any = await (fsp as any).statfs(root);
    const blockSize = Number(stats?.bsize ?? 0);
    const blocks = Number(stats?.blocks ?? 0);
    const avail = Number(stats?.bavail ?? stats?.bfree ?? 0);
    const free = avail * blockSize;
    const total = blocks * blockSize;

    const saturado =
      blocks === UINT32_MAX ||
      avail === UINT32_MAX ||
      free === FOUR_TIB ||
      total === FOUR_TIB;

    return {
      free: Number.isFinite(free) && free > 0 ? free : null,
      total: Number.isFinite(total) && total > 0 ? total : null,
      reliable: !saturado && Number.isFinite(free) && free > 0,
    };
  } catch (error: any) {
    return { free: null, total: null, reliable: false, error: String(error?.message ?? error) };
  }
}

// Contabilidad propia: bytes que la mesa ha escrito en cada volumen. Se usa
// cuando el sistema operativo no sabe informar el espacio libre. Los volúmenes
// son de uso exclusivo del módulo, así que la suma refleja el consumo real.
let usedCache: { at: number; data: Map<string, number> } | null = null;
const USED_CACHE_MS = 60_000;

async function getUsedBytesByVolume(): Promise<Map<string, number>> {
  if (usedCache && Date.now() - usedCache.at < USED_CACHE_MS) return usedCache.data;

  const data = new Map<string, number>();
  try {
    const { prisma } = await import("@/lib/prisma");
    const rows = await prisma.panicVideoClip.groupBy({
      by: ["storage"],
      _sum: { sizeBytes: true },
    });
    for (const row of rows) {
      data.set(String(row.storage), Number(row._sum.sizeBytes ?? 0));
    }
  } catch (error) {
    console.error("PANIC_USED_BYTES_FAILED", String((error as any)?.message ?? error));
  }

  usedCache = { at: Date.now(), data };
  return data;
}

/** Invalida la contabilidad en caché (se llama al terminar de escribir un clip). */
export function invalidateUsedBytesCache() {
  usedCache = null;
}

export async function getVolumesUsage(): Promise<VolumeUsage[]> {
  const volumes = getPanicVolumes();
  const used = await getUsedBytesByVolume();
  const usage: VolumeUsage[] = [];

  for (const volume of volumes) {
    let reachable = true;
    let error: string | undefined;

    try {
      await fsp.mkdir(volume.root, { recursive: true });
    } catch (mkdirError: any) {
      reachable = false;
      error = String(mkdirError?.message ?? mkdirError);
    }

    const space = reachable
      ? await readFilesystemSpace(volume.root)
      : { free: null, total: null, reliable: false, error };

    const usedBytes = used.get(volume.key) ?? 0;

    let freeBytes: number | null = null;
    let totalBytes: number | null = null;
    let source: VolumeUsage["source"] = "desconocido";

    if (space.reliable) {
      freeBytes = space.free;
      totalBytes = space.total;
      source = "filesystem";
    } else if (volume.capacityBytes) {
      // El sistema operativo no informa bien (típico de recursos de red en
      // Windows): se calcula con la capacidad declarada menos lo escrito.
      freeBytes = Math.max(volume.capacityBytes - usedBytes, 0);
      totalBytes = volume.capacityBytes;
      source = "contabilidad";
    }

    usage.push({
      key: volume.key,
      root: volume.root,
      minFreeBytes: volume.minFreeBytes,
      totalBytes,
      freeBytes,
      usedBytes: reachable ? usedBytes : null,
      source,
      usable: reachable && (freeBytes === null || freeBytes > volume.minFreeBytes),
      error: error ?? space.error,
    });
  }

  return usage;
}

/**
 * Elige el volumen donde escribir el próximo clip.
 * Regla: primer volumen alcanzable cuyo espacio libre supere el mínimo
 * configurado (más el tamaño declarado del archivo, si el dispositivo lo envía).
 * Si ninguno cumple, devuelve el de mayor espacio libre alcanzable.
 */
export async function pickVolumeForWrite(expectedBytes = 0): Promise<{ volume: PanicVolume; usage: VolumeUsage } | null> {
  const usage = await getVolumesUsage();
  const volumes = getPanicVolumes();

  for (const item of usage) {
    if (item.error && item.freeBytes === null && !item.usable) continue;
    const needed = item.minFreeBytes + Math.max(expectedBytes, 0);
    if (item.freeBytes === null || item.freeBytes >= needed) {
      const volume = volumes.find((v) => v.key === item.key);
      if (volume) return { volume, usage: item };
    }
  }

  const fallback = usage
    .filter((item) => !item.error || item.freeBytes !== null)
    .sort((a, b) => (b.freeBytes ?? 0) - (a.freeBytes ?? 0))[0];

  if (!fallback) return null;
  const volume = volumes.find((v) => v.key === fallback.key);
  if (!volume) return null;
  if ((fallback.freeBytes ?? 0) <= Math.max(expectedBytes, 0)) return null;
  return { volume, usage: fallback };
}

export function sanitizeSegment(value: string) {
  return String(value ?? "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

/** Ruta relativa (dentro del volumen) donde se guarda un clip. */
export function buildClipRelPath(params: {
  tenantCode: string;
  eventAt: Date;
  busCode: string | null;
  externalEventId: string;
  channel: number | null;
  filename: string;
}) {
  const date = params.eventAt;
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  const dir = [
    PANIC_PATH_PREFIX,
    sanitizeSegment(params.tenantCode),
    yyyy,
    mm,
    dd,
    sanitizeSegment(params.busCode || "SIN_BUS"),
    sanitizeSegment(params.externalEventId),
  ].join("/");

  const channelPart = params.channel === null ? "cam" : `cam${params.channel}`;
  const name = `${channelPart}_${sanitizeSegment(params.filename) || "clip.mp4"}`;

  return `${dir}/${name}`;
}

export function resolveClipAbsPath(volumeKey: string, relPath: string): string | null {
  const volume = getPanicVolume(volumeKey);
  if (!volume) return null;

  const clean = String(relPath ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!clean || clean.includes("..")) return null;

  // path.resolve deja una barra final en las raíces (unidades y, sobre todo,
  // recursos de red UNC: "\\\\host\\panic\\"). Si no se quita, la comprobación
  // anti-escape de abajo rechaza rutas legítimas.
  const root = path.resolve(volume.root).replace(/[\\/]+$/, "");
  const candidate = path.resolve(root, clean);
  if (candidate !== root && !candidate.startsWith(root + path.sep)) return null;
  return candidate;
}

/**
 * Escribe el cuerpo de la petición directamente en disco, sin cargarlo en
 * memoria. Se escribe primero en un archivo temporal `.part` y solo al cerrar
 * correctamente se renombra al nombre definitivo: así un cargue interrumpido
 * nunca queda registrado como clip completo.
 */
export async function writeStreamToVolume(params: {
  volume: PanicVolume;
  relPath: string;
  body: ReadableStream<Uint8Array>;
  maxBytes: number;
}): Promise<{ bytesWritten: number; absPath: string }> {
  const absPath = path.resolve(params.volume.root, params.relPath);
  const absDir = path.dirname(absPath);
  await fsp.mkdir(absDir, { recursive: true });

  const tmpPath = `${absPath}.part`;
  const handle = await fsp.open(tmpPath, "w");
  const writer = handle.createWriteStream();

  let bytesWritten = 0;
  const reader = params.body.getReader();

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.length === 0) continue;

      bytesWritten += value.length;
      if (bytesWritten > params.maxBytes) {
        throw new Error(`El clip supera el máximo permitido (${params.maxBytes} bytes)`);
      }

      if (!writer.write(Buffer.from(value))) {
        await new Promise<void>((resolve, reject) => {
          writer.once("drain", resolve);
          writer.once("error", reject);
        });
      }
    }

    await new Promise<void>((resolve, reject) => {
      writer.end(() => resolve());
      writer.once("error", reject);
    });
  } catch (error) {
    try {
      writer.destroy();
      await handle.close().catch(() => undefined);
      await fsp.unlink(tmpPath).catch(() => undefined);
    } catch {
      /* noop */
    }
    throw error;
  }

  await handle.close().catch(() => undefined);
  await fsp.rename(tmpPath, absPath);
  return { bytesWritten, absPath };
}

export function clipExistsOnDisk(volumeKey: string, relPath: string) {
  const abs = resolveClipAbsPath(volumeKey, relPath);
  if (!abs) return false;
  try {
    return fs.statSync(abs).isFile();
  } catch {
    return false;
  }
}

/**
 * Resuelve la ruta absoluta de un clip guardado. `filePath` se almacena con el
 * prefijo del volumen (`cbsts1/panic-videos/...`) para que sea único y legible;
 * aquí se descuenta ese prefijo antes de anclarlo a la raíz real del volumen.
 */
export function resolveStoredClipPath(storage: string, filePath: string): string | null {
  const key = String(storage ?? "").trim().toLowerCase();
  const clean = String(filePath ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
  const rel = clean.startsWith(`${key}/`) ? clean.slice(key.length + 1) : clean;
  return resolveClipAbsPath(key, rel);
}
