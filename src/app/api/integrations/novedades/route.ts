// src/app/api/integrations/novedades/route.ts
//
// Ingesta de novedades reportadas por clientes desde canales externos
// (ej. el bot de Telegram). Crea SOLO el caso NOVEDAD (estado NUEVO) para que
// el equipo lo revise y decida si genera correctivo/OT. No requiere sesión de
// navegador: se autentica con un secreto compartido en el header
// `x-integration-secret` (env NOVEDADES_INTAKE_SECRET).
//
// GET  -> utilidades para el bot: validar bus (con o sin "K"), listar equipos
//         del catálogo y listar fallas (con código NVD-xxx) por equipo.
// POST -> crea la novedad. Asocia al usuario de la mesa cuyo nombre coincida
//         (como creador, vía CaseEvent CREATED meta.userId). Si no hay match,
//         registra igual y deja una alerta visible.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { nextNumbers } from "@/lib/tenant-sequence";
import { saveUpload } from "@/lib/uploads";
import { notifyTenantUsers } from "@/lib/notifications";
import { autoGroupNovedad, findSimilarOtherCreator } from "@/lib/novedades/duplicates-server";
import { loadNovedadCatalog } from "@/lib/novedad-catalog";
import { CaseEventType, CaseStatus, NotificationType, Role } from "@prisma/client";

const DEFAULT_TENANT_CODE = (
  process.env.NOVEDADES_TENANT_CODE ||
  process.env.TENANT_CODE ||
  "CAPITALBUS"
)
  .trim()
  .toUpperCase();

// Etiquetas de equipo, iguales a las de la página de Novedades de la mesa.
const EQUIPMENT_LABELS: Record<string, string> = {
  NVR: "NVR / Grabador",
  CAMARAS: "Cámaras",
  ROUTER_SIM: "Router / SIM",
  SWITCH_POE: "Switch PoE",
  GPS: "GPS",
  CMS: "Centro de Gestión (CMS)",
  IO_SENSORES: "Botón de pánico / Sensores",
  FIRMWARE: "Firmware",
  SOFTWARE: "Software",
  PARAMETRIZACION: "Parametrización",
  OTRO: "Otro",
};

function normalizeCode(input: unknown): string {
  return String(input ?? "").trim().toUpperCase();
}

// Normaliza nombres para comparar: minúsculas, sin acentos, espacios colapsados.
function normName(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

type Evidence = {
  filePath: string;
  fileName: string;
  mimeType: string;
  size: number;
};

type MatchUser = { id: string; name: string };

// Empareja el nombre escrito con un usuario de la mesa: primero coincidencia
// exacta (normalizada y única); si no, aproximada (todas las palabras del nombre
// escrito contenidas en el del usuario) siempre que sea única. Devuelve null si
// no hay match claro.
function matchUser(reporterName: string, users: MatchUser[]): MatchUser | null {
  const target = normName(reporterName);
  if (!target) return null;

  const exact = users.filter((u) => normName(u.name) === target);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;

  const tokens = target.split(" ").filter(Boolean);
  if (!tokens.length) return null;
  const approx = users.filter((u) => {
    const un = normName(u.name);
    return tokens.every((t) => un.includes(t));
  });
  return approx.length === 1 ? approx[0] : null;
}

// ---- Catálogo de novedades (memoizado en el proceso) ----
let _catalogCache: Awaited<ReturnType<typeof loadNovedadCatalog>> | null = null;
async function getCatalog() {
  if (!_catalogCache) _catalogCache = await loadNovedadCatalog();
  return _catalogCache;
}

function checkSecret(req: NextRequest): NextResponse | null {
  const expected = (process.env.NOVEDADES_INTAKE_SECRET || "").trim();
  if (!expected) {
    return NextResponse.json(
      { error: "Intake no configurado (falta NOVEDADES_INTAKE_SECRET)." },
      { status: 503 }
    );
  }
  const provided = req.headers.get("x-integration-secret") || "";
  if (provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

async function resolveTenant(tenantCodeRaw: unknown) {
  const code = normalizeCode(tenantCodeRaw) || DEFAULT_TENANT_CODE;
  return prisma.tenant.findUnique({ where: { code }, select: { id: true, code: true } });
}

// Busca el bus por código; si no aparece y el código es solo dígitos, prueba con
// el prefijo "K" (las placas internas son tipo K1402).
async function findBus(tenantId: string, codeRaw: unknown) {
  const code = normalizeCode(codeRaw);
  if (!code) return null;
  let bus = await prisma.bus.findFirst({
    where: { tenantId, code },
    select: { id: true, code: true, plate: true },
  });
  if (!bus && /^\d+$/.test(code)) {
    bus = await prisma.bus.findFirst({
      where: { tenantId, code: `K${code}` },
      select: { id: true, code: true, plate: true },
    });
  }
  return bus;
}

// ============================ GET (utilidades bot) ============================
export async function GET(req: NextRequest) {
  const unauth = checkSecret(req);
  if (unauth) return unauth;

  const url = new URL(req.url);
  const tenant = await resolveTenant(url.searchParams.get("tenantCode"));
  if (!tenant) return NextResponse.json({ error: "Tenant no encontrado." }, { status: 400 });

  // a0) Cámaras registradas de un bus (para elegir cuál cámara en el reporte).
  if (url.searchParams.get("cameras")) {
    const bus = await findBus(tenant.id, url.searchParams.get("busCode") || "");
    if (!bus) return NextResponse.json({ ok: true, cameras: [] });
    const eqs = await prisma.busEquipment.findMany({
      where: { busId: bus.id, active: true, equipmentType: { name: { contains: "mara", mode: "insensitive" } } },
      select: { id: true, serial: true, equipmentType: { select: { name: true } } },
      orderBy: { id: "asc" },
    });
    return NextResponse.json({
      ok: true,
      cameras: eqs.map((e) => ({ id: e.id, label: `${e.equipmentType?.name ?? "Cámara"}${e.serial ? ` (${e.serial})` : ""}` })),
    });
  }

  // a) Validar / resolver bus.
  const busCode = url.searchParams.get("busCode");
  if (busCode) {
    const bus = await findBus(tenant.id, busCode);
    if (!bus) return NextResponse.json({ ok: true, found: false });
    return NextResponse.json({
      ok: true,
      found: true,
      bus: { code: bus.code, plate: bus.plate ?? null },
    });
  }

  // a2) Emparejar un nombre con un usuario de la mesa (para que el bot decida
  // si necesita preguntar el nombre o ya identificó a la persona por Telegram).
  const matchName = url.searchParams.get("matchName");
  if (matchName) {
    const users = await prisma.user.findMany({
      where: { tenantId: tenant.id, active: true },
      select: { id: true, name: true },
    });
    const m = matchUser(matchName, users);
    return NextResponse.json({
      ok: true,
      matched: Boolean(m),
      user: m ? { id: m.id, name: m.name } : null,
    });
  }

  // b) Equipos que tienen fallas en el catálogo.
  if (url.searchParams.get("equipments")) {
    const cat = await getCatalog();
    const counts: Record<string, number> = {};
    for (const it of cat) counts[it.affectedEquipment] = (counts[it.affectedEquipment] || 0) + 1;
    const items = Object.entries(counts)
      .map(([code, count]) => ({ code, label: EQUIPMENT_LABELS[code] ?? code, count }))
      .sort((a, b) => b.count - a.count);
    return NextResponse.json({ ok: true, items });
  }

  // c) Fallas (código + novedad) de un equipo.
  const eq = url.searchParams.get("faults") || url.searchParams.get("equipment");
  if (eq) {
    const equipment = normalizeCode(eq);
    const cat = await getCatalog();
    const items = cat
      .filter((it) => it.affectedEquipment === equipment)
      .map((it) => ({ code: it.code, novelty: it.novelty }));
    return NextResponse.json({
      ok: true,
      equipment,
      label: EQUIPMENT_LABELS[equipment] ?? equipment,
      items,
    });
  }

  return NextResponse.json({
    ok: true,
    hint: "Usa ?busCode=, ?equipments=1 o ?faults=EQUIPO",
  });
}

// ================================ POST (crear) ===============================
export async function POST(req: NextRequest) {
  const unauth = checkSecret(req);
  if (unauth) return unauth;

  // Leer cuerpo: JSON simple o multipart (cuando incluye foto).
  const contentType = req.headers.get("content-type") ?? "";
  let body: any = {};
  let evidenceFile: File | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Formulario inválido." }, { status: 400 });
    const payload = form.get("payload");
    try {
      body = JSON.parse(typeof payload === "string" ? payload : "{}");
    } catch {
      return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
    }
    const f = form.get("evidence");
    if (f instanceof File && f.size > 0) evidenceFile = f;
  } else {
    body = await req.json().catch(() => ({}));
  }

  // Normalizar y validar.
  const reportedNovelty = String(body.reportedNovelty ?? body.description ?? "").trim();
  const catalogCode = normalizeCode(body.catalogCode);
  const affectedEquipmentRaw = String(body.affectedEquipment ?? "").trim().toUpperCase();
  const observations = String(body.observations ?? "").trim();
  const reporterName = String(body.reporterName ?? body?.reporter?.name ?? "").trim();
  const reporterPhone = String(body.reporterPhone ?? body?.reporter?.phone ?? "").trim();
  const telegram = body.telegram && typeof body.telegram === "object" ? body.telegram : null;
  const source = (String(body.source ?? "telegram").trim() || "telegram").slice(0, 40);

  if (reportedNovelty.length < 3) {
    return NextResponse.json({ error: "La novedad reportada es muy corta." }, { status: 400 });
  }

  const cameraLabel = String(body.cameraLabel ?? "").trim();
  const affectedEquipment = affectedEquipmentRaw || "NO_ESPECIFICADO";
  const affectedEquipmentLabel = (EQUIPMENT_LABELS[affectedEquipment] ?? affectedEquipment) + (cameraLabel ? ` — ${cameraLabel}` : "");

  const tenant = await resolveTenant(body.tenantCode);
  if (!tenant) {
    return NextResponse.json({ error: "Tenant no encontrado." }, { status: 400 });
  }

  const bus = await findBus(tenant.id, body.busCode);
  if (!bus) {
    return NextResponse.json(
      { error: `No encontré el bus con código ${normalizeCode(body.busCode)}.`, code: "BUS_NOT_FOUND" },
      { status: 404 }
    );
  }

  // Emparejar al usuario de la mesa por nombre.
  const users = await prisma.user.findMany({
    where: { tenantId: tenant.id, active: true },
    select: { id: true, name: true },
  });
  const matched = matchUser(reporterName, users);

  // Guardar evidencia (si vino). No bloquea el registro si falla.
  let evidence: Evidence | null = null;
  if (evidenceFile) {
    try {
      const filePath = await saveUpload(evidenceFile, `novedades/telegram/${bus.code}`, {
        fileNamePrefix: bus.code,
      });
      evidence = {
        filePath,
        fileName: evidenceFile.name || "evidencia",
        mimeType: evidenceFile.type || "application/octet-stream",
        size: evidenceFile.size,
      };
    } catch (e) {
      console.error("NOVEDAD_TELEGRAM_EVIDENCE_FAILED", e);
    }
  }

  const description = [
    catalogCode ? `Código novedad: ${catalogCode}` : null,
    `Equipo afectado: ${affectedEquipmentLabel}`,
    `Novedad reportada: ${reportedNovelty}`,
    observations ? `Observaciones: ${observations}` : null,
    reporterName || reporterPhone
      ? `Reportado por: ${[reporterName, reporterPhone].filter(Boolean).join(" · ")}`
      : null,
    matched ? `Usuario asociado: ${matched.name}` : "⚠️ No asociado a ningún usuario registrado",
    `Canal: ${source}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const created = await prisma.$transaction(
      async (tx) => {
        const { caseNo } = await nextNumbers(tx as any, tenant.id, { case: true });

        const noveltyCase = await tx.case.create({
          data: {
            tenantId: tenant.id,
            caseNo: caseNo!,
            type: "NOVEDAD",
            status: CaseStatus.NUEVO,
            priority: 3,
            title: `Novedad ${bus.code} - ${reportedNovelty}`.slice(0, 180),
            description,
            busId: bus.id,
          },
        });

        await tx.caseEvent.createMany({
          data: [
            {
              caseId: noveltyCase.id,
              type: CaseEventType.CREATED,
              message: "Novedad reportada por cliente (Telegram).",
              // El creador del caso se toma de meta.userId (ver /api/cases/creators).
              meta: {
                ...(matched ? { userId: matched.id } : {}),
                source,
                channel: "telegram",
                catalogCode: catalogCode || null,
                affectedEquipment,
                affectedEquipmentLabel,
                reportedNovelty,
                observations: observations || null,
                reporter: { name: reporterName || null, phone: reporterPhone || null },
                matchedUser: matched ? { id: matched.id, name: matched.name } : null,
                telegram: telegram || null,
                evidence,
              },
            },
            {
              caseId: noveltyCase.id,
              type: CaseEventType.COMMENT,
              message:
                "Hemos recibido su novedad y está pendiente de revisión por el equipo.",
              meta: { automated: true, source },
            },
            ...(matched
              ? []
              : [
                  {
                    caseId: noveltyCase.id,
                    type: CaseEventType.COMMENT,
                    message: `⚠️ Reportante "${reporterName || "sin nombre"}" no coincide con ningún usuario registrado de la mesa.`,
                    meta: { source, alert: "USER_NOT_MATCHED", reporterName: reporterName || null },
                  },
                ]),
            ...(evidence
              ? [
                  {
                    caseId: noveltyCase.id,
                    type: CaseEventType.COMMENT,
                    message: "Evidencia adjunta por el cliente.",
                    meta: { source, evidence },
                  },
                ]
              : []),
          ],
        });

        return noveltyCase;
      },
      { maxWait: 10000, timeout: 20000 }
    );

    // Auto-agrupar con otras novedades del mismo bus + misma novedad. Nunca debe
    // romper el registro.
    try {
      await autoGroupNovedad(prisma, { tenantId: tenant.id, caseId: created.id });
    } catch (e) {
      console.error("NOVEDAD_AUTOGROUP_FAILED", e);
    }

    // Detectar novedades IGUALES de OTRO usuario (alerta "ya reportada").
    let similar: Array<{ caseNo: number | null }> = [];
    try {
      similar = await findSimilarOtherCreator(prisma, { tenantId: tenant.id, caseId: created.id });
    } catch (e) {
      console.error("NOVEDAD_SIMILAR_FAILED", e);
    }
    const similarRefs = similar.map((s) => `CASO-${String(s.caseNo ?? "").padStart(3, "0")}`);
    const similarMessage = similar.length
      ? `Ya hay ${similar.length} novedad(es) igual(es) reportada(s) para el bus ${bus.code}: ${similarRefs.join(", ")}.`
      : null;

    // Avisar a quienes triagean. In-app por defecto; correo si se activa.
    const sendEmail =
      String(process.env.NOVEDADES_NOTIFY_EMAIL ?? "false").toLowerCase() === "true";
    const caseRef = `CASO-${String(created.caseNo ?? "").padStart(3, "0")}`;
    // Link al detalle del caso en la mesa (para seguimiento desde Telegram).
    const baseUrl = (process.env.APP_URL || process.env.NEXTAUTH_URL || "")
      .trim()
      .replace(/\/+$/, "");
    const caseUrl = baseUrl ? `${baseUrl}/cases/${created.id}` : null;
    await notifyTenantUsers({
      tenantId: tenant.id,
      roles: [Role.SUPERVISOR, Role.PLANNER],
      type: NotificationType.CASE_CREATED,
      title: `Nueva novedad de cliente (${bus.code})`,
      body: `${caseRef} · ${affectedEquipmentLabel} · ${reportedNovelty}${matched ? "" : " · ⚠️ sin usuario"}`.slice(
        0,
        240
      ),
      meta: { caseId: created.id, source, busCode: bus.code, matched: Boolean(matched) },
      sendEmail,
    });

    return NextResponse.json({
      ok: true,
      caseId: created.id,
      caseNo: created.caseNo ?? null,
      caseRef,
      caseUrl,
      bus: { code: bus.code, plate: bus.plate ?? null },
      catalogCode: catalogCode || null,
      equipmentLabel: affectedEquipmentLabel,
      reportedNovelty,
      associated: Boolean(matched),
      matchedUser: matched ? { id: matched.id, name: matched.name } : null,
      similar: similar.length ? { count: similar.length, caseRefs: similarRefs, message: similarMessage } : null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "No se pudo registrar la novedad.", detail: e?.message ?? String(e) },
      { status: 400 }
    );
  }
}
