import { open, stat } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { Compression, PMTiles, TileType, type Header, type RangeResponse, type Source } from "pmtiles";

/**
 * Mapa base propio.
 *
 * El fondo del mapa de alarmas no se pide a ningun proveedor externo: se sirve
 * desde un archivo PMTiles que vive en el disco del servidor y que contiene solo
 * el recuadro de Bogota y la sabana. Un PMTiles es un unico archivo con todas
 * las teselas dentro, indexadas, asi que basta leer el rango de bytes que
 * corresponde a la tesela pedida. Ver docs/mapa-propio.md.
 *
 * Esto nos deja sin llaves de API, sin cuotas mensuales y sin que el trafico de
 * la mesa salga a internet solo para dibujar calles.
 */

const CACHE_ESTADO_MS = 30_000;

/** Ruta del archivo de teselas. Por defecto <raiz del proyecto>/tiles/bogota.pmtiles */
export function rutaArchivo(): string {
  const env = process.env.MAPA_PMTILES?.trim();
  if (env) return path.resolve(env);
  return path.join(process.cwd(), "tiles", "bogota.pmtiles");
}

/** Segundos que el navegador puede guardar una tesela. El archivo se regenera cada trimestre. */
export function cacheSegundos(): number {
  const n = Number(process.env.MAPA_CACHE_SEGUNDOS ?? "604800");
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 604800;
}

function aArrayBuffer(b: Uint8Array): ArrayBuffer {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

async function descomprimir(buf: ArrayBuffer, compresion: Compression): Promise<ArrayBuffer> {
  if (compresion === Compression.None) return buf;
  const entrada = Buffer.from(buf);
  if (compresion === Compression.Gzip) return aArrayBuffer(gunzipSync(entrada));
  if (compresion === Compression.Brotli) return aArrayBuffer(brotliDecompressSync(entrada));
  throw new Error(
    `El archivo de mapa usa una compresion que no sabemos leer (codigo ${compresion}). ` +
      "Regeneralo con npm run mapa:generar, que produce gzip."
  );
}

/**
 * Lectura por rangos sobre el archivo local. La libreria pmtiles solo necesita
 * poder pedir "dame N bytes desde el offset X", que es exactamente lo que hace
 * un descriptor de archivo abierto.
 */
class ArchivoLocal implements Source {
  constructor(
    private readonly handle: FileHandle,
    private readonly clave: string
  ) {}

  getKey(): string {
    return this.clave;
  }

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const buf = Buffer.allocUnsafe(length);
    const { bytesRead } = await this.handle.read(buf, 0, length, offset);
    return { data: aArrayBuffer(buf.subarray(0, bytesRead)) };
  }
}

type Abierto = {
  ruta: string;
  clave: string;
  handle: FileHandle;
  archivo: PMTiles;
  bytes: number;
  actualizado: Date;
};

let abierto: Abierto | null = null;
let abriendo: Promise<Abierto> | null = null;

async function cerrar() {
  const previo = abierto;
  abierto = null;
  if (previo) {
    try {
      await previo.handle.close();
    } catch {
      // si ya estaba cerrado no hay nada que hacer
    }
  }
}

/**
 * Abre el archivo una sola vez y lo reutiliza entre peticiones. La clave incluye
 * fecha y tamano, de modo que si alguien regenera el archivo encima, la siguiente
 * peticion lo detecta, cierra el viejo y vuelve a abrir sin reiniciar la app.
 */
async function obtener(): Promise<Abierto> {
  const ruta = rutaArchivo();
  const info = await stat(ruta);
  const clave = `${ruta}:${info.size}:${info.mtimeMs}`;

  if (abierto && abierto.clave === clave) return abierto;
  if (abriendo) {
    const esperado = await abriendo;
    if (esperado.clave === clave) return esperado;
  }

  abriendo = (async () => {
    await cerrar();
    const handle = await open(ruta, "r");
    const fuente = new ArchivoLocal(handle, clave);
    const archivo = new PMTiles(fuente, undefined, descomprimir);
    const cabecera = await archivo.getHeader();
    if (cabecera.tileType !== TileType.Mvt) {
      await handle.close();
      throw new Error(
        "El archivo de mapa no contiene teselas vectoriales (MVT). Regeneralo con npm run mapa:generar."
      );
    }
    const nuevo: Abierto = {
      ruta,
      clave,
      handle,
      archivo,
      bytes: info.size,
      actualizado: info.mtime,
    };
    abierto = nuevo;
    return nuevo;
  })();

  try {
    return await abriendo;
  } finally {
    abriendo = null;
  }
}

/**
 * Devuelve los bytes de una tesela, ya descomprimidos, o null si esa tesela no
 * esta en el archivo (lo normal fuera del recuadro de Bogota).
 */
export async function leerTesela(z: number, x: number, y: number): Promise<Buffer | null> {
  const { archivo } = await obtener();
  const r = await archivo.getZxy(z, x, y);
  if (!r) return null;
  return Buffer.from(r.data);
}

export type EstadoMapa =
  | {
      disponible: true;
      bytes: number;
      actualizado: string;
      minZoom: number;
      maxZoom: number;
      limites: [number, number, number, number];
      centro: [number, number];
      teselas: number;
    }
  | { disponible: false; motivo: string };

/** Estado del archivo, para que la pantalla pueda avisar si falta. */
export async function estadoMapa(): Promise<EstadoMapa> {
  try {
    const { archivo, bytes, actualizado } = await obtener();
    const h: Header = await archivo.getHeader();
    return {
      disponible: true,
      bytes,
      actualizado: actualizado.toISOString(),
      minZoom: h.minZoom,
      maxZoom: h.maxZoom,
      limites: [h.minLon, h.minLat, h.maxLon, h.maxLat],
      centro: [h.centerLon, h.centerLat],
      teselas: h.numAddressedTiles,
    };
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") {
      return {
        disponible: false,
        motivo: `No existe el archivo de teselas en ${rutaArchivo()}. Generalo con npm run mapa:generar.`,
      };
    }
    return { disponible: false, motivo: err?.message ?? "Error leyendo el archivo de teselas." };
  }
}

/** Solo para los scripts de mantenimiento: cierra el descriptor abierto. */
export async function cerrarArchivo() {
  await cerrar();
}

let cacheEstado: { en: number; valor: EstadoMapa } | null = null;

/** Igual que estadoMapa pero con cache corto, para la ruta que consulta la UI. */
export async function estadoMapaCacheado(): Promise<EstadoMapa> {
  const ahora = Date.now();
  if (cacheEstado && ahora - cacheEstado.en < CACHE_ESTADO_MS) return cacheEstado.valor;
  const valor = await estadoMapa();
  cacheEstado = { en: ahora, valor };
  return valor;
}
