export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ---------------------------------------------------------------------------
// Ingesta de videos de botón de pánico enviados por los NVR de la flota.
//
//   POST /api/integrations/panic-videos
//
// Modo A (recomendado): cuerpo binario (video/mp4) con los metadatos en la query
// string o en cabeceras x-panic-*. El archivo se escribe en streaming al volumen
// de almacenamiento, sin pasar por memoria, y se valida contra Content-Length.
//
// Modo B (compatibilidad): multipart/form-data con el campo `file`. Se acepta
// para no romper integraciones existentes, pero el cuerpo se carga en memoria y
// por eso tiene un tope menor.
//
// La especificación funcional está en docs/panic-videos-endpoint.md
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { PanicClipSegment, PanicClipStatus, PanicEventLogType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeBusCode } from "@/lib/integrations/tramas";
import { getClientIp } from "@/lib/security/client-ip";
import {
  PANIC_EXPECTED_CLIPS,
  PANIC_MAX_CLIP_BYTES,
  PANIC_MIN_CLIP_BYTES,
  isClipDurationAcceptable,
  targetSecondsForSegment,
} from "@/lib/panic/config";
import {
  buildClipRelPath,
  invalidateUsedBytesCache,
  pickVolumeForWrite,
  writeStreamToVolume,
} from "@/lib/panic/storage";

function bad(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...(extra ?? {}) }, { status });
}

function authOk(req: NextRequest) {
  const expected = [
    process.env.PANIC_INTEGRATION_SECRET,
    process.env.INTEGRATION_VIDEO_SECRET,
    process.env.INTEGRATION_INGEST_SECRET,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  if (!expected.length) return false; // sin secreto configurado el endpoint queda cerrado
  const provided = String(req.headers.get("x-integration-secret") ?? "").trim();
  return Boolean(provided) && expected.includes(provided);
}

/** Lee un parámetro desde query string, cabecera x-panic-<name> o formulario. */
function readParam(req: NextRequest, form: FormData | null, names: string[]): string | null {
  const url = new URL(req.url);
  for (const name of names) {
    const fromQuery = url.searchParams.get(name);
    if (fromQuery && fromQuery.trim()) return fromQuery.trim();

    const fromHeader = req.headers.get(`x-panic-${name}`);
    if (fromHeader && fromHeader.trim()) return fromHeader.trim();

    if (form) {
      const fromForm = form.get(name);
      if (typeof fromForm === "string" && fromForm.trim()) return fromForm.trim();
    }
  }
  return null;
}

// Zona horaria de la operación. Las tramas del NVR traen la hora local sin zona.
const TZ_OFFSET = process.env.PANIC_TIMEZONE_OFFSET || "-05:00";

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const limpio = value.trim();
  if (!limpio) return null;

  const numeric = Number(limpio);
  if (Number.isFinite(numeric) && numeric > 1000000000) {
    // epoch en segundos o milisegundos
    const ms = numeric > 1e12 ? numeric : numeric * 1000;
    const fromEpoch = new Date(ms);
    return Number.isNaN(fromEpoch.getTime()) ? null : fromEpoch;
  }

  // Formato de las tramas del NVR: dd/MM/yyyy HH:mm:ss(.SS) o con guiones.
  const nvr = limpio.match(
    /^(\d{2})[/-](\d{2})[/-](\d{4})[ T](\d{2}):(\d{2}):(\d{2})(?:[.,](\d{1,3}))?$/
  );
  if (nvr) {
    const [, dd, mm, yyyy, hh, mi, ss, frac] = nvr;
    const ms = String(frac ?? "0").padEnd(3, "0").slice(0, 3);
    const iso = `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}.${ms}${TZ_OFFSET}`;
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const normalized = limpio.includes("T") ? limpio : limpio.replace(" ", "T");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Identificación de la cámara. El NVR entrega códigos tipo "BV1-4": vagón 1,
 * cámara 4. Se conserva el código tal cual, se extrae el vagón y el número, y se
 * arma una clave normalizada para el control de duplicados.
 */
function parseCamera(codigo: string | null, channel: number | null) {
  const limpio = String(codigo ?? "").trim().toUpperCase();

  if (limpio) {
    const m = limpio.match(/^([A-Z]*\d*)[-_ ]?(\d+)$/);
    const wagon = m && m[1] ? m[1] : null;
    const numero = m && m[2] ? Number(m[2]) : channel;
    return {
      cameraCode: limpio,
      wagon,
      channel: Number.isFinite(numero as number) ? (numero as number) : null,
      cameraKey: limpio.replace(/[^A-Z0-9]/g, "-"),
      label: wagon ? `Cámara ${numero} · vagón ${wagon.replace(/^BV/, "")}` : `Cámara ${limpio}`,
    };
  }

  if (channel !== null) {
    return {
      cameraCode: null,
      wagon: null,
      channel,
      cameraKey: `CAM${channel}`,
      label: `Cámara ${channel}`,
    };
  }

  return { cameraCode: null, wagon: null, channel: null, cameraKey: "UNICO", label: "Cámara" };
}

function parseNumber(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value: string | null): number | null {
  const parsed = parseNumber(value);
  return parsed === null ? null : Math.trunc(parsed);
}

/**
 * Tramo del clip. Cada cámara envía dos por activación: el minuto anterior y los
 * cinco minutos posteriores. El dispositivo debería declararlo; si no lo hace, se
 * deduce por las marcas de tiempo o por la duración.
 */
function resolveSegment(params: {
  declarado: string | null;
  filename?: string | null;
  durationSec: number | null;
  startedAt: Date | null;
  endedAt: Date | null;
  eventAt: Date | null;
}): PanicClipSegment {
  const crudo = String(params.declarado ?? "").trim().toLowerCase();
  if (crudo) {
    if (/^(previo|previa|pre|antes|before|anterior)/.test(crudo)) return PanicClipSegment.PREVIO;
    if (/^(posterior|post|despues|después|after)/.test(crudo)) return PanicClipSegment.POSTERIOR;
  }

  // El NVR nombra los archivos con el tramo: ...-5MIN.mp4 y ...-1MIN.mp4
  const nombre = String(params.filename ?? "").toUpperCase();
  const marca = nombre.match(/(\d+)\s*MIN/);
  if (marca) {
    return Number(marca[1]) <= 2 ? PanicClipSegment.PREVIO : PanicClipSegment.POSTERIOR;
  }

  // Sin declaración: si el clip termina en el momento de la activación, es el previo.
  if (params.eventAt && params.endedAt && params.endedAt.getTime() <= params.eventAt.getTime() + 30_000) {
    return PanicClipSegment.PREVIO;
  }
  if (params.eventAt && params.startedAt && params.startedAt.getTime() < params.eventAt.getTime() - 30_000) {
    return PanicClipSegment.PREVIO;
  }

  // Último criterio: la duración. El clip previo dura un minuto; el posterior, cinco.
  if (params.durationSec && params.durationSec > 0) {
    const mitad = (targetSecondsForSegment("PREVIO") + targetSecondsForSegment("POSTERIOR")) / 2;
    return params.durationSec < mitad ? PanicClipSegment.PREVIO : PanicClipSegment.POSTERIOR;
  }

  return PanicClipSegment.POSTERIOR;
}

function segmentoLegible(segment: PanicClipSegment) {
  return segment === PanicClipSegment.PREVIO ? "previo" : "posterior";
}

function safeFilename(value: string | null, cameraKey: string, fallbackId: string, segment: PanicClipSegment) {
  const base = String(value ?? "").split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
  if (clean && /\.(mp4|avi|mkv|mov|ts)$/i.test(clean)) return clean;
  // Sin nombre útil se arma uno determinista: el reenvío del mismo clip
  // resuelve la misma ruta y no deja archivos huérfanos.
  const suffix = cameraKey ? `_${cameraKey.replace(/[^a-zA-Z0-9._-]/g, "_")}` : "";
  const id = String(fallbackId ?? "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60) || "evento";
  return `${id}${suffix}_${segmentoLegible(segment)}.mp4`;
}

function isFileLike(value: FormDataEntryValue | null): value is File {
  return Boolean(value && typeof value === "object" && "arrayBuffer" in value && "size" in value);
}

export async function POST(req: NextRequest) {
  if (!authOk(req)) return bad(401, "No autenticado");

  const contentType = String(req.headers.get("content-type") ?? "").toLowerCase();
  const isMultipart = contentType.includes("multipart/form-data");

  // En multipart el cuerpo se materializa en memoria: tope más bajo y explícito.
  const multipartMaxBytes = Math.min(
    PANIC_MAX_CLIP_BYTES,
    Number(process.env.PANIC_MULTIPART_MAX_BYTES ?? 512 * 1024 * 1024)
  );

  const form = isMultipart ? await req.formData().catch(() => null) : null;
  if (isMultipart && !form) return bad(400, "No se pudo leer el multipart");

  const tenantCode =
    readParam(req, form, ["tenantcode", "tenantCode"]) ??
    req.headers.get("x-tenant-code") ??
    process.env.INTEGRATION_DEFAULT_TENANT_CODE ??
    null;

  if (!tenantCode) {
    return bad(400, "Tenant no indicado", {
      details: "Envíe x-tenant-code o configure INTEGRATION_DEFAULT_TENANT_CODE",
    });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { code: tenantCode },
    select: { id: true, code: true },
  });
  if (!tenant) return bad(400, "Tenant no encontrado", { tenantCode });

  // Se aceptan tanto los nombres de esta especificación como los que ya emite el
  // NVR en sus tramas (idVehiculo, codigoCamara, infoVideo_duration, etc.), para
  // que el proveedor no tenga que renombrar lo que ya produce.
  const vehicleId = readParam(req, form, [
    "vehicleid",
    "vehicleId",
    "buscode",
    "busCode",
    "idvehiculo",
    "idVehiculo",
  ]);
  const busCode = vehicleId ? normalizeBusCode(vehicleId) : null;
  const deviceId = readParam(req, form, ["deviceid", "deviceId", "idequipo", "idnvr", "idOperador"]);
  const cameraParam = readParam(req, form, [
    "camera",
    "cameracode",
    "cameraCode",
    "codigocamara",
    "codigoCamara",
  ]);
  const channelParam = parseInteger(readParam(req, form, ["channel", "chn", "canal"]));
  const camara = parseCamera(cameraParam, channelParam);
  const channel = camara.channel;
  const eventAt = parseDate(
    readParam(req, form, [
      "eventtime",
      "eventAt",
      "alarmtime",
      "idocurrenciaevento",
      "idOcurrenciaEvento",
      "fechahorahistorico",
      "fechaHoraHistorico",
    ])
  );
  const startedAt = parseDate(
    readParam(req, form, [
      "starttime",
      "startAt",
      "infovideo_fechainiciograbacion",
      "infoVideo_fechaInicioGrabacion",
    ])
  );
  const endedAt = parseDate(
    readParam(req, form, [
      "endtime",
      "endAt",
      "infovideo_fechafingrabacion",
      "infoVideo_fechaFinGrabacion",
    ])
  );
  const durationSec = parseInteger(
    readParam(req, form, ["duration", "durationsec", "infovideo_duration", "infoVideo_duration"])
  );
  const latitude = parseNumber(
    readParam(req, form, [
      "lat",
      "latitude",
      "localizacionvehiculo_latitud",
      "localizacionVehiculo_latitud",
    ])
  );
  const longitude = parseNumber(
    readParam(req, form, [
      "lon",
      "lng",
      "longitude",
      "localizacionvehiculo_longitud",
      "localizacionVehiculo_longitud",
    ])
  );
  const speedKmh = parseNumber(readParam(req, form, ["speed", "speedkmh", "velocidad"]));
  const alarmCode = readParam(req, form, ["alarmcode", "alarmCode", "codigoevento", "codigoEvento"]);
  const alarmLabel = readParam(req, form, ["alarmlabel", "alarmLabel"]);
  const checksum = readParam(req, form, ["checksum", "md5", "sha256", "md5hash", "md5Hash"]);
  const expectedClipsParam = parseInteger(readParam(req, form, ["expectedclips", "totalclips"]));
  const filenameParam = readParam(req, form, [
    "filename",
    "name",
    "nombrearchivovideo",
    "nombreArchivoVideo",
  ]);
  const segmentParam = readParam(req, form, ["segment", "tramo", "parte", "part", "tipo"]);
  const sizeParam = parseInteger(readParam(req, form, ["size", "sizebytes", "tamano"]));

  const eventReference = eventAt ?? startedAt ?? new Date();
  const externalEventId =
    readParam(req, form, [
      "eventid",
      "eventId",
      "registerid",
      "registerId",
      "alarmid",
      "idregistroevento",
      "idRegistroEvento",
    ]) ??
    `${busCode ?? deviceId ?? "SIN_BUS"}-${eventReference.toISOString().replace(/[:.]/g, "")}`;

  const bus = busCode
    ? await prisma.bus.findFirst({
        where: { tenantId: tenant.id, code: busCode },
        select: { id: true, code: true, plate: true },
      })
    : null;

  const requestMeta: Prisma.JsonObject = {
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent"),
    contentType,
    host: req.headers.get("host"),
    mode: isMultipart ? "multipart" : "stream",
  };

  // 1) Evento (agrupa los clips de la misma activación del botón).
  const event = await prisma.panicEvent.upsert({
    where: { tenantId_externalEventId: { tenantId: tenant.id, externalEventId } },
    create: {
      tenantId: tenant.id,
      busId: bus?.id ?? null,
      busCode: bus?.code ?? busCode,
      plate: bus?.plate ?? null,
      externalEventId,
      deviceId,
      vehicleId,
      alarmCode,
      alarmLabel,
      eventAt: eventAt ?? startedAt ?? null,
      latitude,
      longitude,
      speedKmh,
      expectedClips: expectedClipsParam ?? PANIC_EXPECTED_CLIPS,
      requestMeta,
    },
    update: {
      busId: bus?.id ?? undefined,
      busCode: bus?.code ?? busCode ?? undefined,
      plate: bus?.plate ?? undefined,
      deviceId: deviceId ?? undefined,
      alarmCode: alarmCode ?? undefined,
      alarmLabel: alarmLabel ?? undefined,
      eventAt: eventAt ?? undefined,
      latitude: latitude ?? undefined,
      longitude: longitude ?? undefined,
      speedKmh: speedKmh ?? undefined,
      ...(expectedClipsParam ? { expectedClips: expectedClipsParam } : {}),
    },
    select: { id: true, expectedClips: true, busCode: true },
  });

  // 2) Tramo del clip y ruta destino (determinista: el reenvío no duplica archivos).
  const segment = resolveSegment({
    declarado: segmentParam,
    filename: filenameParam,
    durationSec,
    startedAt,
    endedAt,
    eventAt: eventAt ?? startedAt ?? null,
  });

  const filename = safeFilename(filenameParam, camara.cameraKey, externalEventId, segment);
  const relPath = buildClipRelPath({
    tenantCode: tenant.code,
    eventAt: eventReference,
    busCode: event.busCode ?? busCode,
    externalEventId,
    cameraKey: camara.cameraKey,
    segment,
    filename,
  });

  // 3) Idempotencia: si ese clip ya llegó completo, no se vuelve a escribir.
  const existing = await prisma.panicVideoClip.findUnique({
    where: {
      eventId_cameraKey_segment: { eventId: event.id, cameraKey: camara.cameraKey, segment },
    },
    select: { id: true, status: true, filePath: true, storage: true, sizeBytes: true },
  });

  if (existing && existing.status === PanicClipStatus.COMPLETO) {
    return NextResponse.json(
      {
        ok: true,
        duplicate: true,
        eventId: event.id,
        clipId: existing.id,
        message: `El clip ${segmentoLegible(segment)} de esa cámara ya estaba registrado para el evento`,
      },
      { status: 200 }
    );
  }

  // 4) Cuerpo del video.
  const headerLength = Number(req.headers.get("content-length") ?? 0);
  let declaredLength = Number.isFinite(headerLength) && headerLength > 0 ? headerLength : 0;
  if (!declaredLength && sizeParam && sizeParam > 0) declaredLength = sizeParam;

  const picked = await pickVolumeForWrite(declaredLength);
  if (!picked) {
    await prisma.panicEventLog.create({
      data: {
        eventId: event.id,
        type: PanicEventLogType.CLIP_FALLIDO,
        message: "Sin espacio disponible en los volúmenes de almacenamiento",
        meta: { camera: camara.cameraCode ?? channel, segment },
      },
    });
    return bad(507, "Sin espacio de almacenamiento disponible");
  }

  let bytesWritten = 0;
  let originalName: string | null = filenameParam;
  let mimeType = "video/mp4";

  try {
    if (isMultipart) {
      const file = form?.get("file") ?? form?.get("video") ?? null;
      if (!isFileLike(file) || file.size <= 0) return bad(400, "Falta el archivo de video (campo file)");
      if (file.size > multipartMaxBytes) {
        return bad(413, "El clip supera el máximo permitido en modo multipart", {
          maxBytes: multipartMaxBytes,
          recomendacion: "Usar envío binario (Content-Type: video/mp4) para clips grandes",
        });
      }
      originalName = originalName ?? (file.name || null);
      mimeType = file.type || mimeType;
      declaredLength = file.size;
      const written = await writeStreamToVolume({
        volume: picked.volume,
        relPath,
        body: file.stream(),
        maxBytes: PANIC_MAX_CLIP_BYTES,
      });
      bytesWritten = written.bytesWritten;
    } else {
      if (!req.body) return bad(400, "Cuerpo vacío: se espera el video en binario");
      const declaredMime = contentType.split(";")[0]?.trim();
      // application/octet-stream no sirve para reproducir en el navegador.
      mimeType = declaredMime && declaredMime.startsWith("video/") ? declaredMime : "video/mp4";
      const written = await writeStreamToVolume({
        volume: picked.volume,
        relPath,
        body: req.body as ReadableStream<Uint8Array>,
        maxBytes: PANIC_MAX_CLIP_BYTES,
      });
      bytesWritten = written.bytesWritten;
    }
  } catch (error: any) {
    const message = String(error?.message ?? error);
    await prisma.panicEventLog.create({
      data: {
        eventId: event.id,
        type: PanicEventLogType.CLIP_FALLIDO,
        message: `Error escribiendo el clip: ${message}`,
        meta: { camera: camara.cameraCode ?? channel, segment, volume: picked.volume.key },
      },
    });
    return bad(500, "No se pudo almacenar el clip", { details: message });
  }

  // 5) Validación del cargue: tamaño mínimo, coincidencia con el tamaño declarado y duración.
  const declaredOk = declaredLength <= 0 || declaredLength === bytesWritten;

  const durationOk = isClipDurationAcceptable(durationSec, segment);
  const sizeOk = bytesWritten >= PANIC_MIN_CLIP_BYTES;

  const status: PanicClipStatus =
    declaredOk && sizeOk ? PanicClipStatus.COMPLETO : PanicClipStatus.INCOMPLETO;

  const errorDetail = !sizeOk
    ? `Clip demasiado pequeño (${bytesWritten} bytes)`
    : !declaredOk
    ? `Bytes recibidos (${bytesWritten}) distintos de Content-Length (${declaredLength})`
    : !durationOk
    ? `Duración fuera del rango esperado (${durationSec}s)`
    : null;

  const now = new Date();
  const clipData = {
    tenantId: tenant.id,
    eventId: event.id,
    cameraCode: camara.cameraCode,
    cameraKey: camara.cameraKey,
    wagon: camara.wagon,
    channel,
    segment,
    cameraLabel: `${camara.label} · ${
      segment === PanicClipSegment.PREVIO ? "minuto previo" : "cinco minutos posteriores"
    }`,
    filename,
    originalName,
    filePath: `${picked.volume.key}/${relPath}`,
    storage: picked.volume.key,
    mimeType,
    sizeBytes: BigInt(bytesWritten),
    declaredBytes: declaredLength > 0 ? BigInt(declaredLength) : null,
    durationSec,
    startedAt,
    endedAt,
    checksum,
    status,
    error: errorDetail,
    receivedAt: now,
    requestMeta,
  };

  const clip = existing
    ? await prisma.panicVideoClip.update({ where: { id: existing.id }, data: clipData, select: { id: true } })
    : await prisma.panicVideoClip.create({ data: clipData, select: { id: true } });

  // La contabilidad de consumo por volumen cambió: se recalcula en la próxima lectura.
  invalidateUsedBytesCache();

  // 6) Recalcular la completitud del evento.
  const clips = await prisma.panicVideoClip.findMany({
    where: { eventId: event.id },
    select: { status: true, sizeBytes: true, receivedAt: true },
  });

  const completos = clips.filter((item) => item.status === PanicClipStatus.COMPLETO);
  const totalBytes = clips.reduce((acc, item) => acc + BigInt(item.sizeBytes ?? 0), BigInt(0));
  const expected = event.expectedClips || PANIC_EXPECTED_CLIPS;
  const times = clips.map((item) => item.receivedAt.getTime());

  await prisma.panicEvent.update({
    where: { id: event.id },
    data: {
      receivedClips: completos.length,
      totalBytes,
      complete: expected > 0 ? completos.length >= expected : completos.length > 0,
      firstClipAt: times.length ? new Date(Math.min(...times)) : null,
      lastClipAt: times.length ? new Date(Math.max(...times)) : null,
    },
  });

  await prisma.panicEventLog.create({
    data: {
      eventId: event.id,
      type: status === PanicClipStatus.COMPLETO ? PanicEventLogType.CLIP_RECIBIDO : PanicEventLogType.CLIP_FALLIDO,
      message:
        status === PanicClipStatus.COMPLETO
          ? `Clip ${segmentoLegible(segment)} recibido de ${camara.label} (${bytesWritten} bytes)`
          : `Clip con inconsistencias: ${errorDetail}`,
      meta: {
        camera: camara.cameraCode ?? channel,
        segment,
        volume: picked.volume.key,
        bytesWritten,
        declaredLength,
      },
    },
  });

  if (status !== PanicClipStatus.COMPLETO) {
    // 4xx para que el NVR reintente el envío de esa cámara.
    return NextResponse.json(
      {
        ok: false,
        error: "Cargue incompleto",
        details: errorDetail,
        eventId: event.id,
        clipId: clip.id,
        bytesWritten,
        retry: true,
      },
      { status: 422 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      eventId: event.id,
      externalEventId,
      clipId: clip.id,
      busCode: event.busCode,
      busMatched: Boolean(bus),
      channel,
      camera: camara.cameraCode ?? (channel === null ? null : `CAM${channel}`),
      segment,
      storage: picked.volume.key,
      bytesWritten,
      receivedClips: completos.length,
      expectedClips: expected,
      complete: expected > 0 ? completos.length >= expected : completos.length > 0,
    },
    { status: 201 }
  );
}

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      endpoint: "/api/integrations/panic-videos",
      metodo: "POST",
      documentacion: "docs/panic-videos-endpoint.md",
    },
    { status: 200 }
  );
}
