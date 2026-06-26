/*
 * Bot de Telegram de CONSULTA de mantenimientos preventivos.
 *
 * Le escribes el código de un bus y responde su ÚLTIMO preventivo: fecha,
 * técnico, OT, estado, observaciones y los correctivos (novedades) generados.
 * Solo lectura. Consulta GET /api/integrations/preventivo-last.
 *
 * Sin dependencias nuevas (fetch nativo, long polling).
 *
 * Variables de entorno:
 *   TELEGRAM_PREVENTIVOS_BOT_TOKEN  (req)  token del NUEVO bot (BotFather)
 *   PREVENTIVO_QUERY_URL            (req)  ej. http://localhost:3000/api/integrations/preventivo-last
 *   NOVEDADES_INTAKE_SECRET         (req)  el mismo secreto de la app
 *   NOVEDADES_TENANT_CODE           (opc)  por defecto CAPITALBUS
 *
 * Prueba sin Telegram:  BOT_SELFTEST=1 npx tsx scripts/telegram-preventivos-bot.ts
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
  if (!iso) return "";
  const diffMs = now - new Date(iso).getTime();
  if (diffMs < 0) return "";
  const d = Math.floor(diffMs / 86400000);
  if (d < 1) return "hoy";
  if (d === 1) return "hace 1 día";
  if (d < 30) return `hace ${d} días`;
  const m = Math.floor(d / 30);
  return m === 1 ? "hace 1 mes" : `hace ${m} meses`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-CO", {
      timeZone: "America/Bogota",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function buildPreventivoReply(resp: any): string {
  if (!resp?.ok) return "⚠️ No pude consultar ahora. Intenta de nuevo en un momento.";
  if (!resp.found) return "No encontré ese bus. Escribe el código (ej. K1402 o 1402).";
  const plate = resp.bus?.plate ? ` (${resp.bus.plate})` : "";
  const head = `🚌 Bus ${resp.bus.code}${plate}`;
  const p = resp.preventivo;
  if (!p) return `${head}\n\n🛠️ Este bus no tiene preventivos registrados.`;

  const ago = formatAgo(p.fecha);
  const out = [
    head,
    "",
    `🛠️ Último preventivo: ${p.ref} — ${p.statusLabel}`,
    `📅 Fecha: ${formatDate(p.fecha)}${ago ? ` (${ago})` : ""}`,
  ];
  if (p.otNo) out.push(`🧾 OT: OT-${String(p.otNo).padStart(3, "0")}`);
  out.push(`👷 Técnico: ${p.tecnico || "—"}`);
  if (p.observaciones) out.push(`📝 Observaciones: ${p.observaciones}`);
  if (Array.isArray(p.correctivos) && p.correctivos.length) {
    out.push("");
    out.push(`⚠️ Novedades (correctivos generados): ${p.correctivos.length}`);
    for (const c of p.correctivos) out.push(`   • ${c.ref} (${c.status})`);
  } else {
    out.push("✅ Sin novedades (no generó correctivos).");
  }
  return out.join("\n");
}

const HELP =
  "👋 Soy el bot de consulta de preventivos.\n\nEscríbeme el código del bus (ej. K1402, también vale 1402) y te digo su último mantenimiento preventivo: fecha, técnico, OT, estado y si tuvo novedades.";

// --------------------------- Cliente de Telegram -----------------------------

const TOKEN = process.env.TELEGRAM_PREVENTIVOS_BOT_TOKEN || "";
const API = `https://api.telegram.org/bot${TOKEN}`;
const QUERY_URL =
  process.env.PREVENTIVO_QUERY_URL || "http://localhost:3000/api/integrations/preventivo-last";
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
  // Texto plano: las observaciones pueden traer símbolos que romperían Markdown.
  return tg("sendMessage", { chat_id: chatId, text });
}

async function queryPreventivo(busCode: string): Promise<any> {
  const params = new URLSearchParams({ busCode });
  const tc = (process.env.NOVEDADES_TENANT_CODE || "").trim();
  if (tc) params.set("tenantCode", tc);
  try {
    const res = await fetch(`${QUERY_URL}?${params.toString()}`, {
      headers: { "x-integration-secret": SECRET },
      signal: AbortSignal.timeout(15000),
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
    await sendMessage(chatId, `🆔 Chat ID: ${chatId}`);
    return;
  }
  if (chatType && chatType !== "private") return;
  if (cmd === "/start" || cmd === "/help" || cmd) {
    await sendMessage(chatId, HELP);
    return;
  }

  await sendMessage(chatId, "🔎 Consultando...");
  const resp = await queryPreventivo(text);
  await sendMessage(chatId, buildPreventivoReply(resp));
}

// --------------------------------- Self-test ---------------------------------

function runSelfTest(): void {
  const assert = (cond: boolean, msg: string) => {
    if (!cond) throw new Error("SELFTEST FALLÓ: " + msg);
  };
  const now = Date.parse("2026-06-26T12:00:00Z");

  assert(formatAgo(new Date(now - 5 * 86400000).toISOString(), now) === "hace 5 días", "5 días");
  assert(formatAgo(new Date(now - 60 * 86400000).toISOString(), now) === "hace 2 meses", "2 meses");

  const con = buildPreventivoReply({
    ok: true,
    found: true,
    bus: { code: "K1402", plate: "GUW522" },
    preventivo: {
      ref: "CASO-0123",
      statusLabel: "Cerrado",
      cerrado: true,
      fecha: new Date(now).toISOString(),
      otNo: 123,
      tecnico: "Juan Pérez",
      observaciones: "Cambio de cableado",
      correctivos: [{ ref: "CASO-0124", status: "NUEVO" }],
    },
  });
  assert(con.includes("Bus K1402") && con.includes("CASO-0123") && con.includes("Cerrado"), "muestra preventivo");
  assert(con.includes("OT-123") && con.includes("Juan Pérez"), "muestra OT y técnico");
  assert(con.includes("Observaciones: Cambio de cableado"), "muestra observaciones");
  assert(con.includes("CASO-0124 (NUEVO)"), "muestra correctivo generado");

  const sinPrev = buildPreventivoReply({
    ok: true,
    found: true,
    bus: { code: "K9999", plate: null },
    preventivo: null,
  });
  assert(sinPrev.includes("no tiene preventivos"), "sin preventivos");

  const sinCorr = buildPreventivoReply({
    ok: true,
    found: true,
    bus: { code: "K1402", plate: null },
    preventivo: {
      ref: "CASO-0200",
      statusLabel: "Cerrado",
      fecha: new Date(now).toISOString(),
      otNo: 200,
      tecnico: "Ana",
      observaciones: null,
      correctivos: [],
    },
  });
  assert(sinCorr.includes("Sin novedades"), "sin correctivos");
  assert(buildPreventivoReply({ ok: false }).includes("No pude consultar"), "error");
  assert(buildPreventivoReply({ ok: true, found: false }).includes("No encontré"), "bus no encontrado");

  console.log("✅ SELFTEST OK: respuesta de preventivos correcta.");
}

// ----------------------------------- Main ------------------------------------

async function main() {
  if (process.env.BOT_SELFTEST === "1" || process.argv.includes("--selftest")) {
    runSelfTest();
    return;
  }
  if (!TOKEN) throw new Error("Falta TELEGRAM_PREVENTIVOS_BOT_TOKEN.");
  if (!SECRET) throw new Error("Falta NOVEDADES_INTAKE_SECRET.");

  await tg("setMyCommands", {
    commands: [
      { command: "start", description: "Cómo consultar" },
      { command: "help", description: "Ayuda" },
      { command: "id", description: "Mostrar el ID de este chat" },
    ],
  });

  console.log("🤖 Bot de consulta de preventivos en marcha. Query:", QUERY_URL);
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
