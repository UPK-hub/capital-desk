/**
 * Resuelve el archivo de video al que se refiere una petición de
 * previsualización, sin importar de qué módulo venga:
 *
 *   ?path=<ruta dentro de uploads>  -> adjuntos de solicitudes de video,
 *                                      videos por cámara, evidencias, chat...
 *   ?clip=<id>                      -> clips del botón de pánico (viven en los
 *                                      volúmenes CBSTS1/CBSTS2, no en uploads)
 *
 * Cada origen valida sus propios permisos.
 */
import fs from "node:fs";
import { prisma } from "@/lib/prisma";
import { canViewPanic } from "@/lib/panic/access";
import { resolveStoredClipPath } from "@/lib/panic/storage";
import { resolveOriginal } from "@/lib/media-transcode";

export type MediaTarget = {
  /** Identidad estable del archivo (para la clave de caché). */
  identity: string;
  /** Ruta absoluta en el disco del servidor. */
  abs: string;
  /** Nombre con extensión, para deducir el contenedor. */
  name: string;
};

export type MediaTargetError = { status: number; error: string };

export async function resolveMediaTarget(
  params: URLSearchParams,
  user: any
): Promise<MediaTarget | MediaTargetError> {
  const clipId = String(params.get("clip") ?? "").trim();

  if (clipId) {
    if (!canViewPanic(user)) return { status: 403, error: "No autorizado" };
    const tenantId = user?.tenantId as string;
    const clip = await prisma.panicVideoClip.findFirst({
      where: { id: clipId, tenantId },
      select: { filePath: true, storage: true, filename: true },
    });
    if (!clip) return { status: 404, error: "Clip no encontrado" };

    const abs = resolveStoredClipPath(clip.storage, clip.filePath);
    if (!abs) return { status: 503, error: "Volumen de almacenamiento no configurado" };
    if (!fs.existsSync(abs)) return { status: 404, error: "El archivo del clip no está disponible" };

    return { identity: `panic:${clipId}`, abs, name: clip.filename || clip.filePath };
  }

  const relRaw = String(params.get("path") ?? "").trim();
  if (!relRaw) return { status: 400, error: "Falta el parámetro path" };

  const resolved = resolveOriginal(relRaw);
  if (!resolved) return { status: 400, error: "Ruta inválida" };
  if (!fs.existsSync(resolved.abs)) {
    return { status: 404, error: "El archivo no está en el disco del servidor; solo se puede descargar." };
  }

  return { identity: `upload:${resolved.rel}`, abs: resolved.abs, name: resolved.rel };
}

export function isTargetError(t: MediaTarget | MediaTargetError): t is MediaTargetError {
  return (t as MediaTargetError).error !== undefined;
}
