/*
 * Bot de Telegram de CONSULTA de tramas (separado del bot de novedades).
 *
 * Le escribes el código de un bus y te responde la ÚLTIMA trama P20 y P60 que
 * registró, con fecha/hora y hace cuánto (útil para ver si dejó de reportar).
 * Solo lectura. Consulta GET /api/integrations/tramas-last.
 *
 * Sin dependencias nuevas (fetch nativo, long polling).
 *
 * Variables de entorno:
 *   TELEGRAM_TRAMAS_BOT_TOKEN  (req)  token del NUEVO bot (BotFather)
 *   TRAMAS_QUERY_URL           (req)  ej. http://localhost:3000/api/integrations/tramas-last
 *   NOVEDADES_INTAKE_SECRET    (req)  el mismo secreto de la app
 *   NOVEDADES_TENANT_CODE      (opc)  por defecto CAPITALBUS
 *
 * Prueba sin Telegram:  BOT_SELFTEST=1 npx tsx scripts/telegram-tramas-bot.ts
 */

import fs from "node:fs";
import path from "node:path";

function loadEnvFiles(): void {
  for (const file of [".env.local", ".env"]) {
    try {
      const full = path.join(process.cwd(), file);
      if (!fs.existsSync(full)) continue;
      for (const lineRaw of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
        const line = lineRaw.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        let val = line.slice(eq + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (key && process.env[key] === undefined) process.env[key] = val;
      }
    } catch {
      /* las variables pueden venir del sistema */
    }
  }
}
loadEnvFiles();

// ----------------------------- Helpers puros ---------------------------------

function formatAgo(iso: string | null, now: number = Date.now()): string {
  if (!iso) return "—";
  const diffMs = now - new Date(iso).getTime();
  if (diffMs < 0) return "ahora";
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "hace segundos";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} día${d === 1 ? "" : "s"}`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-CO", {
      timeZone: "America/Bogota",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function buildTramasReply(resp: any): string {
  if (!resp?.ok) return "⚠️ No pude consultar ahora. Intenta de nuevo en un momento.";
  if (!resp.found) return "No encontré ese bus. Escribe el código (ej. K1402 o 1402).";
  const plate = resp.bus?.plate ? ` (${resp.bus.plate})` : "";
  const line = (label: string, t: any) => {
    if (!t) return `📡 Última ${label}: sin registros`;
    const when = t.eventAt || t.receivedAt;
    const out = [`📡 Última ${label}: ${formatDateTime(when)} (${formatAgo(when)})`];
    if (t.lat && t.lon)
      out.push(`    📍 ${t.lat}, ${t.lon} — [ver mapa](https://maps.google.com/?q=${t.lat},${t.lon})`);
    if (t.velocidad) out.push(`    🚗 Velocidad: ${t.velocidad}`);
    if (t.odometro) out.push(`    🧭 Odómetro: ${t.odometro} km`);
    return out.join("\n");
  };
  return [`🚌 Bus ${resp.bus.code}${plate}`, "", line("P20", resp.p20), line("P60", resp.p60)].join("\n");
}

const HELP =
  "👋 Soy el bot de *consulta de tramas*.\n\nEscríbeme el *código del bus* (ej. K1402, también vale 1402) y te digo la *última P20 y P60* que reportó, con la hora y hace cuánto.";

// --------------------------- Cliente de Telegram -----------------------------

const TOKEN = process.env.TELEGRAM_TRAMAS_BOT_TOKEN || "";
const API = `https://api.telegram.org/bot${TOKEN}`;
const QUERY_URL =
  process.env.TRAMAS_QUERY_URL || "http://localhost:3000/api/integrations/tramas-last";
const SECRET = process.env.NOVEDADES_INTAKE_SECRET || "";

async function tg(method: string, body: any): Promise<any> {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.ok) console.error("TELEGRAM_ERROR", method, json.description || res.status);
  return json;
}

async function sendMessage(chatId: number | string, text: string) {
  return tg("sendMessage", { chat_id: chatId, text, parse_mode: "Markdown" });
}

async function queryTramas(busCode: string): Promise<any> {
  const params = new URLSearchParams({ busCode });
  const tc = (process.env.NOVEDADES_TENANT_CODE || "").trim();
  if (tc) params.set("tenantCode", tc);
  try {
    const res = await fetch(`${QUERY_URL}?${params.toString()}`, {
      headers: { "x-integration-secret": SECRET },
      signal: AbortSignal.timeout(8000),
    });
    return await res.json().catch(() => ({ ok: false }));
  } catch (e) {
    console.error("QUERY_FAILED", e);
    return { ok: false };
  }
}

async function handleUpdate(update: any) {
  const msg = update.message;
  if (!msg || !msg.chat) return;
  const chatId = msg.chat.id;
  const chatType = msg.chat.type;
  const text = String(msg.text || "").trim();
  if (!text) return;

  const cmd = text.startsWith("/") ? text.split(/\s+/)[0].toLowerCase().split("@")[0] : "";
  if (cmd === "/id") {
    await sendMessage(chatId, `🆔 Chat ID: \`${chatId}\``);
    return;
  }
  // En grupos/canales solo responde /id (evita ruido con la conversación).
  if (chatType && chatType !== "private") return;
  if (cmd === "/start" || cmd === "/help" || cmd) {
    await sendMessage(chatId, HELP);
    return;
  }

  // Texto libre = código de bus.
  await sendMessage(chatId, "🔎 Consultando...");
  const resp = await queryTramas(text);
  await sendMessage(chatId, buildTramasReply(resp));
}

// --------------------------------- Self-test ---------------------------------

function runSelfTest(): void {
  const assert = (cond: boolean, msg: string) => {
    if (!cond) throw new Error("SELFTEST FALLÓ: " + msg);
  };
  const now = Date.parse("2026-06-26T12:00:00Z");

  assert(formatAgo(new Date(now - 5 * 60000).toISOString(), now) === "hace 5 min", "5 min");
  assert(formatAgo(new Date(now - 90 * 60000).toISOString(), now) === "hace 1 h", "90 min -> 1 h");
  assert(formatAgo(new Date(now - 50 * 3600000).toISOString(), now) === "hace 2 días", "50 h -> 2 días");
  assert(formatAgo(null, now) === "—", "null");

  const found = buildTramasReply({
    ok: true,
    found: true,
    bus: { code: "K1402", plate: "GUW522" },
    p20: {
      eventAt: new Date(now).toISOString(),
      receivedAt: new Date(now).toISOString(),
      lat: "4.6327",
      lon: "-74.1737",
      odometro: "12345",
    },
    p60: null,
  });
  assert(found.includes("Bus K1402") && found.includes("GUW522"), "reply tiene bus y placa");
  assert(found.includes("Última P20:") && found.includes("Última P60: sin registros"), "reply P20 y P60");
  assert(found.includes("📍 4.6327, -74.1737") && found.includes("maps.google.com"), "reply muestra ubicación");
  assert(found.includes("Odómetro: 12345 km"), "reply muestra odómetro");

  assert(buildTramasReply({ ok: true, found: false }).includes("No encontré"), "no encontrado");
  assert(buildTramasReply({ ok: false }).includes("No pude consultar"), "error");

  console.log("✅ SELFTEST OK: formato de fecha/antigüedad y respuesta correctos.");
}

// ----------------------------------- Main ------------------------------------

async function main() {
  if (process.env.BOT_SELFTEST === "1" || process.argv.includes("--selftest")) {
    runSelfTest();
    return;
  }
  if (!TOKEN) throw new Error("Falta TELEGRAM_TRAMAS_BOT_TOKEN.");
  if (!SECRET) throw new Error("Falta NOVEDADES_INTAKE_SECRET.");

  await tg("setMyCommands", {
    commands: [
      { command: "start", description: "Cómo consultar" },
      { command: "help", description: "Ayuda" },
      { command: "id", description: "Mostrar el ID de este chat" },
    ],
  });

  console.log("🤖 Bot de consulta de tramas en marcha. Query:", QUERY_URL);
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const res = await fetch(`${API}/getUpdates?timeout=50&offset=${offset}`);
      const json: any = await res.json().catch(() => ({}));
      if (!json.ok) {
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      for (const update of json.result) {
        offset = update.update_id + 1;
        try {
          await handleUpdate(update);
        } catch (e) {
          console.error("HANDLE_UPDATE_FAILED", e);
        }
      }
    } catch (e) {
      console.error("POLL_FAILED", e);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
