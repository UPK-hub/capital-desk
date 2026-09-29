/**
 * Cola de replicacion de los videos de solicitudes de descarga al OneDrive
 * del cliente.
 *
 * El cargue en la mesa nunca espera a Graph: al subir un adjunto solo se
 * marca odStatus = PENDIENTE y este modulo, ejecutado por el proceso
 * onedrive-sync, hace la subida real con reintentos.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { OneDriveSyncStatus, VideoAttachmentKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveUploadPath } from "@/lib/uploads";
import {
  ONEDRIVE_BATCH_SIZE,
  ONEDRIVE_MAX_ATTEMPTS,
  ONEDRIVE_ROOT_FOLDER,
  ONEDRIVE_SYNC_ENABLED,
  backoffMs,
  onedriveConfigured,
} from "./config";
import { GraphError, limpiarNombre, subirArchivo } from "./graph";

/** Devuelve el anio y el mes en zona Bogota, con dos digitos el mes. */
export function anioMesBogota(fecha: Date): { anio: string; mes: string } {
  const partes = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(fecha);
  const anio = partes.find((p) => p.type === "year")?.value ?? "0000";
  const mes = partes.find((p) => p.type === "month")?.value ?? "00";
  return { anio, mes };
}

/**
 * Ruta destino dentro del OneDrive:
 *   Descargas de video Capital Desk / 2026 / 09 / BUS 5001 - CASO 1234 / archivo.mp4
 *
 * El anio y el mes se toman de la FECHA DE CREACION DE LA SOLICITUD, no de la
 * fecha de cargue, para que todos los videos de un mismo caso queden juntos
 * aunque el tecnico los suba dias despues.
 */
export function construirRutaRemota(datos: {
  creadoEn: Date;
  codigoBus: string | null | undefined;
  caseNo: number | null | undefined;
  nombreArchivo: string;
}): string {
  const { anio, mes } = anioMesBogota(datos.creadoEn);
  const bus = limpiarNombre(datos.codigoBus ? `BUS ${datos.codigoBus}` : "BUS SIN CODIGO");
  const caso = datos.caseNo != null ? `CASO ${datos.caseNo}` : "CASO SIN NUMERO";
  const carpetaCaso = limpiarNombre(`${bus} - ${caso}`);
  const archivo = limpiarNombre(datos.nombreArchivo);
  return [ONEDRIVE_ROOT_FOLDER, anio, mes, carpetaCaso, archivo].join("/");
}

/**
 * Marca un adjunto para que el worker lo replique.
 * Seguro de llamar siempre: si el modulo esta apagado no hace nada.
 */
export async function encolarAdjunto(attachmentId: string): Promise<void> {
  if (!ONEDRIVE_SYNC_ENABLED) return;
  try {
    await prisma.videoAttachment.update({
      where: { id: attachmentId },
      data: { odStatus: OneDriveSyncStatus.PENDIENTE, odNextAttemptAt: new Date(), odError: null },
    });
  } catch (error) {
    console.error("ONEDRIVE_ENCOLAR_FALLO", { attachmentId, error: String((error as any)?.message ?? error) });
  }
}

type Resultado = { ok: boolean; motivo?: string };

/** Replica un adjunto concreto. Devuelve si quedo replicado. */
export async function replicarAdjunto(attachmentId: string): Promise<Resultado> {
  const adjunto = await prisma.videoAttachment.findUnique({
    where: { id: attachmentId },
    include: {
      request: {
        select: {
          case: { select: { caseNo: true, createdAt: true, bus: { select: { code: true } } } },
        },
      },
    },
  });

  if (!adjunto) return { ok: false, motivo: "El adjunto ya no existe" };

  if (!adjunto.active) {
    await prisma.videoAttachment.update({
      where: { id: attachmentId },
      data: { odStatus: OneDriveSyncStatus.OMITIDO, odError: "Adjunto eliminado en la mesa" },
    });
    return { ok: false, motivo: "Adjunto inactivo" };
  }

  const nombre = adjunto.originalName || path.basename(adjunto.filePath);
  const rutaRemota = construirRutaRemota({
    creadoEn: adjunto.request?.case?.createdAt ?? adjunto.createdAt,
    codigoBus: adjunto.request?.case?.bus?.code,
    caseNo: adjunto.request?.case?.caseNo,
    nombreArchivo: nombre,
  });

  let rutaLocal: string;
  let tamano: number;
  try {
    rutaLocal = resolveUploadPath(adjunto.filePath);
    const stat = await fs.stat(rutaLocal);
    tamano = stat.size;
  } catch {
    // El archivo ya no esta en disco (purga manual, por ejemplo): no hay nada
    // que replicar y no tiene sentido reintentar.
    await prisma.videoAttachment.update({
      where: { id: attachmentId },
      data: {
        odStatus: OneDriveSyncStatus.OMITIDO,
        odError: "El archivo ya no esta en el disco del servidor",
        odNextAttemptAt: null,
      },
    });
    return { ok: false, motivo: "Archivo ausente en disco" };
  }

  await prisma.videoAttachment.update({
    where: { id: attachmentId },
    data: { odStatus: OneDriveSyncStatus.SUBIENDO, odPath: rutaRemota },
  });

  try {
    const subido = await subirArchivo({
      rutaRemota,
      rutaLocal,
      tamano,
      mimeType: adjunto.mimeType,
    });

    if (Number(subido.size) !== tamano) {
      throw new GraphError(
        `Tamano distinto tras subir: local ${tamano}, remoto ${subido.size}`,
        0,
        true
      );
    }

    await prisma.videoAttachment.update({
      where: { id: attachmentId },
      data: {
        odStatus: OneDriveSyncStatus.REPLICADO,
        odItemId: subido.id,
        odWebUrl: subido.webUrl,
        odPath: rutaRemota,
        odSyncedAt: new Date(),
        odError: null,
        odNextAttemptAt: null,
      },
    });
    return { ok: true };
  } catch (error) {
    const mensaje = String((error as any)?.message ?? error).slice(0, 500);
    const intentos = (adjunto.odAttempts ?? 0) + 1;
    const sinCupo = error instanceof GraphError && error.status === 507;
    const agotado = intentos >= ONEDRIVE_MAX_ATTEMPTS && !sinCupo;

    await prisma.videoAttachment.update({
      where: { id: attachmentId },
      data: {
        odStatus: agotado ? OneDriveSyncStatus.ERROR : OneDriveSyncStatus.PENDIENTE,
        odAttempts: intentos,
        odError: mensaje,
        odNextAttemptAt: agotado ? null : new Date(Date.now() + backoffMs(intentos)),
      },
    });

    return { ok: false, motivo: mensaje };
  }
}

/** Toma los adjuntos vencidos y los replica de a uno. */
export async function procesarPendientes(limite = ONEDRIVE_BATCH_SIZE): Promise<{
  tomados: number;
  replicados: number;
  fallidos: number;
}> {
  if (!ONEDRIVE_SYNC_ENABLED || !onedriveConfigured()) {
    return { tomados: 0, replicados: 0, fallidos: 0 };
  }

  const ahora = new Date();
  const pendientes = await prisma.videoAttachment.findMany({
    where: {
      active: true,
      kind: VideoAttachmentKind.VIDEO,
      odStatus: OneDriveSyncStatus.PENDIENTE,
      OR: [{ odNextAttemptAt: null }, { odNextAttemptAt: { lte: ahora } }],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
    take: limite,
  });

  let replicados = 0;
  let fallidos = 0;
  for (const p of pendientes) {
    const r = await replicarAdjunto(p.id);
    if (r.ok) replicados += 1;
    else fallidos += 1;
  }

  return { tomados: pendientes.length, replicados, fallidos };
}

/** Resumen para el tablero y para el comando de estado. */
export async function resumenCola() {
  const filas = await prisma.videoAttachment.groupBy({
    by: ["odStatus"],
    _count: { _all: true },
    where: { odStatus: { not: null } },
  });
  const out: Record<string, number> = {};
  for (const f of filas) out[String(f.odStatus)] = f._count._all;
  return out;
}
