/**
 * Generador de archivos ZIP en streaming, sin dependencias externas.
 *
 * Se usa para descargar de un solo clic todos los videos de una cámara (o de
 * toda la solicitud). Características importantes para este caso:
 *
 * - **Streaming real**: los bytes salen al navegador apenas empieza, sin armar
 *   el ZIP completo en memoria ni en disco. La descarga arranca de inmediato
 *   aunque sean varios GB y el servidor no consume RAM adicional.
 * - **Sin compresión (método "store")**: los videos ya vienen comprimidos, así
 *   que comprimir solo gastaría CPU sin reducir el tamaño.
 * - **ZIP64 automático** para archivos o paquetes de más de 4 GB.
 * - Nombres en UTF-8 y descriptor de datos, igual que los ZIP que generan
 *   GitHub o Google Drive: los abre el Explorador de Windows, macOS y 7-Zip.
 */

import fs from "node:fs";
import { Readable } from "node:stream";

export type ZipEntry = {
  /** Nombre dentro del ZIP (puede incluir carpetas con "/"). */
  name: string;
  /** Ruta absoluta del archivo en el disco del servidor. */
  absPath: string;
  /** Tamaño en bytes (de fs.stat). */
  size: number;
  /** Fecha de modificación, para la marca de tiempo del ZIP. */
  mtime?: Date;
};

const U32_MAX = 0xffffffff;

// ------------------------------------------------------------------ CRC32

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32Update(crc: number, buf: Buffer): number {
  let c = crc;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return c;
}

// ------------------------------------------------------------------ helpers

/** Fecha/hora en formato DOS (lo que guarda el ZIP). */
function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/**
 * Limpia el nombre para que sea válido dentro del ZIP y en Windows.
 * Conserva "/" como separador de carpetas (para agrupar por cámara).
 */
export function safeZipName(name: string, fallback = "archivo"): string {
  const segments = String(name ?? "")
    .replace(/\\/g, "/")
    .split("/")
    .map((seg) =>
      seg
        .replace(/[<>:"|?*\x00-\x1f]/g, "_")
        .replace(/^\.+/, "")
        .trim()
    )
    .filter(Boolean);
  if (!segments.length) return fallback;
  const file = segments.pop() as string;
  return [...segments, file].join("/");
}

/** Evita nombres repetidos dentro del mismo ZIP (archivo.mp4, archivo (2).mp4). */
export function dedupeZipNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((raw) => {
    const key = raw.toLowerCase();
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    if (count === 0) return raw;
    const dot = raw.lastIndexOf(".");
    const base = dot > 0 ? raw.slice(0, dot) : raw;
    const ext = dot > 0 ? raw.slice(dot) : "";
    return `${base} (${count + 1})${ext}`;
  });
}

// ------------------------------------------------------------------ ZIP

type CentralRecord = {
  nameBuf: Buffer;
  crc: number;
  size: number;
  offset: number;
  time: number;
  date: number;
  zip64: boolean;
};

async function* zipGenerator(entries: ZipEntry[], zip64Threshold: number): AsyncGenerator<Buffer> {
  const central: CentralRecord[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(safeZipName(entry.name), "utf8");
    const { time, date } = dosDateTime(entry.mtime ?? new Date());
    const zip64 = entry.size >= zip64Threshold;
    const localOffset = offset;

    // --- encabezado local (tamaños van en el descriptor, al final) ---
    const extraLen = zip64 ? 20 : 0;
    const header = Buffer.alloc(30 + nameBuf.length + extraLen);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(zip64 ? 45 : 20, 4); // versión necesaria
    header.writeUInt16LE(0x0808, 6); // bit 3: descriptor de datos | bit 11: UTF-8
    header.writeUInt16LE(0, 8); // método: store
    header.writeUInt16LE(time, 10);
    header.writeUInt16LE(date, 12);
    header.writeUInt32LE(0, 14); // crc (va en el descriptor)
    header.writeUInt32LE(zip64 ? U32_MAX : 0, 18); // tamaño comprimido
    header.writeUInt32LE(zip64 ? U32_MAX : 0, 22); // tamaño sin comprimir
    header.writeUInt16LE(nameBuf.length, 26);
    header.writeUInt16LE(extraLen, 28);
    nameBuf.copy(header, 30);
    if (zip64) {
      const at = 30 + nameBuf.length;
      header.writeUInt16LE(0x0001, at); // cabecera ZIP64
      header.writeUInt16LE(16, at + 2);
      header.writeBigUInt64LE(0n, at + 4);
      header.writeBigUInt64LE(0n, at + 12);
    }
    yield header;
    offset += header.length;

    // --- contenido del archivo ---
    let crc = 0 ^ -1;
    let written = 0;
    const stream = fs.createReadStream(entry.absPath, { highWaterMark: 1024 * 1024 });
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      crc = crc32Update(crc, chunk);
      written += chunk.length;
      yield chunk;
    }
    crc = (crc ^ -1) >>> 0;
    offset += written;

    // --- descriptor de datos ---
    const descriptor = Buffer.alloc(zip64 ? 24 : 16);
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(crc, 4);
    if (zip64) {
      descriptor.writeBigUInt64LE(BigInt(written), 8);
      descriptor.writeBigUInt64LE(BigInt(written), 16);
    } else {
      descriptor.writeUInt32LE(written, 8);
      descriptor.writeUInt32LE(written, 12);
    }
    yield descriptor;
    offset += descriptor.length;

    central.push({ nameBuf, crc, size: written, offset: localOffset, time, date, zip64 });
  }

  // --- directorio central ---
  const cdStart = offset;
  for (const rec of central) {
    const needsZip64 = rec.zip64 || rec.offset >= zip64Threshold;
    const fields: Array<"size" | "offset"> = [];
    if (rec.zip64) fields.push("size");
    if (rec.offset >= zip64Threshold) fields.push("offset");
    const extraPayload = (rec.zip64 ? 16 : 0) + (rec.offset >= zip64Threshold ? 8 : 0);
    const extraLen = needsZip64 ? extraPayload + 4 : 0;

    const cd = Buffer.alloc(46 + rec.nameBuf.length + extraLen);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(45, 4); // versión del creador
    cd.writeUInt16LE(needsZip64 ? 45 : 20, 6);
    cd.writeUInt16LE(0x0808, 8);
    cd.writeUInt16LE(0, 10); // store
    cd.writeUInt16LE(rec.time, 12);
    cd.writeUInt16LE(rec.date, 14);
    cd.writeUInt32LE(rec.crc, 16);
    cd.writeUInt32LE(rec.zip64 ? U32_MAX : rec.size, 20);
    cd.writeUInt32LE(rec.zip64 ? U32_MAX : rec.size, 24);
    cd.writeUInt16LE(rec.nameBuf.length, 28);
    cd.writeUInt16LE(extraLen, 30);
    cd.writeUInt16LE(0, 32); // comentario
    cd.writeUInt16LE(0, 34); // disco
    cd.writeUInt16LE(0, 36); // atributos internos
    cd.writeUInt32LE(0, 38); // atributos externos
    cd.writeUInt32LE(rec.offset >= zip64Threshold ? U32_MAX : rec.offset, 42);
    rec.nameBuf.copy(cd, 46);

    if (needsZip64) {
      let at = 46 + rec.nameBuf.length;
      cd.writeUInt16LE(0x0001, at);
      cd.writeUInt16LE(extraPayload, at + 2);
      at += 4;
      if (rec.zip64) {
        cd.writeBigUInt64LE(BigInt(rec.size), at);
        cd.writeBigUInt64LE(BigInt(rec.size), at + 8);
        at += 16;
      }
      if (rec.offset >= zip64Threshold) {
        cd.writeBigUInt64LE(BigInt(rec.offset), at);
      }
    }

    yield cd;
    offset += cd.length;
  }

  const cdSize = offset - cdStart;
  const needsZip64End =
    central.length > 0xfffe || cdSize >= zip64Threshold || cdStart >= zip64Threshold;

  if (needsZip64End) {
    const z64 = Buffer.alloc(56);
    z64.writeUInt32LE(0x06064b50, 0);
    z64.writeBigUInt64LE(44n, 4); // tamaño de este registro - 12
    z64.writeUInt16LE(45, 12);
    z64.writeUInt16LE(45, 14);
    z64.writeUInt32LE(0, 16);
    z64.writeUInt32LE(0, 20);
    z64.writeBigUInt64LE(BigInt(central.length), 24);
    z64.writeBigUInt64LE(BigInt(central.length), 32);
    z64.writeBigUInt64LE(BigInt(cdSize), 40);
    z64.writeBigUInt64LE(BigInt(cdStart), 48);
    yield z64;

    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50, 0);
    locator.writeUInt32LE(0, 4);
    locator.writeBigUInt64LE(BigInt(offset), 8);
    locator.writeUInt32LE(1, 16);
    yield locator;
  }

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(needsZip64End ? 0xffff : central.length, 8);
  end.writeUInt16LE(needsZip64End ? 0xffff : central.length, 10);
  end.writeUInt32LE(cdSize >= zip64Threshold ? U32_MAX : cdSize, 12);
  end.writeUInt32LE(cdStart >= zip64Threshold ? U32_MAX : cdStart, 16);
  end.writeUInt16LE(0, 20);
  yield end;
}

/** Devuelve un stream con el ZIP de las entradas dadas. */
export function createZipStream(entries: ZipEntry[], options?: { zip64Threshold?: number }): Readable {
  const threshold = options?.zip64Threshold ?? U32_MAX;
  return Readable.from(zipGenerator(entries, threshold));
}
