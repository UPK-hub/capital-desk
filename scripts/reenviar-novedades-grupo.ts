/**
 * Reenvía al grupo de Telegram de novedades el aviso "🆕 Nueva novedad CASO-XXX"
 * de las novedades creadas en un periodo (útil si se borraron por accidente).
 *
 * Reconstruye el mensaje desde el evento CREATED de cada novedad (mismo contenido
 * que publicó el bot). NO restaura los mensajes borrados: publica mensajes NUEVOS.
 *
 * Variables de entorno (las mismas del bot):
 *   TELEGRAM_BOT_TOKEN        (req)
 *   TELEGRAM_GROUP_CHAT_ID    (req)
 *   APP_URL / NEXTAUTH_URL    (opc, para el botón "Ver la novedad")
 *   NOVEDADES_TENANT_CODE     (opc, por defecto CAPITALBUS)
 *
 * DRY-RUN por defecto (solo muestra qué enviaría). Agrega --apply para enviar.
 *   npm run novedades:reenviar-grupo -- --dias 7
 *   npm run novedades:reenviar-grupo -- --dias 7 --apply
 *   npm run novedades:reenviar-grupo -- --desde 2026-06-24 --hasta 2026-06-30 --apply
 */
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { CaseEventType } from "@prisma/client";

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
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
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

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

const TOKEN = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const GROUP = (process.env.TELEGRAM_GROUP_CHAT_ID || "").trim();
const BASE = (process.env.APP_URL || process.env.NEXTAUTH_URL || "").trim().replace(/\/+$/, "");
const TENANT_CODE = (arg("--tenant") || process.env.NOVEDADES_TENANT_CODE || "CAPITALBUS").trim().toUpperCase();

function fmtDate(d: Date): string {
  try {
    return new Date(d).toLocaleString("es-CO", {
      timeZone: "America/Bogota",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return new Date(d).toISOString();
  }
}

function buildMessage(c: any): string {
  const meta = (c.events?.[0]?.meta ?? {}) as Record<string, any>;
  const ref = `CASO-${String(c.caseNo ?? "").padStart(3, "0")}`;
  const plate = c.bus?.plate ? ` (${c.bus.plate})` : "";
  const equipo = meta.affectedEquipmentLabel ?? "—";
  const falla = `${meta.catalogCode ? `${meta.catalogCode} · ` : ""}${meta.reportedNovelty ?? c.title ?? "—"}`;
  const obs = meta.observations;
  const reporter = meta.reporter?.name ?? "—";
  const tgUser = meta.telegram?.username ? ` (@${meta.telegram.username})` : "";
  const assoc = meta.matchedUser?.name ? `✅ Usuario: ${meta.matchedUser.name}` : "❗ No asociado a ningún usuario";
  return [
    `🆕 Nueva novedad ${ref}`,
    `🚌 Bus: ${c.bus?.code ?? "—"}${plate}`,
    `🧩 Equipo: ${equipo}`,
    `⚠️ Falla: ${falla}`,
    obs ? `📝 Detalle: ${obs}` : null,
    `👤 Reporta: ${reporter}${tgUser}`,
    assoc,
    `🕒 Creada: ${fmtDate(c.createdAt)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function sendToGroup(text: string, caseId: string): Promise<boolean> {
  const markup = BASE
    ? { inline_keyboard: [[{ text: "🔗 Ver la novedad", url: `${BASE}/cases/${caseId}` }]] }
    : undefined;
  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ chat_id: GROUP, text, ...(markup ? { reply_markup: markup } : {}) }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!json.ok) console.error("  ✗ Telegram:", json.description || res.status);
    return Boolean(json.ok);
  } catch (e) {
    console.error("  ✗ Error de red:", e);
    return false;
  }
}

async function main() {
  const apply = process.argv.includes("--apply");

  const tenant =
    (await prisma.tenant.findFirst({ where: { code: TENANT_CODE } })) ??
    (await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!tenant) {
    console.error("✗ No se encontró el tenant.");
    process.exit(1);
  }

  // Rango: --desde/--hasta o --dias N (por defecto 7).
  const desde = arg("--desde");
  const hasta = arg("--hasta");
  let gte: Date;
  let lte: Date;
  if (desde && hasta) {
    gte = new Date(`${desde}T00:00:00-05:00`);
    lte = new Date(`${hasta}T23:59:59.999-05:00`);
  } else {
    const dias = Number(arg("--dias") || "7") || 7;
    lte = new Date();
    gte = new Date(lte.getTime() - dias * 24 * 60 * 60 * 1000);
  }

  const rows = await prisma.case.findMany({
    where: { tenantId: tenant.id, type: "NOVEDAD" as any, createdAt: { gte, lte } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      caseNo: true,
      title: true,
      createdAt: true,
      bus: { select: { code: true, plate: true } },
      events: {
        where: { type: CaseEventType.CREATED },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { meta: true },
      },
    },
  });

  console.log(`\n=== Reenviar avisos de novedad al grupo ===`);
  console.log(`Modo: ${apply ? "APLICAR (envía a Telegram)" : "DRY-RUN (no envía nada)"}  ·  Tenant: ${TENANT_CODE}`);
  console.log(`Rango: ${fmtDate(gte)}  →  ${fmtDate(lte)}`);
  console.log(`Novedades encontradas: ${rows.length}`);
  console.log(`Grupo (chat id): ${GROUP || "✗ FALTA TELEGRAM_GROUP_CHAT_ID"}\n`);

  if (apply && (!TOKEN || !GROUP)) {
    console.error("✗ Faltan TELEGRAM_BOT_TOKEN y/o TELEGRAM_GROUP_CHAT_ID. (Abortado, no se envió nada.)");
    process.exit(1);
  }

  let sent = 0;
  let failed = 0;
  for (const c of rows) {
    const text = buildMessage(c);
    const ref = `CASO-${String(c.caseNo ?? "").padStart(3, "0")}`;
    if (!apply) {
      console.log(`— ${ref} (${c.bus?.code ?? "—"}) —\n${text}\n`);
      continue;
    }
    const ok = await sendToGroup(text, c.id);
    if (ok) {
      sent += 1;
      console.log(`  ✓ ${ref} enviado`);
    } else {
      failed += 1;
      console.log(`  ✗ ${ref} falló`);
    }
    // Pausa para no exceder el límite de Telegram (~20 msg/min a un grupo).
    await new Promise((r) => setTimeout(r, 1200));
  }

  console.log(`\n=== ${apply ? "Enviado" : "Se enviaría"} ===`);
  if (apply) console.log(`  ✓ Enviados: ${sent}  ·  ✗ Fallidos: ${failed}`);
  else console.log(`  Se enviarían ${rows.length} mensajes. Agrega --apply para enviarlos.`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("✗ Falló:", err);
  await prisma.$disconnect();
  process.exit(1);
});
