/*
 * Bot de Telegram de CARGA de preventivos.
 *
 * El técnico se registra una vez (/registrar correo), manda el código de un bus
 * y el bot crea/encuentra el preventivo del mes. Luego, con botones, va subiendo
 * las evidencias (una a una), voltajes, checks y hallazgos, y marca inicio/fin.
 * "Fin" lo puede mandar otro técnico: queda 'técnico que abrió' y 'técnico que
 * cerró', se cierra el caso y se genera el certificado.
 *
 * Habla con POST /api/integrations/preventivo-bot (JSON o multipart para fotos).
 * Sin dependencias nuevas (fetch/FormData/Blob nativos, long polling).
 *
 * Variables de entorno:
 *   TELEGRAM_PREVENTIVO_CARGA_TOKEN  (req) token del bot (BotFather)
 *   PREVENTIVO_BOT_URL               (req) ej. http://localhost:3000/api/integrations/preventivo-bot
 *   NOVEDADES_INTAKE_SECRET          (req) el mismo secreto de la app
 *   NOVEDADES_TENANT_CODE            (opc) por defecto CAPITALBUS
 *
 * Prueba sin Telegram:  BOT_SELFTEST=1 npx tsx scripts/telegram-preventivo-carga-bot.ts
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
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
        if (key && process.env[key] === undefined) process.env[key] = val;
      }
    } catch {
      /* variables pueden venir del sistema */
    }
  }
}
loadEnvFiles();

// ------------------------------- Helpers puros -------------------------------

type EstadoCheck = "ok" | "hallazgo" | "na" | null;

// ¿El texto parece un código de bus? (K1416, 1416, ABC123...) y NO un comando.
function looksLikeBus(text: string): boolean {
  const t = text.trim();
  if (!t || t.startsWith("/")) return false;
  if (/^(inicio|fin|cancelar|menu|menú|ayuda|hola)$/i.test(t)) return false;
  return /^[a-zA-Z]?\d{2,6}[a-zA-Z0-9]*$/.test(t);
}

function estadoIcon(e: EstadoCheck): string {
  return e === "ok" ? "✅" : e === "hallazgo" ? "⚠️" : e === "na" ? "∅" : "⬜";
}
function cycleEstado(e: EstadoCheck): "ok" | "hallazgo" | "na" {
  if (e === "ok") return "hallazgo";
  if (e === "hallazgo") return "na";
  return "ok"; // null o "na" -> ok
}

function fmtStatus(s: any): string {
  if (!s) return "Sin datos.";
  const r = s.resumen || {};
  const out = [
    `🚌 Bus ${s.busCode ?? "?"}${s.busPlate ? ` (${s.busPlate})` : ""} · ${s.ref}`,
    `📸 Evidencias ${s.capturesDone}/${s.capturesTotal}   ✅ ${r.ok ?? 0}/${r.aplicables ?? 0}   ⚠️ ${r.hallazgo ?? 0}   ⏳ ${r.pendientes ?? 0}`,
  ];
  out.push(`🧾 OT Capital: ${s.otCapital || "pendiente"}`);
  if (s.dias) out.push(`📅 Días de grabación: ${s.dias}`);
  out.push(s.inicio ? `🕐 Inicio${s.aperturaBy ? ` · ${s.aperturaBy}` : ""}` : "🕐 Inicio: pendiente");
  if (s.fin) out.push(`🏁 Cerrado${s.cierreBy ? ` · ${s.cierreBy}` : ""}`);
  return out.join("\n");
}

function kbMain(s: any) {
  return {
    inline_keyboard: [
      [{ text: s.inicio ? "🕐 Inicio ✓ (marcado)" : "🕐 Marcar inicio", callback_data: "inicio" }],
      [{ text: `📸 Evidencias (${s.capturesDone}/${s.capturesTotal})`, callback_data: "menu:evid" }],
      [{ text: "⚡ Voltajes", callback_data: "menu:volt" }, { text: "✅ Checklist", callback_data: "menu:check" }],
      [{ text: "⚠️ Hallazgo", callback_data: "menu:hz" }, { text: "📅 Días grab.", callback_data: "menu:dias" }],
      [{ text: "🧾 OT de Capital", callback_data: "menu:ot" }],
      [{ text: "🔄 Actualizar", callback_data: "menu:main" }],
      [{ text: "🏁 Fin / cerrar", callback_data: "fin" }],
    ],
  };
}
function kbEvid(s: any) {
  const rows = (s.captures || []).map((c: any) => [{ text: `${c.done ? "✅" : "⬜"} ${c.label}`, callback_data: `cap:${c.id}` }]);
  rows.push([{ text: "⬅️ Menú", callback_data: "menu:main" }]);
  return { inline_keyboard: rows };
}
function kbVolt(s: any) {
  const rows = (s.voltajes || []).map((v: any) => [{ text: `${v.value ? "⚡" : "⬜"} ${v.label}${v.value ? `: ${v.value} V` : ""}`, callback_data: `volt:${v.id}` }]);
  rows.push([{ text: "⬅️ Menú", callback_data: "menu:main" }]);
  return { inline_keyboard: rows };
}
function kbCheckSections(s: any) {
  const rows = (s.checkSections || []).map((sec: any) => {
    const ok = sec.items.filter((i: any) => i.estado === "ok").length;
    return [{ text: `${sec.title} (${ok}/${sec.items.length})`, callback_data: `sec:${sec.id}` }];
  });
  rows.push([{ text: "⬅️ Menú", callback_data: "menu:main" }]);
  return { inline_keyboard: rows };
}
function kbCheckItems(s: any, sectionId: string) {
  const sec = (s.checkSections || []).find((x: any) => x.id === sectionId);
  const rows = (sec?.items || []).map((it: any) => [{ text: `${estadoIcon(it.estado)} ${it.label}`, callback_data: `chk:${sectionId}:${it.id}` }]);
  rows.push([{ text: "⬅️ Checklist", callback_data: "menu:check" }]);
  return { inline_keyboard: rows };
}
function kbSeverity() {
  return {
    inline_keyboard: [
      [{ text: "🔴 Crítico", callback_data: "hz:C" }, { text: "🟠 Moderado", callback_data: "hz:M" }, { text: "🔵 Leve", callback_data: "hz:L" }],
      [{ text: "⬅️ Menú", callback_data: "menu:main" }],
    ],
  };
}
// Selector explícito de estado para un ítem del checklist (no ciclo).
function kbEstadoPicker(sectionId: string, itemId: string) {
  return {
    inline_keyboard: [
      [
        { text: "✅ OK", callback_data: `st:${sectionId}:${itemId}:ok` },
        { text: "⚠️ Hallazgo", callback_data: `st:${sectionId}:${itemId}:hallazgo` },
        { text: "∅ N/A", callback_data: `st:${sectionId}:${itemId}:na` },
      ],
      [{ text: "⬅️ Volver", callback_data: `sec:${sectionId}` }],
    ],
  };
}
// Asistente de novedad: equipo -> tipo -> ¿cambio de equipo?
function kbHzEquipos(s: any) {
  const rows = (s.busEquipos || []).map((e: any) => [{ text: e.name, callback_data: `hzeq:${e.id}` }]);
  rows.push([{ text: "Sin equipo específico", callback_data: "hzeq:none" }]);
  rows.push([{ text: "⬅️ Menú", callback_data: "menu:main" }]);
  return { inline_keyboard: rows };
}
function kbHzTipo() {
  return {
    inline_keyboard: [
      [{ text: "📡 Sin transmisión", callback_data: "hzt:sin_transmision" }],
      [{ text: "🖼️ Falla en imagen", callback_data: "hzt:falla_imagen" }],
      [{ text: "⚠️ Afectado", callback_data: "hzt:afectado" }],
      [{ text: "⬅️ Menú", callback_data: "menu:main" }],
    ],
  };
}
function kbHzCambio() {
  return { inline_keyboard: [[{ text: "🔧 Sí, se cambió", callback_data: "hzc:si" }, { text: "No", callback_data: "hzc:no" }]] };
}
function kbConfirmFin() {
  return { inline_keyboard: [[{ text: "✅ Sí, cerrar y generar", callback_data: "finok" }, { text: "✖️ Cancelar", callback_data: "menu:main" }]] };
}
// Opciones estandarizadas del correctivo (edítalas aquí si hace falta).
const DIAGNOSTICOS = [
  "Fusible quemado",
  "Cable suelto o dañado",
  "Conector flojo / mal ponchado",
  "Falla de alimentación",
  "Cámara desconfigurada",
  "Disco dañado",
  "Firmware desactualizado",
  "Equipo dañado (requiere cambio)",
];
const SOLUCIONES = [
  "Cambio de fusible",
  "Reponchado",
  "Reconexión de cable",
  "Reemplazo de cable",
  "Reconfiguración",
  "Actualización de firmware",
  "Cambio de equipo",
  "Limpieza",
];

type CorrDraft = { diagnostico?: string; solucion?: string; observacion?: string; fecha?: string };

// Mini-flujo del correctivo (después de crearlo desde una novedad).
function kbCorrectivo(d: CorrDraft = {}) {
  return {
    inline_keyboard: [
      [{ text: `🔍 Diagnóstico${d.diagnostico ? ": " + d.diagnostico : ""}`, callback_data: "corrdiag" }],
      [{ text: `🔧 Solución${d.solucion ? ": " + d.solucion : ""}`, callback_data: "corrsol" }],
      [{ text: `📝 Observación${d.observacion ? " ✓" : ""}`, callback_data: "corrobs" }],
      [{ text: `🕐 Fecha: ${d.fecha || "ahora"}`, callback_data: "corrfecha" }],
      [{ text: "📸 Cargar evidencia", callback_data: "corrfoto" }],
      [{ text: "✅ Cerrar correctivo", callback_data: "corrcerrar" }],
      [{ text: "⬅️ Volver al bus", callback_data: "corrvolver" }],
    ],
  };
}
function kbDiag() {
  return { inline_keyboard: [...DIAGNOSTICOS.map((d, i) => [{ text: d, callback_data: `diag:${i}` }]), [{ text: "⬅️ Volver", callback_data: "corrmenu" }]] };
}
function kbSol() {
  return { inline_keyboard: [...SOLUCIONES.map((s, i) => [{ text: s, callback_data: `sol:${i}` }]), [{ text: "⬅️ Volver", callback_data: "corrmenu" }]] };
}

const HELP =
  "🤖 *Bot de carga de preventivos*\n\n" +
  "1️⃣ Regístrate una vez: `/registrar tu-correo@dominio.com`\n" +
  "2️⃣ Manda el *código del bus* (ej. K1416 o 1416).\n" +
  "3️⃣ Usa los botones para subir evidencias (una a una), voltajes, checks y hallazgos.\n" +
  "4️⃣ *Marcar inicio* al empezar y *Fin / cerrar* al terminar (puede cerrarlo otro técnico).";

// --------------------------- Cliente de Telegram -----------------------------

const TOKEN = process.env.TELEGRAM_PREVENTIVO_CARGA_TOKEN || "";
const API = `https://api.telegram.org/bot${TOKEN}`;
const ENDPOINT = process.env.PREVENTIVO_BOT_URL || "http://localhost:3000/api/integrations/preventivo-bot";
const SECRET = process.env.NOVEDADES_INTAKE_SECRET || "";
const TENANT_CODE = (process.env.NOVEDADES_TENANT_CODE || "").trim();
// Grupo de Telegram donde se avisa al cerrar un preventivo (opcional). El bot
// de carga debe estar dentro del grupo. Consigue el id enviando /id en el grupo.
const GROUP_CHAT_ID = (process.env.TELEGRAM_PREVENTIVOS_GROUP_CHAT_ID || "").trim();

async function tg(method: string, body: any): Promise<any> {
  const res = await fetch(`${API}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!json.ok) console.error("TELEGRAM_ERROR", method, json.description || res.status);
  return json;
}
async function sendMessage(chatId: number | string, text: string, keyboard?: any) {
  return tg("sendMessage", { chat_id: chatId, text, parse_mode: "Markdown", reply_markup: keyboard, disable_web_page_preview: true });
}
async function answerCb(id: string, text?: string) {
  return tg("answerCallbackQuery", { callback_query_id: id, text: text || undefined });
}

async function api(payload: any): Promise<any> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-integration-secret": SECRET },
      body: JSON.stringify({ tenantCode: TENANT_CODE || undefined, ...payload }),
      signal: AbortSignal.timeout(30000),
    });
    return await res.json().catch(() => ({ ok: false }));
  } catch (e) {
    console.error("API_FAILED", payload?.action, e);
    return { ok: false };
  }
}
async function apiUpload(fields: Record<string, string>, buffer: Buffer, filename: string): Promise<any> {
  try {
    const fd = new FormData();
    if (TENANT_CODE) fd.set("tenantCode", TENANT_CODE);
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    fd.set("file", new Blob([buffer]), filename);
    const res = await fetch(ENDPOINT, { method: "POST", headers: { "x-integration-secret": SECRET }, body: fd, signal: AbortSignal.timeout(60000) });
    return await res.json().catch(() => ({ ok: false }));
  } catch (e) {
    console.error("API_UPLOAD_FAILED", e);
    return { ok: false };
  }
}
async function downloadPhoto(fileId: string): Promise<{ buffer: Buffer; name: string } | null> {
  const f = await tg("getFile", { file_id: fileId });
  const fp = f?.result?.file_path;
  if (!fp) return null;
  const res = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${fp}`);
  const ab = await res.arrayBuffer();
  return { buffer: Buffer.from(ab), name: fp.split("/").pop() || "foto.jpg" };
}

// ------------------------------ Estado por chat ------------------------------

type Awaiting = { kind: "photo" | "value" | "hallazgo" | "corrphoto" | "corrobs" | "corrfecha"; sectionId?: string; itemId?: string; severity?: string; label?: string };
type HzDraft = { equipoId?: string; equipoName?: string; tipo?: string };
type ChatState = { caseId?: string; busCode?: string; awaiting?: Awaiting; hz?: HzDraft; corrCaseId?: string; corrRef?: string; corrDraft?: CorrDraft; corrEvid?: number };
const state = new Map<string, ChatState>();
const getState = (id: string): ChatState => state.get(id) || {};
const setState = (id: string, s: ChatState) => state.set(id, s);

function labelOfCapture(s: any, itemId: string): string {
  return (s?.captures || []).find((c: any) => c.id === itemId)?.label || itemId;
}
function labelOfVolt(s: any, itemId: string): string {
  return (s?.voltajes || []).find((v: any) => v.id === itemId)?.label || itemId;
}

// ------------------------------- Manejo de chat ------------------------------

async function showMenu(chatId: string, s: any, prefix?: string) {
  await sendMessage(chatId, `${prefix ? prefix + "\n\n" : ""}${fmtStatus(s)}`, kbMain(s));
}

// Aviso al grupo "Preventivos CapitalBus" cuando se cierra un preventivo.
async function notifyGroup(s: any) {
  if (!GROUP_CHAT_ID || !s) return;
  const r = s.resumen || {};
  const txt = [
    `🛠️ *Preventivo cerrado* — ${s.ref}`,
    `🚌 Bus ${s.busCode ?? "?"}${s.busPlate ? ` (${s.busPlate})` : ""}`,
    `👷 Cerró: ${s.cierreBy || "—"}`,
    `🧾 OT Capital: ${s.otCapital || "pendiente"}`,
    `✅ OK ${r.ok ?? 0}/${r.aplicables ?? 0}   ⚠️ Hallazgos ${r.hallazgo ?? 0}`,
  ].join("\n");
  await tg("sendMessage", { chat_id: GROUP_CHAT_ID, text: txt, parse_mode: "Markdown", disable_web_page_preview: true }).catch(() => {});
}

// Crea/abre el preventivo del mes y muestra el menú.
async function startPreventivo(chatId: string, busCode: string) {
  const r = await api({ action: "start", chatId, busCode });
  if (!r?.ok) { await sendMessage(chatId, "⚠️ No pude conectar. Intenta de nuevo."); return; }
  if (!r.found) { await sendMessage(chatId, "No encontré ese bus. Escribe el código (ej. K1416)."); return; }
  setState(chatId, { caseId: r.status.caseId, busCode: r.status.busCode });
  await showMenu(chatId, r.status, r.creado ? "🛠️ Creé el preventivo del mes." : "🛠️ Preventivo en curso.");
}

// Antes del preventivo: revisa novedades reportadas del bus y ofrece crear correctivo.
async function showBusCheck(chatId: string, busCode: string) {
  const chk = await api({ action: "check-bus", chatId, busCode });
  if (!chk?.ok) { await sendMessage(chatId, "⚠️ No pude conectar. Intenta de nuevo."); return; }
  if (!chk.found) { await sendMessage(chatId, "No encontré ese bus. Escribe el código (ej. K1416 o 1416)."); return; }
  setState(chatId, { busCode: chk.bus.code });
  const nov = chk.novedades || [];
  if (nov.length) {
    const lines = nov.map((n: any) => `• ${n.ref} — ${n.title || "novedad"}`).join("\n");
    const kb = {
      inline_keyboard: [
        ...nov.map((n: any) => [{ text: `🔧 Crear correctivo: ${n.ref}`, callback_data: `cnov:${n.id}` }]),
        [{ text: "🛠️ Iniciar preventivo", callback_data: "iniprev" }],
      ],
    };
    await sendMessage(chatId, `⚠️ El bus *${chk.bus.code}* tiene *${nov.length}* novedad(es) reportada(s):\n${lines}\n\n¿Qué deseas hacer?`, kb);
  } else {
    await sendMessage(chatId, `✅ Bus *${chk.bus.code}* sin novedades reportadas.`);
    await startPreventivo(chatId, chk.bus.code);
  }
}

async function handleMessage(msg: any) {
  const chatId = String(msg.chat.id);
  const chatType = msg.chat.type;
  // /id funciona en cualquier chat (incluidos grupos), para obtener el id del grupo.
  const firstTok = String(msg.text || "").trim().toLowerCase().split(/\s+/)[0]?.split("@")[0];
  if (firstTok === "/id") { await sendMessage(chatId, `🆔 Chat ID: ${chatId}`); return; }
  if (chatType && chatType !== "private") return;
  const st = getState(chatId);

  // Foto: si estamos esperando una evidencia.
  const photo = Array.isArray(msg.photo) && msg.photo.length ? msg.photo[msg.photo.length - 1] : (msg.document && /image\//.test(msg.document.mime_type || "") ? msg.document : null);
  if (photo) {
    // Evidencia de un correctivo (mini-flujo)
    if (st.awaiting?.kind === "corrphoto" && st.corrCaseId) {
      const dl = await downloadPhoto(photo.file_id);
      if (!dl) { await sendMessage(chatId, "⚠️ No pude descargar la foto. Intenta de nuevo."); return; }
      const r = await apiUpload({ action: "correctivo-upload", chatId, caseId: st.corrCaseId }, dl.buffer, dl.name);
      if (!r?.ok || r.error) { setState(chatId, { ...st, awaiting: undefined }); await sendMessage(chatId, `⚠️ ${r?.error || "No se pudo guardar."}`); return; }
      const nEvid = (st.corrEvid || 0) + 1;
      setState(chatId, { ...st, awaiting: undefined, corrEvid: nEvid });
      await sendMessage(chatId, `✅ Evidencia guardada (${nEvid}). Puedes subir más o cerrar.`, kbCorrectivo(st.corrDraft));
      return;
    }
    if (!st.awaiting || st.awaiting.kind !== "photo" || !st.caseId) {
      await sendMessage(chatId, "Primero elige qué evidencia vas a subir (botón 📸 Evidencias).");
      return;
    }
    const dl = await downloadPhoto(photo.file_id);
    if (!dl) { await sendMessage(chatId, "⚠️ No pude descargar la foto. Intenta de nuevo."); return; }
    const r = await apiUpload({ action: "upload", chatId, caseId: st.caseId, itemId: st.awaiting.itemId || "" }, dl.buffer, dl.name);
    if (!r?.ok || r.error) { await sendMessage(chatId, `⚠️ ${r?.error || "No se pudo guardar."}`); return; }
    setState(chatId, { ...st, awaiting: undefined });
    await sendMessage(chatId, `✅ Guardada: *${r.saved}*`, kbEvid(r.status));
    return;
  }

  const text = String(msg.text || "").trim();
  if (!text) return;
  const cmd = text.startsWith("/") ? text.split(/\s+/)[0].toLowerCase().split("@")[0] : "";

  if (cmd === "/id") { await sendMessage(chatId, `🆔 Chat ID: ${chatId}`); return; }
  if (cmd === "/registrar" || cmd === "/registro") {
    const email = text.split(/\s+/)[1] || "";
    if (!email) { await sendMessage(chatId, "Escribe: `/registrar tu-correo@dominio.com`"); return; }
    const r = await api({ action: "register", chatId, email });
    if (r?.error) { await sendMessage(chatId, `⚠️ ${r.error}`); return; }
    if (r?.user) { await sendMessage(chatId, `✅ Listo, *${r.user.name}*. Ya puedes mandar el código del bus.`); return; }
    await sendMessage(chatId, "⚠️ No pude registrarte. Intenta de nuevo.");
    return;
  }
  if (cmd === "/start" || cmd === "/help" || cmd === "/ayuda") { await sendMessage(chatId, HELP); return; }

  // Observación libre del correctivo (mini-flujo, no requiere preventivo).
  if (st.awaiting?.kind === "corrobs" && st.corrCaseId) {
    const draft = { ...(st.corrDraft || {}), observacion: text };
    setState(chatId, { ...st, awaiting: undefined, corrDraft: draft });
    await sendMessage(chatId, "✅ Observación guardada.", kbCorrectivo(draft));
    return;
  }
  // Fecha y hora en que se realizó el correctivo.
  if (st.awaiting?.kind === "corrfecha" && st.corrCaseId) {
    const fecha = /^ahora$/i.test(text) ? "" : text;
    const draft = { ...(st.corrDraft || {}), fecha };
    setState(chatId, { ...st, awaiting: undefined, corrDraft: draft });
    await sendMessage(chatId, fecha ? `✅ Fecha: ${fecha}` : "✅ Se usará la fecha y hora actual.", kbCorrectivo(draft));
    return;
  }

  // Esperando un valor (voltaje, días) o descripción de hallazgo.
  if (st.awaiting && st.caseId) {
    if (st.awaiting.kind === "value") {
      const r = await api({ action: "set", chatId, caseId: st.caseId, sectionId: st.awaiting.sectionId, itemId: st.awaiting.itemId, value: text });
      setState(chatId, { ...st, awaiting: undefined });
      if (!r?.ok || r.error) { await sendMessage(chatId, `⚠️ ${r?.error || "No se pudo guardar."}`); return; }
      await showMenu(chatId, r.status, "✅ Guardado.");
      return;
    }
    if (st.awaiting.kind === "hallazgo") {
      const [equipo, ...rest] = text.split(/\s*[-—]\s*/);
      const descripcion = rest.join(" — ") || equipo;
      const r = await api({ action: "hallazgo", chatId, caseId: st.caseId, severity: st.awaiting.severity, equipo: rest.length ? equipo : "", descripcion, requiereCorrectivo: true });
      setState(chatId, { ...st, awaiting: undefined });
      if (!r?.ok || r.error) { await sendMessage(chatId, `⚠️ ${r?.error || "No se pudo guardar."}`); return; }
      await showMenu(chatId, r.status, "⚠️ Hallazgo registrado.");
      return;
    }
  }

  // Palabras clave inicio/fin por texto.
  if (/^inicio$/i.test(text) && st.caseId) { await doInicio(chatId, st.caseId); return; }
  if (/^fin$/i.test(text) && st.caseId) { await sendMessage(chatId, "¿Cerrar el preventivo y generar el certificado?", kbConfirmFin()); return; }

  // ¿Es un código de bus?
  if (looksLikeBus(text)) {
    const who = await api({ action: "whoami", chatId });
    if (!who?.user) { await sendMessage(chatId, "Primero regístrate: `/registrar tu-correo@dominio.com`"); return; }
    await sendMessage(chatId, "🔎 Revisando el bus...");
    await showBusCheck(chatId, text);
    return;
  }

  await sendMessage(chatId, "Manda el *código del bus* (ej. K1416) o escribe /help.");
}

async function doInicio(chatId: string, caseId: string) {
  const r = await api({ action: "inicio", chatId, caseId });
  if (!r?.ok || r.error) { await sendMessage(chatId, `⚠️ ${r?.error || "No se pudo."}`); return; }
  await showMenu(chatId, r.status, "🕐 Inicio registrado.");
}

async function handleCallback(cb: any) {
  const chatId = String(cb.message.chat.id);
  const data = String(cb.data || "");
  const st = getState(chatId);
  await answerCb(cb.id);

  // Estas opciones funcionan ANTES de iniciar el preventivo (no requieren caseId):
  if (data === "iniprev") {
    if (!st.busCode) { await sendMessage(chatId, "Manda el código del bus."); return; }
    await startPreventivo(chatId, st.busCode);
    return;
  }
  if (data.startsWith("cnov:")) {
    const novedadId = data.slice(5);
    const r = await api({ action: "crear-correctivo", chatId, novedadId });
    if (!r?.ok || r.error) { await sendMessage(chatId, `⚠️ ${r?.error || "No se pudo crear el correctivo."}`); return; }
    setState(chatId, { ...st, corrCaseId: r.correctivoCaseId, corrRef: r.correctivoRef, corrDraft: {}, corrEvid: 0 });
    await sendMessage(chatId, `✅ Correctivo *${r.correctivoRef}* creado para la novedad ${r.novedadRef} (asignado a ti).\n\nCompleta y ciérralo:`, kbCorrectivo({}));
    return;
  }
  if (data === "corrmenu") {
    if (!st.corrCaseId) { await sendMessage(chatId, "No hay correctivo activo."); return; }
    await sendMessage(chatId, `Correctivo *${st.corrRef}*:`, kbCorrectivo(st.corrDraft));
    return;
  }
  if (data === "corrdiag") {
    if (!st.corrCaseId) { await sendMessage(chatId, "No hay correctivo activo."); return; }
    await sendMessage(chatId, "🔍 Elige el *diagnóstico*:", kbDiag());
    return;
  }
  if (data.startsWith("diag:")) {
    const dg = DIAGNOSTICOS[parseInt(data.slice(5), 10)] || "";
    const draft = { ...(st.corrDraft || {}), diagnostico: dg };
    setState(chatId, { ...st, corrDraft: draft });
    await sendMessage(chatId, `✅ Diagnóstico: ${dg}`, kbCorrectivo(draft));
    return;
  }
  if (data === "corrsol") {
    if (!st.corrCaseId) { await sendMessage(chatId, "No hay correctivo activo."); return; }
    await sendMessage(chatId, "🔧 Elige la *solución*:", kbSol());
    return;
  }
  if (data.startsWith("sol:")) {
    const so = SOLUCIONES[parseInt(data.slice(4), 10)] || "";
    const draft = { ...(st.corrDraft || {}), solucion: so };
    setState(chatId, { ...st, corrDraft: draft });
    await sendMessage(chatId, `✅ Solución: ${so}`, kbCorrectivo(draft));
    return;
  }
  if (data === "corrobs") {
    if (!st.corrCaseId) { await sendMessage(chatId, "No hay correctivo activo."); return; }
    setState(chatId, { ...st, awaiting: { kind: "corrobs" } });
    await sendMessage(chatId, "📝 Escribe la *observación* (opcional):");
    return;
  }
  if (data === "corrfecha") {
    if (!st.corrCaseId) { await sendMessage(chatId, "No hay correctivo activo."); return; }
    setState(chatId, { ...st, awaiting: { kind: "corrfecha" } });
    await sendMessage(chatId, "🕐 Escribe la *fecha y hora* del correctivo (ej. 01/07/2026 14:30) o escribe *ahora*:");
    return;
  }
  if (data === "corrfoto") {
    if (!st.corrCaseId) { await sendMessage(chatId, "No hay correctivo activo."); return; }
    setState(chatId, { ...st, awaiting: { kind: "corrphoto" } });
    await sendMessage(chatId, "📸 Envía la foto de la evidencia del correctivo.");
    return;
  }
  if (data === "corrcerrar" || data === "corrcerrarforce") {
    if (!st.corrCaseId) { await sendMessage(chatId, "No hay correctivo activo."); return; }
    // No dejar cerrar sin evidencia por accidente: pedir confirmación explícita.
    if (data === "corrcerrar" && !(st.corrEvid && st.corrEvid > 0)) {
      await sendMessage(chatId, "⚠️ Aún no cargaste ninguna foto de evidencia. Sube al menos una (📸) antes de cerrar, o confirma cerrar sin evidencia.", {
        inline_keyboard: [
          [{ text: "📸 Cargar evidencia", callback_data: "corrfoto" }],
          [{ text: "✅ Cerrar sin evidencia", callback_data: "corrcerrarforce" }],
          [{ text: "⬅️ Volver", callback_data: "corrmenu" }],
        ],
      });
      return;
    }
    const d = st.corrDraft || {};
    const r = await api({ action: "correctivo-cerrar", chatId, caseId: st.corrCaseId, diagnostico: d.diagnostico || "", solucion: d.solucion || "", observacion: d.observacion || "", fecha: d.fecha || "" });
    if (!r?.ok || r.error) { await sendMessage(chatId, `⚠️ ${r?.error || "No se pudo cerrar."}`); return; }
    const nov = r.cerroNovedad ? " La novedad asociada se cerró automáticamente." : "";
    await sendMessage(chatId, `✅ Correctivo *${r.ref}* cerrado.${nov}`);
    setState(chatId, { busCode: st.busCode });
    if (st.busCode) await showBusCheck(chatId, st.busCode);
    return;
  }
  if (data === "corrvolver") {
    setState(chatId, { busCode: st.busCode });
    if (st.busCode) await showBusCheck(chatId, st.busCode);
    else await sendMessage(chatId, "Manda el código del bus.");
    return;
  }

  if (!st.caseId && data !== "menu:main") { await sendMessage(chatId, "Manda el código del bus para empezar."); return; }

  const refresh = async () => (await api({ action: "status", chatId, caseId: st.caseId })).status;

  if (data === "menu:main") {
    const s = await refresh();
    if (!s) { await sendMessage(chatId, "Manda el código del bus para empezar."); return; }
    await showMenu(chatId, s);
    return;
  }
  if (data === "menu:evid") { const s = await refresh(); await sendMessage(chatId, "📸 Toca una evidencia para subir su foto:", kbEvid(s)); return; }
  if (data === "menu:volt") { const s = await refresh(); await sendMessage(chatId, "⚡ Toca un voltaje para escribir su valor:", kbVolt(s)); return; }
  if (data === "menu:check") { const s = await refresh(); await sendMessage(chatId, "✅ Elige una sección del checklist:", kbCheckSections(s)); return; }
  if (data === "menu:hz") { const s = await refresh(); setState(chatId, { ...st, hz: {} }); await sendMessage(chatId, "⚠️ *Novedad* — ¿en qué equipo?", kbHzEquipos(s)); return; }
  if (data === "menu:dias") { setState(chatId, { ...st, awaiting: { kind: "value", sectionId: "identificacion", itemId: "diasGrabacion" } }); await sendMessage(chatId, "📅 Escribe los *días de grabación* (número):"); return; }
  if (data === "menu:ot") { setState(chatId, { ...st, awaiting: { kind: "value", sectionId: "identificacion", itemId: "otCapital" } }); await sendMessage(chatId, "🧾 Escribe el *número de la OT de Capital*:"); return; }

  if (data.startsWith("cap:")) {
    const itemId = data.slice(4);
    const s = await refresh();
    setState(chatId, { ...st, awaiting: { kind: "photo", sectionId: "capturas", itemId } });
    await sendMessage(chatId, `📸 Envía la foto de *${labelOfCapture(s, itemId)}*.`);
    return;
  }
  if (data.startsWith("volt:")) {
    const itemId = data.slice(5);
    const s = await refresh();
    setState(chatId, { ...st, awaiting: { kind: "value", sectionId: "electrico", itemId } });
    await sendMessage(chatId, `⚡ Escribe el valor de *${labelOfVolt(s, itemId)}* (ej. 13.8):`);
    return;
  }
  if (data.startsWith("sec:")) { const s = await refresh(); await sendMessage(chatId, "Toca un ítem para elegir su estado:", kbCheckItems(s, data.slice(4))); return; }
  if (data.startsWith("chk:")) {
    const [, sectionId, itemId] = data.split(":");
    await sendMessage(chatId, "Elige el estado:", kbEstadoPicker(sectionId, itemId));
    return;
  }
  if (data.startsWith("st:")) {
    const [, sectionId, itemId, estado] = data.split(":");
    const r = await api({ action: "set", chatId, caseId: st.caseId, sectionId, itemId, estado });
    if (!r?.ok) { await sendMessage(chatId, "⚠️ No se pudo."); return; }
    const et = estado === "ok" ? "✅ OK" : estado === "hallazgo" ? "⚠️ Hallazgo" : "∅ N/A";
    await sendMessage(chatId, `Guardado: ${et}`, kbCheckItems(r.status, sectionId));
    return;
  }
  if (data.startsWith("hzeq:")) {
    const id = data.slice(5);
    const s = await refresh();
    const name = id === "none" ? "" : (s.busEquipos || []).find((e: any) => e.id === id)?.name || "";
    setState(chatId, { ...st, hz: { equipoId: id === "none" ? undefined : id, equipoName: name } });
    await sendMessage(chatId, `Equipo: *${name || "sin equipo"}*. ¿Qué novedad tiene?`, kbHzTipo());
    return;
  }
  if (data.startsWith("hzt:")) {
    const tipo = data.slice(4);
    setState(chatId, { ...st, hz: { ...(st.hz || {}), tipo } });
    await sendMessage(chatId, "¿Hubo *cambio de equipo*?", kbHzCambio());
    return;
  }
  if (data.startsWith("hzc:")) {
    const cambio = data.slice(4) === "si";
    const hz = st.hz || {};
    if (!hz.tipo) { await sendMessage(chatId, "Empieza la novedad de nuevo con ⚠️ Hallazgo."); return; }
    const r = await api({ action: "hallazgo", chatId, caseId: st.caseId, equipoId: hz.equipoId, tipoNovedad: hz.tipo, cambioEquipo: cambio });
    setState(chatId, { ...st, hz: undefined });
    if (!r?.ok || r.error) { await sendMessage(chatId, `⚠️ ${r?.error || "No se pudo."}`); return; }
    await showMenu(chatId, r.status, "⚠️ Novedad registrada.");
    return;
  }
  if (data === "inicio") { await doInicio(chatId, st.caseId!); return; }
  if (data === "fin") { await sendMessage(chatId, "¿Cerrar el preventivo y generar el certificado?", kbConfirmFin()); return; }
  if (data === "finok") {
    await sendMessage(chatId, "🏁 Cerrando y generando certificado...");
    const r = await api({ action: "fin", chatId, caseId: st.caseId });
    if (!r?.ok || r.error) { await sendMessage(chatId, `⚠️ ${r?.error || "No se pudo cerrar."}`); return; }
    const cert = r.certificado ? "📄 Certificado generado y adjunto al caso." : "⚠️ (El certificado no se pudo generar; revísalo en el panel.)";
    await sendMessage(chatId, `✅ Preventivo *${r.status.ref}* cerrado.\n${cert}`);
    await notifyGroup(r.status);
    setState(chatId, {});
    return;
  }
}

async function handleUpdate(update: any) {
  if (update.callback_query) { await handleCallback(update.callback_query); return; }
  if (update.message && update.message.chat) await handleMessage(update.message);
}

// --------------------------------- Self-test ---------------------------------

function runSelfTest(): void {
  const assert = (c: boolean, m: string) => { if (!c) throw new Error("SELFTEST FALLÓ: " + m); };

  assert(looksLikeBus("K1416") && looksLikeBus("1416") && looksLikeBus("k1402a"), "detecta bus");
  assert(!looksLikeBus("/start") && !looksLikeBus("inicio") && !looksLikeBus("hola mundo"), "ignora comandos/palabras");

  assert(estadoIcon("ok") === "✅" && estadoIcon("hallazgo") === "⚠️" && estadoIcon(null) === "⬜", "iconos estado");
  assert(cycleEstado(null) === "ok" && cycleEstado("ok") === "hallazgo" && cycleEstado("hallazgo") === "na" && cycleEstado("na") === "ok", "ciclo estado");

  const s = {
    ref: "CASO-1087", busCode: "K1416", busPlate: "WLF-482", capturesDone: 14, capturesTotal: 15,
    resumen: { ok: 17, aplicables: 19, hallazgo: 2, pendientes: 0 }, dias: "30", inicio: null,
    captures: [{ id: "inicio", label: "Inicio", done: true }, { id: "batch", label: "Batch", done: false }],
    voltajes: [{ id: "bateria", label: "Baterías", value: "13.8" }, { id: "nvr", label: "Voltaje NVR", value: "" }],
    checkSections: [{ id: "limpieza", title: "Limpieza", items: [{ id: "nvr", label: "NVR", estado: "ok" }, { id: "cam", label: "Cámaras", estado: null }] }],
  };
  const txt = fmtStatus(s);
  assert(txt.includes("K1416") && txt.includes("CASO-1087") && txt.includes("14/15") && txt.includes("30"), "texto de estado");

  assert(kbMain(s).inline_keyboard.length >= 4, "menu principal");
  assert(kbEvid(s).inline_keyboard.length === 3, "teclado evidencias (2 + menú)");
  assert(kbEvid(s).inline_keyboard[0][0].callback_data === "cap:inicio", "callback captura");
  assert(kbVolt(s).inline_keyboard[0][0].text.includes("13.8"), "voltaje con valor");
  assert(kbCheckSections(s).inline_keyboard[0][0].callback_data === "sec:limpieza", "sección check");
  assert(kbCheckItems(s, "limpieza").inline_keyboard[0][0].callback_data === "chk:limpieza:nvr", "item check callback");
  assert(kbSeverity().inline_keyboard[0][1].callback_data === "hz:M", "severidad");
  assert(kbEstadoPicker("limpieza", "nvr").inline_keyboard[0][1].callback_data === "st:limpieza:nvr:hallazgo", "picker estado");
  assert(kbHzEquipos({ busEquipos: [{ id: "e1", name: "NVR (SN123)" }] }).inline_keyboard[0][0].callback_data === "hzeq:e1", "hz equipos");
  assert(kbHzTipo().inline_keyboard[0][0].callback_data === "hzt:sin_transmision", "hz tipo");
  assert(kbHzCambio().inline_keyboard[0][0].callback_data === "hzc:si", "hz cambio");

  console.log("✅ SELFTEST OK: lógica del bot de carga correcta.");
}

// ----------------------------------- Main ------------------------------------

async function main() {
  if (process.env.BOT_SELFTEST === "1" || process.argv.includes("--selftest")) { runSelfTest(); return; }
  if (!TOKEN) throw new Error("Falta TELEGRAM_PREVENTIVO_CARGA_TOKEN.");
  if (!SECRET) throw new Error("Falta NOVEDADES_INTAKE_SECRET.");

  await tg("setMyCommands", {
    commands: [
      { command: "start", description: "Cómo usar el bot" },
      { command: "registrar", description: "Vincular tu correo de técnico" },
      { command: "help", description: "Ayuda" },
      { command: "id", description: "Mostrar el ID de este chat" },
    ],
  });

  console.log("🤖 Bot de carga de preventivos en marcha. Endpoint:", ENDPOINT);
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const res = await fetch(`${API}/getUpdates?timeout=50&offset=${offset}&allowed_updates=["message","callback_query"]`);
      const json: any = await res.json().catch(() => ({}));
      if (!json.ok) { await new Promise((r) => setTimeout(r, 3000)); continue; }
      for (const update of json.result) {
        offset = update.update_id + 1;
        try { await handleUpdate(update); } catch (e) { console.error("HANDLE_UPDATE_FAILED", e); }
      }
    } catch (e) {
      console.error("POLL_FAILED", e);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
