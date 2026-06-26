/*
 * Bot de Telegram para reportar novedades.
 *
 * El cliente conversa con el bot (código de bus, equipo afectado, descripción,
 * nombre, teléfono y una foto opcional) y el bot registra la novedad llamando a
 * /api/integrations/novedades, que crea SOLO el caso NOVEDAD en la mesa.
 *
 * No usa dependencias nuevas: habla con la API de Telegram por "long polling"
 * usando fetch nativo de Node 20+. Se ejecuta como proceso aparte (pm2).
 *
 * Variables de entorno requeridas:
 *   TELEGRAM_BOT_TOKEN      -> token que entrega BotFather
 *   NOVEDADES_INTAKE_URL    -> ej. http://localhost:3000/api/integrations/novedades
 *   NOVEDADES_INTAKE_SECRET -> el mismo secreto configurado en la app
 * Opcional:
 *   NOVEDADES_TENANT_CODE   -> por defecto CAPITALBUS
 *
 * Prueba sin Telegram:  BOT_SELFTEST=1 npx tsx scripts/telegram-novedades-bot.ts
 */

import fs from "node:fs";
import path from "node:path";

// Carga variables desde .env.local / .env (mismo archivo que usa la app) sin
// sobrescribir las que ya vengan del sistema. Evita depender de cómo pm2 inyecte
// el entorno y hace la configuración a prueba de errores.
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
      // Si falla la lectura, seguimos: las variables pueden venir del sistema.
    }
  }
}
loadEnvFiles();

// ----------------------------- Catálogo de equipos -----------------------------

const EQUIPMENT_OPTIONS: Array<{ code: string; label: string }> = [
  { code: "CAMARAS", label: "Cámaras" },
  { code: "NVR", label: "NVR / Grabador" },
  { code: "ROUTER_SIM", label: "Router / SIM (comunicación)" },
  { code: "GPS", label: "GPS" },
  { code: "SWITCH_POE", label: "Switch PoE" },
  { code: "CMS", label: "CMS / Plataforma" },
  { code: "IO_SENSORES", label: "Sensores / I-O" },
  { code: "FIRMWARE", label: "Firmware" },
  { code: "SOFTWARE", label: "Software" },
  { code: "PARAMETRIZACION", label: "Parametrización" },
  { code: "OTRO", label: "Otro" },
];

const EQUIPMENT_LABEL = new Map(EQUIPMENT_OPTIONS.map((o) => [o.code, o.label]));

const SKIP_WORDS = new Set(["omitir", "saltar", "no", "ninguna", "ninguno", "n/a", "na"]);

// ------------------------------ Máquina de estados ------------------------------

type State =
  | "ASK_BUS"
  | "ASK_EQUIPMENT"
  | "ASK_DESC"
  | "ASK_NAME"
  | "ASK_PHONE"
  | "ASK_PHOTO";

type SessionData = {
  busCode?: string;
  affectedEquipment?: string;
  affectedEquipmentLabel?: string;
  reportedNovelty?: string;
  reporterName?: string;
  reporterPhone?: string;
  photoFileId?: string;
};

type Session = { state: State; data: SessionData };

type BotEvent =
  | { kind: "command"; value: string }
  | { kind: "text"; value: string }
  | { kind: "callback"; value: string }
  | { kind: "contact"; value: string }
  | { kind: "photo"; value: string };

type Action =
  | { type: "message"; text: string; markup?: any }
  | { type: "submit" };

const equipmentKeyboard = () => ({
  inline_keyboard: EQUIPMENT_OPTIONS.reduce<any[][]>((rows, opt, i) => {
    if (i % 2 === 0) rows.push([]);
    rows[rows.length - 1].push({ text: opt.label, callback_data: `eq:${opt.code}` });
    return rows;
  }, []),
});

const phoneKeyboard = () => ({
  keyboard: [[{ text: "📱 Compartir mi número", request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
});

const removeKeyboard = () => ({ remove_keyboard: true });

function freshSession(): Session {
  return { state: "ASK_BUS", data: {} };
}

const WELCOME =
  "👋 Hola, soy el asistente de novedades.\n\nVoy a registrar tu reporte paso a paso.\n\n*Paso 1.* Escribe el *código del bus* (por ejemplo: CB-1234).";

/**
 * Avanza la conversación de forma pura (sin red). Devuelve la sesión nueva y la
 * lista de acciones a ejecutar. `submit` indica que ya hay que crear la novedad.
 */
function advance(session: Session, event: BotEvent): { session: Session; actions: Action[] } {
  // Comandos globales.
  if (event.kind === "command") {
    if (event.value === "/cancel") {
      return {
        session: freshSession(),
        actions: [
          {
            type: "message",
            text: "Reporte cancelado. Escribe /start cuando quieras reportar una novedad.",
            markup: removeKeyboard(),
          },
        ],
      };
    }
    // /start o cualquier otro comando reinicia el flujo.
    return { session: freshSession(), actions: [{ type: "message", text: WELCOME }] };
  }

  const data = { ...session.data };

  switch (session.state) {
    case "ASK_BUS": {
      if (event.kind !== "text" || !event.value.trim()) {
        return {
          session,
          actions: [{ type: "message", text: "Escribe el *código del bus* (ej. CB-1234)." }],
        };
      }
      data.busCode = event.value.trim().toUpperCase();
      return {
        session: { state: "ASK_EQUIPMENT", data },
        actions: [
          {
            type: "message",
            text: `Bus *${data.busCode}*.\n\n*Paso 2.* ¿Qué *equipo* está afectado? Elige una opción:`,
            markup: equipmentKeyboard(),
          },
        ],
      };
    }

    case "ASK_EQUIPMENT": {
      if (event.kind === "callback" && event.value.startsWith("eq:")) {
        const code = event.value.slice(3);
        data.affectedEquipment = code;
        data.affectedEquipmentLabel = EQUIPMENT_LABEL.get(code) ?? code;
      } else if (event.kind === "text" && event.value.trim()) {
        // Si el cliente escribe en vez de tocar un botón, lo tomamos como "Otro".
        data.affectedEquipment = "OTRO";
        data.affectedEquipmentLabel = event.value.trim().slice(0, 80);
      } else {
        return {
          session,
          actions: [
            {
              type: "message",
              text: "Elige el equipo afectado con los botones:",
              markup: equipmentKeyboard(),
            },
          ],
        };
      }
      return {
        session: { state: "ASK_DESC", data },
        actions: [
          {
            type: "message",
            text: `Equipo: *${data.affectedEquipmentLabel}*.\n\n*Paso 3.* Describe la *novedad* (qué está pasando).`,
          },
        ],
      };
    }

    case "ASK_DESC": {
      const value = event.kind === "text" ? event.value.trim() : "";
      if (value.length < 3) {
        return {
          session,
          actions: [
            { type: "message", text: "Cuéntame un poco más sobre la novedad (mínimo 3 caracteres)." },
          ],
        };
      }
      data.reportedNovelty = value;
      return {
        session: { state: "ASK_NAME", data },
        actions: [{ type: "message", text: "*Paso 4.* ¿Cuál es tu *nombre*?" }],
      };
    }

    case "ASK_NAME": {
      const value = event.kind === "text" ? event.value.trim() : "";
      if (!value) {
        return { session, actions: [{ type: "message", text: "Escribe tu nombre, por favor." }] };
      }
      data.reporterName = value.slice(0, 120);
      return {
        session: { state: "ASK_PHONE", data },
        actions: [
          {
            type: "message",
            text: "*Paso 5.* ¿Tu *teléfono* de contacto? Toca el botón o escríbelo.",
            markup: phoneKeyboard(),
          },
        ],
      };
    }

    case "ASK_PHONE": {
      let phone = "";
      if (event.kind === "contact") phone = event.value.trim();
      else if (event.kind === "text") phone = event.value.trim();
      if (!phone) {
        return {
          session,
          actions: [
            {
              type: "message",
              text: "Comparte tu número con el botón o escríbelo.",
              markup: phoneKeyboard(),
            },
          ],
        };
      }
      if (!SKIP_WORDS.has(phone.toLowerCase())) data.reporterPhone = phone.slice(0, 40);
      return {
        session: { state: "ASK_PHOTO", data },
        actions: [
          {
            type: "message",
            text: "*Paso 6.* Envía una *foto* de la novedad, o escribe *omitir* si no tienes.",
            markup: removeKeyboard(),
          },
        ],
      };
    }

    case "ASK_PHOTO": {
      if (event.kind === "photo") {
        data.photoFileId = event.value;
        return { session: { state: "ASK_PHOTO", data }, actions: [{ type: "submit" }] };
      }
      if (event.kind === "text" && SKIP_WORDS.has(event.value.trim().toLowerCase())) {
        return { session: { state: "ASK_PHOTO", data }, actions: [{ type: "submit" }] };
      }
      return {
        session,
        actions: [
          { type: "message", text: "Envía una foto, o escribe *omitir* para terminar sin foto." },
        ],
      };
    }

    default:
      return { session: freshSession(), actions: [{ type: "message", text: WELCOME }] };
  }
}

/** Construye el JSON que recibe el endpoint de ingesta. */
function buildPayload(data: SessionData) {
  return {
    source: "telegram",
    busCode: data.busCode ?? "",
    affectedEquipment: data.affectedEquipment ?? "",
    reportedNovelty: data.reportedNovelty ?? "",
    reporterName: data.reporterName ?? "",
    reporterPhone: data.reporterPhone ?? "",
    tenantCode: (process.env.NOVEDADES_TENANT_CODE || "").trim() || undefined,
  };
}

// --------------------------------- Self-test ---------------------------------

function runSelfTest(): void {
  const assert = (cond: boolean, msg: string) => {
    if (!cond) throw new Error("SELFTEST FALLÓ: " + msg);
  };

  let s = freshSession();
  const drive = (ev: BotEvent) => {
    const r = advance(s, ev);
    s = r.session;
    return r.actions;
  };

  // /start reinicia
  let a = advance(freshSession(), { kind: "command", value: "/start" });
  assert(a.session.state === "ASK_BUS", "start -> ASK_BUS");

  drive({ kind: "text", value: " cb-1234 " });
  assert(s.state === "ASK_EQUIPMENT", "bus -> ASK_EQUIPMENT");
  assert(s.data.busCode === "CB-1234", "bus normalizado a mayúsculas");

  drive({ kind: "callback", value: "eq:CAMARAS" });
  assert(s.state === "ASK_DESC", "equipo -> ASK_DESC");
  assert(s.data.affectedEquipment === "CAMARAS", "equipo guardado");

  a = drive({ kind: "text", value: "ab" });
  assert(s.state === "ASK_DESC", "descripción corta no avanza");

  drive({ kind: "text", value: "La cámara 3 no muestra imagen" });
  assert(s.state === "ASK_NAME", "descripción -> ASK_NAME");

  drive({ kind: "text", value: "Juan Pérez" });
  assert(s.state === "ASK_PHONE", "nombre -> ASK_PHONE");

  drive({ kind: "contact", value: "+57 3001234567" });
  assert(s.state === "ASK_PHOTO", "teléfono -> ASK_PHOTO");
  assert(s.data.reporterPhone === "+57 3001234567", "teléfono guardado");

  a = drive({ kind: "text", value: "omitir" });
  assert(a.some((x) => x.type === "submit"), "omitir -> submit");

  const payload = buildPayload(s.data);
  assert(payload.busCode === "CB-1234", "payload busCode");
  assert(payload.affectedEquipment === "CAMARAS", "payload equipo");
  assert(payload.reportedNovelty === "La cámara 3 no muestra imagen", "payload novedad");
  assert(payload.reporterName === "Juan Pérez", "payload nombre");
  assert(payload.reporterPhone === "+57 3001234567", "payload teléfono");

  // Camino con equipo escrito a mano + foto + cancelar
  s = freshSession();
  drive({ kind: "text", value: "CB-9" });
  drive({ kind: "text", value: "Antena rota" }); // equipo escrito -> OTRO
  assert(s.data.affectedEquipment === "OTRO" && s.data.affectedEquipmentLabel === "Antena rota", "equipo libre -> OTRO");
  drive({ kind: "text", value: "Se cayó la antena" });
  drive({ kind: "text", value: "Ana" });
  drive({ kind: "text", value: "3009999999" });
  a = drive({ kind: "photo", value: "FILE_ID_123" });
  assert(a.some((x) => x.type === "submit"), "foto -> submit");
  assert(s.data.photoFileId === "FILE_ID_123", "foto guardada");

  const r = advance(s, { kind: "command", value: "/cancel" });
  assert(r.session.state === "ASK_BUS" && !r.session.data.busCode, "cancel limpia sesión");

  console.log("✅ SELFTEST OK: máquina de estados y payload correctos.");
}

// --------------------------- Cliente API de Telegram ---------------------------

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const API = `https://api.telegram.org/bot${TOKEN}`;
const FILE_API = `https://api.telegram.org/file/bot${TOKEN}`;
const INTAKE_URL = process.env.NOVEDADES_INTAKE_URL || "http://localhost:3000/api/integrations/novedades";
const INTAKE_SECRET = process.env.NOVEDADES_INTAKE_SECRET || "";

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

async function sendMessage(chatId: number, text: string, markup?: any) {
  return tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
    ...(markup ? { reply_markup: markup } : {}),
  });
}

/** Descarga la foto desde Telegram y la devuelve como Blob para subirla. */
async function downloadPhoto(fileId: string): Promise<{ blob: Blob; name: string } | null> {
  try {
    const info = await tg("getFile", { file_id: fileId });
    const filePath = info?.result?.file_path;
    if (!filePath) return null;
    const res = await fetch(`${FILE_API}/${filePath}`);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const name = String(filePath).split("/").pop() || "foto.jpg";
    return { blob: new Blob([buf]), name };
  } catch (e) {
    console.error("PHOTO_DOWNLOAD_FAILED", e);
    return null;
  }
}

/** Envía la novedad al endpoint de ingesta (JSON, o multipart si hay foto). */
async function submitNovedad(data: SessionData): Promise<{ ok: boolean; caseRef?: string; error?: string }> {
  const payload = buildPayload(data);
  try {
    let res: Response;
    if (data.photoFileId) {
      const photo = await downloadPhoto(data.photoFileId);
      const form = new FormData();
      form.append("payload", JSON.stringify(payload));
      if (photo) form.append("evidence", photo.blob, photo.name);
      res = await fetch(INTAKE_URL, {
        method: "POST",
        headers: { "x-integration-secret": INTAKE_SECRET },
        body: form,
      });
    } else {
      res = await fetch(INTAKE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-integration-secret": INTAKE_SECRET,
        },
        body: JSON.stringify(payload),
      });
    }
    const json: any = await res.json().catch(() => ({}));
    if (res.ok && json.ok) return { ok: true, caseRef: json.caseRef };
    return { ok: false, error: json.error || `HTTP ${res.status}` };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

// Sesiones en memoria por chat. Si el bot se reinicia, el cliente hace /start.
const sessions = new Map<number, Session>();

function normalizeUpdate(update: any): { chatId: number; event: BotEvent; callbackId?: string } | null {
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = cq.message?.chat?.id;
    if (!chatId) return null;
    return { chatId, event: { kind: "callback", value: String(cq.data || "") }, callbackId: cq.id };
  }
  const msg = update.message;
  if (!msg || !msg.chat) return null;
  const chatId = msg.chat.id;

  if (msg.contact?.phone_number) {
    return { chatId, event: { kind: "contact", value: String(msg.contact.phone_number) } };
  }
  if (Array.isArray(msg.photo) && msg.photo.length) {
    // La última miniatura es la de mayor resolución.
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    return { chatId, event: { kind: "photo", value: String(fileId) } };
  }
  const text = String(msg.text || "").trim();
  if (text.startsWith("/")) {
    return { chatId, event: { kind: "command", value: text.split(/\s+/)[0].toLowerCase() } };
  }
  if (text) return { chatId, event: { kind: "text", value: text } };
  return null;
}

async function handleUpdate(update: any) {
  const norm = normalizeUpdate(update);
  if (!norm) return;
  const { chatId, event, callbackId } = norm;
  if (callbackId) await tg("answerCallbackQuery", { callback_query_id: callbackId });

  const current = sessions.get(chatId) ?? freshSession();
  // Si no había sesión y el primer mensaje no es /start, igual arrancamos el flujo.
  const seed: Session = sessions.has(chatId) ? current : freshSession();
  const { session, actions } = advance(seed, event);
  sessions.set(chatId, session);

  for (const action of actions) {
    if (action.type === "message") {
      await sendMessage(chatId, action.text, action.markup);
    } else if (action.type === "submit") {
      await sendMessage(chatId, "⏳ Registrando tu novedad...");
      const result = await submitNovedad(session.data);
      if (result.ok) {
        await sendMessage(
          chatId,
          `✅ ¡Listo! Tu novedad quedó registrada como *${result.caseRef}*.\nNuestro equipo la revisará. Escribe /start para reportar otra.`,
          removeKeyboard()
        );
      } else {
        const friendly =
          result.error && /bus/i.test(result.error)
            ? `❌ ${result.error}\nRevisa el código e inicia de nuevo con /start.`
            : `❌ No pude registrar la novedad (${result.error}). Intenta de nuevo más tarde o escribe /start.`;
        await sendMessage(chatId, friendly, removeKeyboard());
      }
      sessions.delete(chatId);
    }
  }
}

async function main() {
  if (process.env.BOT_SELFTEST === "1" || process.argv.includes("--selftest")) {
    runSelfTest();
    return;
  }
  if (!TOKEN) throw new Error("Falta TELEGRAM_BOT_TOKEN.");
  if (!INTAKE_SECRET) throw new Error("Falta NOVEDADES_INTAKE_SECRET.");

  // Comandos visibles en el menú del chat.
  await tg("setMyCommands", {
    commands: [
      { command: "start", description: "Reportar una novedad" },
      { command: "cancel", description: "Cancelar el reporte actual" },
    ],
  });

  console.log("🤖 Bot de novedades en marcha. Intake:", INTAKE_URL);
  let offset = 0;
  // Bucle de long polling.
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
