// src/lib/telegram-notify.ts
//
// Avisos del lado servidor al grupo de Telegram de novedades (el mismo grupo
// "Tickets de novedades capitalbus" que usa el bot). Se usa, por ejemplo, para
// avisar cuando una novedad se cierra (la creación la publica el propio bot).
//
// Usa las mismas variables que el bot: TELEGRAM_BOT_TOKEN + TELEGRAM_GROUP_CHAT_ID.
// Es seguro: si faltan variables o falla la red, no hace nada y nunca lanza.
import { prisma } from "@/lib/prisma";
import { CaseStatus, CaseType } from "@prisma/client";

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
    const fecha = c.workOrder?.preventiveReport?.executedAt ?? c.workOrder?.finishedAt;
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
