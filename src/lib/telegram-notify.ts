// src/lib/telegram-notify.ts
//
// Avisos del lado servidor al grupo de Telegram de novedades (el mismo grupo
// "Tickets de novedades capitalbus" que usa el bot). Se usa, por ejemplo, para
// avisar cuando una novedad se cierra (la creación la publica el propio bot).
//
// Usa las mismas variables que el bot: TELEGRAM_BOT_TOKEN + TELEGRAM_GROUP_CHAT_ID.
// Es seguro: si faltan variables o falla la red, no hace nada y nunca lanza.
import { prisma } from "@/lib/prisma";
import { CaseEventType, CaseStatus, CaseType } from "@prisma/client";

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TG_GROUP = (process.env.TELEGRAM_GROUP_CHAT_ID || "").trim();
const TG_PREV_GROUP = (process.env.TELEGRAM_PREVENTIVOS_GROUP_CHAT_ID || "").trim();

function mesaBaseUrl(): string {
  return (process.env.APP_URL || process.env.NEXTAUTH_URL || "").trim().replace(/\/+$/, "");
}

/** Envía un mensaje a un chat de Telegram. No lanza. */
async function postToChat(
  chatId: string,
  text: string,
  opts?: { markup?: unknown; markdown?: boolean }
): Promise<void> {
  if (!TG_TOKEN || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...(opts?.markdown === false ? {} : { parse_mode: "Markdown" }),
        ...(opts?.markup ? { reply_markup: opts.markup } : {}),
      }),
    });
  } catch (e) {
    console.error("TELEGRAM_NOTIFY_FAILED", e);
  }
}

/** Envía al grupo de novedades. No lanza. */
export async function sendTelegramGroup(text: string, replyMarkup?: unknown): Promise<void> {
  await postToChat(TG_GROUP, text, { markup: replyMarkup });
}

/**
 * Avisa al grupo que una NOVEDAD se cerró. Pensado para llamarse en fire-and-forget
 * (try/catch interno; nunca rompe el flujo que la invoca).
 */
export async function notifyNovedadClosed(
  caseId: string,
  opts?: { closedById?: string | null; auto?: boolean }
): Promise<void> {
  if (!TG_TOKEN || !TG_GROUP) return;
  try {
    const c = await prisma.case.findFirst({
      where: { id: caseId, type: CaseType.NOVEDAD },
      select: {
        id: true,
        caseNo: true,
        status: true,
        title: true,
        bus: { select: { code: true, plate: true } },
      },
    });
    if (!c || c.status !== CaseStatus.CERRADO) return;

    let closer = opts?.auto ? "Automático (casos resueltos)" : "—";
    if (!opts?.auto && opts?.closedById) {
      const u = await prisma.user.findFirst({
        where: { id: opts.closedById },
        select: { name: true },
      });
      if (u?.name) closer = u.name;
    }

    const ref = `CASO-${String(c.caseNo ?? "").padStart(3, "0")}`;
    const plate = c.bus?.plate ? ` (${c.bus.plate})` : "";
    const text = [
      `✅ *Novedad cerrada* ${ref}`,
      `🚌 Bus: ${c.bus?.code ?? "—"}${plate}`,
      c.title ? `🧩 ${c.title}` : null,
      `👤 Cerró: ${closer}`,
    ]
      .filter(Boolean)
      .join("\n");

    const base = mesaBaseUrl();
    const markup = base
      ? { inline_keyboard: [[{ text: "🔗 Ver la novedad", url: `${base}/cases/${c.id}` }]] }
      : undefined;

    await sendTelegramGroup(text, markup);
  } catch (e) {
    console.error("NOTIFY_NOVEDAD_CLOSED_FAILED", e);
  }
}

/**
 * Avisa al grupo que una NOVEDAD se REABRIÓ (p. ej. al eliminar el correctivo
 * que la había resuelto). Fire-and-forget; nunca lanza.
 */
export async function notifyNovedadReopened(
  caseId: string,
  opts?: { by?: string | null }
): Promise<void> {
  if (!TG_TOKEN || !TG_GROUP) return;
  try {
    const c = await prisma.case.findFirst({
      where: { id: caseId, type: CaseType.NOVEDAD },
      select: {
        id: true,
        caseNo: true,
        status: true,
        title: true,
        bus: { select: { code: true, plate: true } },
      },
    });
    if (!c || c.status === CaseStatus.CERRADO) return;

    let actor = "—";
    if (opts?.by) {
      const u = await prisma.user.findFirst({ where: { id: opts.by }, select: { name: true } });
      if (u?.name) actor = u.name;
    }

    const ref = `CASO-${String(c.caseNo ?? "").padStart(3, "0")}`;
    const plate = c.bus?.plate ? ` (${c.bus.plate})` : "";
    const text = [
      `🔄 Novedad reabierta — ${ref}`,
      `🚌 Bus: ${c.bus?.code ?? "—"}${plate}`,
      c.title ? `🧩 ${c.title}` : null,
      `ℹ️ Motivo: se eliminó el correctivo que la había resuelto.`,
      actor !== "—" ? `👤 ${actor}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    await postToChat(TG_GROUP, text, { markdown: false, markup: caseLinkMarkup(c.id, "🔗 Ver la novedad") });
  } catch (e) {
    console.error("NOTIFY_NOVEDAD_REOPENED_FAILED", e);
  }
}

/** Enlace "Ver la solicitud" al caso (si hay APP_URL configurada). */
function caseLinkMarkup(caseId: string, label: string): unknown {
  const base = mesaBaseUrl();
  return base ? { inline_keyboard: [[{ text: label, url: `${base}/cases/${caseId}` }]] } : undefined;
}

const DOWNLOAD_STATUS_LABEL: Record<string, string> = {
  DESCARGA_REALIZADA: "Descarga realizada",
  DESCARGA_FALLIDA: "Descarga fallida",
  BUS_NO_EN_PATIO: "Bus no estaba en patio",
  PENDIENTE: "Pendiente",
};

/**
 * Avisa al grupo de novedades que se CREÓ una solicitud de descarga de video.
 * Seguro: try/catch interno, nunca lanza. Sin Markdown (los textos son libres).
 */
export async function notifyVideoRequestCreated(caseId: string): Promise<void> {
  if (!TG_TOKEN || !TG_GROUP) return;
  try {
    const c = await prisma.case.findFirst({
      where: { id: caseId, type: CaseType.SOLICITUD_DESCARGA_VIDEO },
      select: {
        id: true,
        caseNo: true,
        title: true,
        bus: { select: { code: true, plate: true } },
        videoDownloadRequest: { select: { requesterName: true, descriptionNovedad: true } },
      },
    });
    if (!c) return;
    const ref = `CASO-${String(c.caseNo ?? "").padStart(3, "0")}`;
    const plate = c.bus?.plate ? ` (${c.bus.plate})` : "";
    const vr = c.videoDownloadRequest;
    const text = [
      `🎥 Nueva solicitud de descarga de video — ${ref}`,
      `🚌 Bus: ${c.bus?.code ?? "—"}${plate}`,
      vr?.descriptionNovedad ? `📝 ${vr.descriptionNovedad}` : c.title ? `📝 ${c.title}` : null,
      vr?.requesterName ? `👤 Solicita: ${vr.requesterName}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    await postToChat(TG_GROUP, text, { markdown: false, markup: caseLinkMarkup(c.id, "🔗 Ver la solicitud") });
  } catch (e) {
    console.error("NOTIFY_VIDEO_CREATED_FAILED", e);
  }
}

/**
 * Avisa al grupo de novedades que una solicitud de descarga de video se CERRÓ.
 * Seguro: try/catch interno, nunca lanza.
 */
export async function notifyVideoRequestClosed(caseId: string): Promise<void> {
  if (!TG_TOKEN || !TG_GROUP) return;
  try {
    const c = await prisma.case.findFirst({
      where: { id: caseId, type: CaseType.SOLICITUD_DESCARGA_VIDEO },
      select: {
        id: true,
        caseNo: true,
        bus: { select: { code: true, plate: true } },
        videoDownloadRequest: { select: { downloadStatus: true } },
      },
    });
    if (!c) return;
    const ref = `CASO-${String(c.caseNo ?? "").padStart(3, "0")}`;
    const plate = c.bus?.plate ? ` (${c.bus.plate})` : "";
    const ds = c.videoDownloadRequest?.downloadStatus as string | undefined;
    const text = [
      `✅ Descarga de video cerrada — ${ref}`,
      `🚌 Bus: ${c.bus?.code ?? "—"}${plate}`,
      ds ? `📥 Estado: ${DOWNLOAD_STATUS_LABEL[ds] ?? ds}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    await postToChat(TG_GROUP, text, { markdown: false, markup: caseLinkMarkup(c.id, "🔗 Ver la solicitud") });
  } catch (e) {
    console.error("NOTIFY_VIDEO_CLOSED_FAILED", e);
  }
}

/**
 * Avisa al grupo de novedades que hubo DESCARGA FALLIDA en una o varias cámaras.
 * Incluye bus, cámara(s) y causa raíz. Seguro: try/catch interno, nunca lanza.
 */
export async function notifyVideoDownloadFailed(
  caseId: string,
  info: { cameras: string[]; rootCause?: string | null }
): Promise<void> {
  if (!TG_TOKEN || !TG_GROUP) return;
  try {
    const c = await prisma.case.findFirst({
      where: { id: caseId, type: CaseType.SOLICITUD_DESCARGA_VIDEO },
      select: { id: true, caseNo: true, bus: { select: { code: true, plate: true } } },
    });
    if (!c) return;
    const ref = `CASO-${String(c.caseNo ?? "").padStart(3, "0")}`;
    const plate = c.bus?.plate ? ` (${c.bus.plate})` : "";
    const cams = (info.cameras || []).filter(Boolean);
    const text = [
      `⛔ Descarga de video FALLIDA — ${ref}`,
      `🚌 Bus: ${c.bus?.code ?? "—"}${plate}`,
      cams.length ? `📷 Cámara(s): ${cams.join(", ")}` : null,
      info.rootCause ? `❗ Causa: ${info.rootCause}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    await postToChat(TG_GROUP, text, { markdown: false, markup: caseLinkMarkup(c.id, "🔗 Ver la solicitud") });
  } catch (e) {
    console.error("NOTIFY_VIDEO_FAILED_FAILED", e);
  }
}

/**
 * Avisa al grupo de PREVENTIVOS que un preventivo se cerró (se ejecutó):
 * bus, fecha, OT, técnico, observaciones y correctivos generados (novedades).
 * Seguro: try/catch interno, nunca lanza.
 */
export async function notifyPreventivoClosed(
  caseId: string,
  opts?: { closedById?: string | null }
): Promise<void> {
  if (!TG_TOKEN || !TG_PREV_GROUP) return;
  try {
    const c = await prisma.case.findFirst({
      where: { id: caseId, type: CaseType.PREVENTIVO },
      select: {
        id: true,
        caseNo: true,
        status: true,
        tenantId: true,
        bus: { select: { code: true, plate: true } },
        workOrder: {
          select: {
            workOrderNo: true,
            finishedAt: true,
            assignedTo: { select: { name: true } },
            preventiveReport: { select: { observations: true, executedAt: true } },
          },
        },
        events: {
          where: { type: CaseEventType.STATUS_CHANGE },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
    });
    if (!c || c.status !== CaseStatus.CERRADO) return;

    const correctivos = await prisma.case.findMany({
      where: { tenantId: c.tenantId, type: CaseType.CORRECTIVO, description: { contains: c.id } },
      orderBy: { caseNo: "asc" },
      select: { caseNo: true, status: true },
    });
    const corrRefs = correctivos.map(
      (x) => `CASO-${String(x.caseNo ?? "").padStart(3, "0")} (${x.status})`
    );

    let closer = "—";
    if (opts?.closedById) {
      const u = await prisma.user.findFirst({
        where: { id: opts.closedById },
        select: { name: true },
      });
      if (u?.name) closer = u.name;
    }

    const ref = `CASO-${String(c.caseNo ?? "").padStart(3, "0")}`;
    const ot = c.workOrder?.workOrderNo
      ? `OT-${String(c.workOrder.workOrderNo).padStart(3, "0")}`
      : "—";
    const fecha =
      c.events?.[0]?.createdAt ??
      c.workOrder?.finishedAt ??
      c.workOrder?.preventiveReport?.executedAt;
    const fechaStr = fecha
      ? new Date(fecha).toLocaleDateString("es-CO", {
          timeZone: "America/Bogota",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
      : "—";
    const plate = c.bus?.plate ? ` (${c.bus.plate})` : "";
    const obs = c.workOrder?.preventiveReport?.observations;

    const text = [
      `✅ Preventivo ejecutado — ${ref}`,
      `🚌 Bus: ${c.bus?.code ?? "—"}${plate}`,
      `📅 Fecha: ${fechaStr}`,
      `🧾 OT: ${ot}`,
      `👷 Técnico: ${c.workOrder?.assignedTo?.name ?? "—"}`,
      obs ? `📝 Observaciones: ${obs}` : null,
      corrRefs.length
        ? `⚠️ Novedades (correctivos): ${corrRefs.join(", ")}`
        : "✅ Sin novedades (no generó correctivos).",
      `👤 Cerró: ${closer}`,
    ]
      .filter(Boolean)
      .join("\n");

    const base = mesaBaseUrl();
    const markup = base
      ? { inline_keyboard: [[{ text: "🔗 Ver el preventivo", url: `${base}/cases/${c.id}` }]] }
      : undefined;

    await postToChat(TG_PREV_GROUP, text, { markdown: false, markup });
  } catch (e) {
    console.error("NOTIFY_PREVENTIVO_CLOSED_FAILED", e);
  }
}
