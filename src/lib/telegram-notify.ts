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

function mesaBaseUrl(): string {
  return (process.env.APP_URL || process.env.NEXTAUTH_URL || "").trim().replace(/\/+$/, "");
}

/** Envía un mensaje al grupo de Telegram. No lanza. */
export async function sendTelegramGroup(text: string, replyMarkup?: unknown): Promise<void> {
  if (!TG_TOKEN || !TG_GROUP) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        chat_id: TG_GROUP,
        text,
        parse_mode: "Markdown",
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    });
  } catch (e) {
    console.error("TELEGRAM_GROUP_NOTIFY_FAILED", e);
  }
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
