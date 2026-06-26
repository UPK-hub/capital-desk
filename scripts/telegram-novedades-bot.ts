/*
 * Bot de Telegram para reportar novedades (v2).
 *
 * Flujo: código de bus (valida al inicio, con o sin "K") -> equipo -> falla del
 * catálogo (lista paginada + búsqueda) -> detalle opcional -> nombre -> teléfono
 * -> foto opcional. Registra la novedad en /api/integrations/novedades (crea SOLO
 * el caso NOVEDAD) y publica un resumen en un grupo de Telegram.
 *
 * Sin dependencias nuevas: usa fetch nativo de Node 20+ por "long polling".
 *
 * Variables de entorno:
 *   TELEGRAM_BOT_TOKEN       (req)  token de BotFather
 *   NOVEDADES_INTAKE_URL     (req)  ej. http://localhost:3000/api/integrations/novedades
 *   NOVEDADES_INTAKE_SECRET  (req)  el mismo secreto de la app
 *   TELEGRAM_GROUP_CHAT_ID   (opc)  id del grupo donde llega el resumen (usa /id)
 *   NOVEDADES_TENANT_CODE    (opc)  por defecto CAPITALBUS
 *
 * Prueba sin Telegram:  BOT_SELFTEST=1 npx tsx scripts/telegram-novedades-bot.ts
 */

import fs from "node:fs";
import path from "node:path";

// Carga .env.local / .env (mismo archivo de la app) sin pisar variables del sistema.
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

// --------------------------------- Tipos -------------------------------------

type Fault = { code: string; novelty: string };
type EquipmentOpt = { code: string; label: string; count?: number };

type State =
  | "ASK_BUS"
  | "ASK_EQUIPMENT"
  | "ASK_FAULT"
  | "ASK_DETAIL"
  | "ASK_NAME"
  | "ASK_PHONE"
  | "ASK_PHOTO";

type SessionData = {
  busCode?: string;
  busPlate?: string | null;
  equipment?: string;
  equipmentLabel?: string;
  faults?: Fault[];
  faultFilter?: string;
  faultPage?: number;
  faultMsgId?: number;
  catalogCode?: string;
  reportedNovelty?: string;
  observations?: string;
  reporterName?: string;
  reporterPhone?: string;
  telegram?: { id: number; name: string; username: string | null };
  photoFileId?: string;
};

type Session = { state: State; data: SessionData };

const PAGE_SIZE = 8;

const SKIP_WORDS = new Set(["omitir", "saltar", "no", "ninguna", "ninguno", "n/a", "na", "-"]);

// Respaldo si el endpoint de equipos no responde (los 6 buckets del catálogo).
const FALLBACK_EQUIPMENTS: EquipmentOpt[] = [
  { code: "CAMARAS", label: "Cámaras" },
  { code: "SWITCH_POE", label: "Switch PoE" },
  { code: "NVR", label: "NVR / Grabador" },
  { code: "GPS", label: "GPS" },
  { code: "IO_SENSORES", label: "Botón de pánico / Sensores" },
  { code: "CMS", label: "Centro de Gestión (CMS)" },
];

// ----------------------------- Helpers puros ---------------------------------

function normText(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function filterFaults(faults: Fault[], q: string): Fault[] {
  const term = normText(q);
  if (!term) return faults;
  return faults.filter(
    (f) => normText(f.novelty).includes(term) || normText(f.code).includes(term)
  );
}

function paginate<T>(list: T[], page: number, size = PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(list.length / size));
  const p = Math.min(Math.max(0, page), totalPages - 1);
  return { pageItems: list.slice(p * size, p * size + size), page: p, totalPages };
}

function faultKeyboard(filtered: Fault[], page: number) {
  const { pageItems, page: p, totalPages } = paginate(filtered, page);
  const rows: any[][] = pageItems.map((f) => {
    const abs = filtered.indexOf(f);
    return [{ text: `${f.code} · ${f.novelty}`.slice(0, 60), callback_data: `f:${abs}` }];
  });
  const nav: any[] = [];
  if (p > 0) nav.push({ text: "◀", callback_data: `fp:${p - 1}` });
  nav.push({ text: `${p + 1}/${totalPages}`, callback_data: "noop" });
  if (p < totalPages - 1) nav.push({ text: "▶", callback_data: `fp:${p + 1}` });
  if (nav.length) rows.push(nav);
  return { inline_keyboard: rows };
}

function equipmentKeyboard(opts: EquipmentOpt[]) {
  return {
    inline_keyboard: opts.reduce<any[][]>((rows, opt, i) => {
      if (i % 2 === 0) rows.push([]);
      rows[rows.length - 1].push({ text: opt.label, callback_data: `eq:${opt.code}` });
      return rows;
    }, []),
  };
}

const phoneKeyboard = () => ({
  keyboard: [[{ text: "📱 Compartir mi número", request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
});
const removeKeyboard = () => ({ remove_keyboard: true });

function buildPayload(data: SessionData) {
  return {
    source: "telegram",
    busCode: data.busCode ?? "",
    affectedEquipment: data.equipment ?? "",
    catalogCode: data.catalogCode ?? "",
    reportedNovelty: data.reportedNovelty ?? "",
    observations: data.observations ?? "",
    reporterName: data.reporterName ?? "",
    reporterPhone: data.reporterPhone ?? "",
    telegram: data.telegram ?? null,
    tenantCode: (process.env.NOVEDADES_TENANT_CODE || "").trim() || undefined,
  };
}

function buildGroupSummary(data: SessionData, resp: any): string {
  const plate = data.busPlate ? ` (${data.busPlate})` : "";
  const assoc = resp?.associated
    ? `✅ Usuario: ${resp?.matchedUser?.name ?? data.reporterName}`
    : "❗ No asociado a ningún usuario";
  return [
    `🆕 *Nueva novedad* ${resp?.caseRef ?? ""}`.trim(),
    `🚌 Bus: ${data.busCode}${plate}`,
    `🧩 Equipo: ${data.equipmentLabel ?? data.equipment}`,
    `⚠️ Falla: ${data.catalogCode ?? "—"} · ${data.reportedNovelty ?? ""}`,
    data.observations ? `📝 Detalle: ${data.observations}` : null,
    `👤 Reporta: ${data.reporterName ?? "—"}${data.reporterPhone ? ` · ${data.reporterPhone}` : ""}`,
    assoc,
  ]
    .filter(Boolean)
    .join("\n");
}

function freshSession(): Session {
  return { state: "ASK_BUS", data: {} };
}

const WELCOME =
  "👋 Hola, soy el asistente de novedades.\n\nVoy a registrar tu reporte paso a paso.\n\n*Paso 1.* Escribe el *código del bus* (ej. K1234, también vale 1234).";

// --------------------------- Cliente de Telegram -----------------------------

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const API = `https://api.telegram.org/bot${TOKEN}`;
const FILE_API = `https://api.telegram.org/file/bot${TOKEN}`;
const INTAKE_URL =
  process.env.NOVEDADES_INTAKE_URL || "http://localhost:3000/api/integrations/novedades";
const INTAKE_SECRET = process.env.NOVEDADES_INTAKE_SECRET || "";
const GROUP_CHAT_ID = (process.env.TELEGRAM_GROUP_CHAT_ID || "").trim();

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

async function sendMessage(chatId: number | string, text: string, markup?: any): Promise<number | null> {
  const r = await tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
    ...(markup ? { reply_markup: markup } : {}),
  });
  return r?.result?.message_id ?? null;
}

async function editMessage(chatId: number, messageId: number, text: string, markup?: any) {
  return tg("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "Markdown",
    ...(markup ? { reply_markup: markup } : {}),
  });
}

// Llama al GET del endpoint (validar bus, listar equipos, listar fallas).
async function intakeGet(params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  try {
    const res = await fetch(`${INTAKE_URL}?${qs}`, {
      headers: { "x-integration-secret": INTAKE_SECRET },
    });
    return await res.json().catch(() => ({}));
  } catch (e) {
    console.error("INTAKE_GET_FAILED", e);
    return { ok: false };
  }
}

async function downloadPhoto(fileId: string): Promise<{ blob: Blob; name: string } | null> {
  try {
    const info = await tg("getFile", { file_id: fileId });
    const filePath = info?.result?.file_path;
    if (!filePath) return null;
    const res = await fetch(`${FILE_API}/${filePath}`);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return { blob: new Blob([buf]), name: String(filePath).split("/").pop() || "foto.jpg" };
  } catch (e) {
    console.error("PHOTO_DOWNLOAD_FAILED", e);
    return null;
  }
}

async function submitNovedad(
  data: SessionData
): Promise<{ ok: boolean; resp?: any; error?: string }> {
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
        headers: { "Content-Type": "application/json", "x-integration-secret": INTAKE_SECRET },
        body: JSON.stringify(payload),
      });
    }
    const json: any = await res.json().catch(() => ({}));
    if (res.ok && json.ok) return { ok: true, resp: json };
    return { ok: false, error: json.error || `HTTP ${res.status}` };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

// Cache de equipos (se piden una vez).
let equipmentsCache: EquipmentOpt[] | null = null;
async function getEquipments(): Promise<EquipmentOpt[]> {
  if (equipmentsCache) return equipmentsCache;
  const r = await intakeGet({ equipments: "1" });
  equipmentsCache =
    r?.ok && Array.isArray(r.items) && r.items.length ? r.items : FALLBACK_EQUIPMENTS;
  return equipmentsCache;
}

// Renderiza la lista de fallas (crea o edita el mensaje).
async function renderFaults(chatId: number, session: Session, edit: boolean) {
  const data = session.data;
  const filtered = filterFaults(data.faults || [], data.faultFilter || "");
  const { page, totalPages } = paginate(filtered, data.faultPage || 0);
  data.faultPage = page;

  if (!filtered.length) {
    const text = `No encontré fallas con "*${data.faultFilter}*".\nEscribe otra palabra o /cancel.`;
    if (edit && data.faultMsgId) await editMessage(chatId, data.faultMsgId, text);
    else data.faultMsgId = (await sendMessage(chatId, text)) ?? data.faultMsgId;
    return;
  }

  const header =
    `*${data.equipmentLabel}* — elige la falla (pág. ${page + 1}/${totalPages}).\n` +
    `Toca una opción, usa ◀ ▶, o *escribe una palabra* para buscar.`;
  const kb = faultKeyboard(filtered, page);
  if (edit && data.faultMsgId) await editMessage(chatId, data.faultMsgId, header, kb);
  else data.faultMsgId = (await sendMessage(chatId, header, kb)) ?? data.faultMsgId;
}

// --------------------------- Lógica de conversación --------------------------

const sessions = new Map<number, Session>();

function telegramIdentity(from: any): SessionData["telegram"] {
  if (!from) return undefined;
  const name = [from.first_name, from.last_name].filter(Boolean).join(" ").trim();
  return { id: from.id, name: name || from.username || String(from.id), username: from.username ?? null };
}

async function handleUpdate(update: any) {
  // ----- Normalizar -----
  let chatId: number | undefined;
  let from: any;
  let callbackId: string | undefined;
  let text = "";
  let photoFileId = "";
  let contactPhone = "";
  let callbackData = "";

  if (update.callback_query) {
    const cq = update.callback_query;
    chatId = cq.message?.chat?.id;
    from = cq.from;
    callbackId = cq.id;
    callbackData = String(cq.data || "");
  } else if (update.message) {
    const msg = update.message;
    chatId = msg.chat?.id;
    from = msg.from;
    if (msg.contact?.phone_number) contactPhone = String(msg.contact.phone_number);
    else if (Array.isArray(msg.photo) && msg.photo.length)
      photoFileId = String(msg.photo[msg.photo.length - 1].file_id);
    else text = String(msg.text || "").trim();
  }
  if (chatId === undefined) return;
  if (callbackId) await tg("answerCallbackQuery", { callback_query_id: callbackId });

  // ----- Comandos globales -----
  const cmd = text.startsWith("/") ? text.split(/\s+/)[0].toLowerCase() : "";
  if (cmd === "/id") {
    await sendMessage(chatId, `🆔 Chat ID: \`${chatId}\``);
    return;
  }
  if (cmd === "/cancel") {
    sessions.delete(chatId);
    await sendMessage(chatId, "Reporte cancelado. Escribe /start para empezar de nuevo.", removeKeyboard());
    return;
  }
  if (cmd === "/start" || !sessions.has(chatId)) {
    const s = freshSession();
    s.data.telegram = telegramIdentity(from);
    sessions.set(chatId, s);
    await sendMessage(chatId, WELCOME);
    return;
  }

  const session = sessions.get(chatId)!;
  const data = session.data;
  if (!data.telegram) data.telegram = telegramIdentity(from);

  // ----- Máquina de estados -----
  switch (session.state) {
    case "ASK_BUS": {
      if (!text) {
        await sendMessage(chatId, "Escribe el *código del bus* (ej. K1234 o 1234).");
        return;
      }
      const r = await intakeGet({ busCode: text });
      if (!r?.ok || !r.found) {
        await sendMessage(chatId, `No encontré el bus *${text.toUpperCase()}*. Escríbelo de nuevo (con o sin la K).`);
        return;
      }
      data.busCode = r.bus.code;
      data.busPlate = r.bus.plate ?? null;
      const equipments = await getEquipments();
      session.state = "ASK_EQUIPMENT";
      await sendMessage(
        chatId,
        `Bus *${data.busCode}*${data.busPlate ? ` (${data.busPlate})` : ""}.\n\n*Paso 2.* ¿Qué *equipo* está afectado?`,
        equipmentKeyboard(equipments)
      );
      return;
    }

    case "ASK_EQUIPMENT": {
      if (!callbackData.startsWith("eq:")) {
        const equipments = await getEquipments();
        await sendMessage(chatId, "Elige el equipo con los botones:", equipmentKeyboard(equipments));
        return;
      }
      const code = callbackData.slice(3);
      const equipments = await getEquipments();
      data.equipment = code;
      data.equipmentLabel = equipments.find((e) => e.code === code)?.label || code;
      const r = await intakeGet({ faults: code });
      data.faults = r?.ok && Array.isArray(r.items) ? r.items : [];
      data.faultFilter = "";
      data.faultPage = 0;
      data.faultMsgId = undefined;
      session.state = "ASK_FAULT";
      if (!data.faults.length) {
        await sendMessage(chatId, "No hay fallas en el catálogo para ese equipo. Escribe /cancel e inténtalo de nuevo.");
        return;
      }
      await renderFaults(chatId, session, false);
      return;
    }

    case "ASK_FAULT": {
      if (callbackData === "noop") return;
      if (callbackData.startsWith("fp:")) {
        data.faultPage = parseInt(callbackData.slice(3), 10) || 0;
        await renderFaults(chatId, session, true);
        return;
      }
      if (callbackData.startsWith("f:")) {
        const filtered = filterFaults(data.faults || [], data.faultFilter || "");
        const idx = parseInt(callbackData.slice(2), 10);
        const fault = filtered[idx];
        if (!fault) {
          await renderFaults(chatId, session, true);
          return;
        }
        data.catalogCode = fault.code;
        data.reportedNovelty = fault.novelty;
        if (data.faultMsgId) {
          await editMessage(chatId, data.faultMsgId, `✅ Falla: *${fault.code}* · ${fault.novelty}`);
        }
        session.state = "ASK_DETAIL";
        await sendMessage(
          chatId,
          "*Paso 4.* ¿Quieres agregar algún *detalle*? Escríbelo, o pon *omitir*."
        );
        return;
      }
      // Texto -> filtrar.
      if (text) {
        data.faultFilter = text;
        data.faultPage = 0;
        await renderFaults(chatId, session, true);
      }
      return;
    }

    case "ASK_DETAIL": {
      if (!text) {
        await sendMessage(chatId, "Escribe un detalle o pon *omitir*.");
        return;
      }
      data.observations = SKIP_WORDS.has(text.toLowerCase()) ? "" : text.slice(0, 500);
      session.state = "ASK_NAME";
      await sendMessage(chatId, "*Paso 5.* ¿Cuál es tu *nombre completo*?");
      return;
    }

    case "ASK_NAME": {
      if (!text) {
        await sendMessage(chatId, "Escribe tu nombre completo, por favor.");
        return;
      }
      data.reporterName = text.slice(0, 120);
      session.state = "ASK_PHONE";
      await sendMessage(
        chatId,
        "*Paso 6.* ¿Tu *teléfono* de contacto? Toca el botón o escríbelo.",
        phoneKeyboard()
      );
      return;
    }

    case "ASK_PHONE": {
      const phone = contactPhone || text;
      if (!phone) {
        await sendMessage(chatId, "Comparte tu número con el botón o escríbelo.", phoneKeyboard());
        return;
      }
      if (!SKIP_WORDS.has(phone.toLowerCase())) data.reporterPhone = phone.slice(0, 40);
      session.state = "ASK_PHOTO";
      await sendMessage(
        chatId,
        "*Paso 7.* Envía una *foto* de la novedad, o escribe *omitir*.",
        removeKeyboard()
      );
      return;
    }

    case "ASK_PHOTO": {
      const skip = text && SKIP_WORDS.has(text.toLowerCase());
      if (!photoFileId && !skip) {
        await sendMessage(chatId, "Envía una foto, o escribe *omitir* para terminar sin foto.");
        return;
      }
      if (photoFileId) data.photoFileId = photoFileId;

      await sendMessage(chatId, "⏳ Registrando tu novedad...");
      const result = await submitNovedad(data);
      if (result.ok) {
        const ref = result.resp?.caseRef ?? "tu caso";
        const code = data.catalogCode ? ` (${data.catalogCode})` : "";
        await sendMessage(
          chatId,
          `✅ ¡Listo! Tu novedad quedó registrada como *${ref}*${code}.\nNuestro equipo la revisará. Escribe /start para reportar otra.`,
          removeKeyboard()
        );
        if (GROUP_CHAT_ID) {
          try {
            await sendMessage(GROUP_CHAT_ID, buildGroupSummary(data, result.resp));
          } catch (e) {
            console.error("GROUP_SEND_FAILED", e);
          }
        }
      } else {
        const friendly = /bus/i.test(result.error || "")
          ? `❌ ${result.error}\nInicia de nuevo con /start.`
          : `❌ No pude registrar la novedad (${result.error}). Intenta más tarde o escribe /start.`;
        await sendMessage(chatId, friendly, removeKeyboard());
      }
      sessions.delete(chatId);
      return;
    }
  }
}

// --------------------------------- Self-test ---------------------------------

function runSelfTest(): void {
  const assert = (cond: boolean, msg: string) => {
    if (!cond) throw new Error("SELFTEST FALLÓ: " + msg);
  };

  const faults: Fault[] = Array.from({ length: 20 }, (_, i) => ({
    code: `NVD-${100 + i}`,
    novelty: i === 0 ? "No graba ningún canal" : `Falla ${i}`,
  }));

  // Paginación
  const p0 = paginate(faults, 0);
  assert(p0.pageItems.length === PAGE_SIZE, "página 0 con 8 ítems");
  assert(p0.totalPages === 3, "20 fallas -> 3 páginas");
  const pLast = paginate(faults, 99);
  assert(pLast.page === 2, "clamp a última página");

  // Filtro
  const f = filterFaults(faults, "no graba");
  assert(f.length === 1 && f[0].code === "NVD-100", "filtro encuentra 'no graba'");
  assert(filterFaults(faults, "nvd-105").length === 1, "filtro por código");
  assert(filterFaults(faults, "").length === 20, "filtro vacío devuelve todo");

  // Teclado de fallas: callback usa índice en la lista filtrada
  const kb = faultKeyboard(faults, 0);
  assert(kb.inline_keyboard[0][0].callback_data === "f:0", "primer botón f:0");
  const nav = kb.inline_keyboard[kb.inline_keyboard.length - 1];
  assert(nav.some((b: any) => b.callback_data === "fp:1"), "hay botón siguiente");

  // Payload
  const data: SessionData = {
    busCode: "K1402",
    busPlate: "GUW522",
    equipment: "NVR",
    equipmentLabel: "NVR / Grabador",
    catalogCode: "NVD-100",
    reportedNovelty: "No graba ningún canal",
    observations: "desde ayer",
    reporterName: "Valeria Daza",
    reporterPhone: "3167035447",
    telegram: { id: 1, name: "Vale", username: "vale" },
  };
  const payload = buildPayload(data);
  assert(payload.busCode === "K1402", "payload bus");
  assert(payload.catalogCode === "NVD-100", "payload código");
  assert(payload.affectedEquipment === "NVR", "payload equipo");
  assert(payload.reportedNovelty === "No graba ningún canal", "payload novedad");
  assert(payload.reporterName === "Valeria Daza", "payload nombre");

  // Resumen de grupo
  const sumOk = buildGroupSummary(data, {
    caseRef: "CASO-2511",
    associated: true,
    matchedUser: { name: "Valeria Daza" },
  });
  assert(sumOk.includes("CASO-2511") && sumOk.includes("K1402"), "resumen tiene caso y bus");
  assert(sumOk.includes("✅ Usuario: Valeria Daza"), "resumen marca usuario asociado");
  const sumAlert = buildGroupSummary(data, { caseRef: "CASO-2512", associated: false });
  assert(sumAlert.includes("❗ No asociado"), "resumen marca alerta sin usuario");

  console.log("✅ SELFTEST OK: paginación, filtro, teclado, payload y resumen correctos.");
}

// ----------------------------------- Main ------------------------------------

async function main() {
  if (process.env.BOT_SELFTEST === "1" || process.argv.includes("--selftest")) {
    runSelfTest();
    return;
  }
  if (!TOKEN) throw new Error("Falta TELEGRAM_BOT_TOKEN.");
  if (!INTAKE_SECRET) throw new Error("Falta NOVEDADES_INTAKE_SECRET.");

  await tg("setMyCommands", {
    commands: [
      { command: "start", description: "Reportar una novedad" },
      { command: "cancel", description: "Cancelar el reporte actual" },
      { command: "id", description: "Mostrar el ID de este chat" },
    ],
  });

  console.log("🤖 Bot de novedades en marcha. Intake:", INTAKE_URL, "| Grupo:", GROUP_CHAT_ID || "(no configurado)");
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
