// src/app/api/integrations/preventivo-bot/route.ts
//
// Backend del BOT DE CARGA de preventivos (Telegram). Un técnico registrado
// manda el código de un bus, el bot crea/encuentra el preventivo del mes y el
// técnico va subiendo evidencias (capturas), voltajes, checks, hallazgos, y las
// horas de inicio/fin. Al "fin" se cierra el caso y se genera el certificado.
//
// POST con { action, ... } (JSON) o multipart (action=upload + file).
// Auth: header x-integration-secret == NOVEDADES_INTAKE_SECRET.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { saveUpload, saveGeneratedUpload } from "@/lib/uploads";
import { nextNumbers } from "@/lib/tenant-sequence";
import {
  PREVENTIVE_CHECKLIST,
  TIPO_NOVEDAD_SEVERITY,
  emptyChecklistData,
  normalizeChecklistData,
  summarizeChecklist,
  type ChecklistData,
  type CheckState,
  type Severity,
  type TipoNovedad,
} from "@/lib/preventive/checklist-template";
import { buildPreventiveCertificatePdf } from "@/lib/preventive/certificate-pdf";
import { maybeAutoCloseLinkedNovedad } from "@/lib/novedades/auto-close";
import { CaseEventType, CaseStatus, CaseType, WorkOrderStatus } from "@prisma/client";

const DEFAULT_TENANT_CODE = (process.env.NOVEDADES_TENANT_CODE || process.env.TENANT_CODE || "CAPITALBUS")
  .trim()
  .toUpperCase();

function badSecret(req: NextRequest): boolean {
  const expected = (process.env.NOVEDADES_INTAKE_SECRET || "").trim();
  if (!expected) return true;
  return (req.headers.get("x-integration-secret") || "") !== expected;
}

async function getTenantId(tenantCode?: string): Promise<string | null> {
  const code = String(tenantCode || DEFAULT_TENANT_CODE).trim().toUpperCase();
  const t = await prisma.tenant.findUnique({ where: { code }, select: { id: true } });
  return t?.id ?? null;
}

async function findBus(tenantId: string, codeRaw: unknown) {
  const code = String(codeRaw ?? "").trim();
  if (!code) return null;
  let bus = await prisma.bus.findFirst({
    where: { tenantId, code: { equals: code, mode: "insensitive" } },
    select: { id: true, code: true, plate: true },
  });
  if (!bus && /^\d+$/.test(code)) {
    bus = await prisma.bus.findFirst({
      where: { tenantId, code: { equals: `K${code}`, mode: "insensitive" } },
      select: { id: true, code: true, plate: true },
    });
  }
  return bus;
}

async function getUserByChat(tenantId: string, chatId: string) {
  const id = String(chatId || "").trim();
  if (!id) return null;
  return prisma.user.findFirst({
    where: { tenantId, telegramChatId: id, active: true },
    select: { id: true, name: true },
  });
}

function hhmmBogota(d = new Date()): string {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

const CAPTURAS = PREVENTIVE_CHECKLIST.find((s) => s.id === "capturas");
const ELECTRICO = PREVENTIVE_CHECKLIST.find((s) => s.id === "electrico");
const CHECK_SECTIONS = PREVENTIVE_CHECKLIST.filter((s) => s.items.some((it) => it.type === "check"));

// Estado compacto que consume el bot para armar mensajes/teclados.
function buildStatus(kase: any, data: ChecklistData) {
  const s = summarizeChecklist(data);
  const captures = (CAPTURAS?.items ?? []).map((it) => ({
    id: it.id,
    label: it.label,
    done: Boolean(data.items.capturas?.[it.id]?.photo?.filePath),
  }));
  return {
    caseId: kase.id,
    caseNo: kase.caseNo ?? null,
    ref: `CASO-${String(kase.caseNo ?? "").padStart(3, "0")}`,
    status: kase.status,
    busCode: kase.bus?.code ?? null,
    busPlate: kase.bus?.plate ?? null,
    resumen: { ok: s.okCount, hallazgo: s.hallazgosTotal, pendientes: s.pendientes, aplicables: s.applicable, hallazgos: s.hallazgos },
    captures,
    capturesDone: captures.filter((c) => c.done).length,
    capturesTotal: captures.length,
    dias: String(data.items.identificacion?.diasGrabacion?.value ?? "").trim(),
    otCapital: String(data.items.identificacion?.otCapital?.value ?? "").trim(),
    voltajes: (ELECTRICO?.items ?? []).map((it) => ({ id: it.id, label: it.label, value: String(data.items.electrico?.[it.id]?.value ?? "").trim() })),
    checkSections: CHECK_SECTIONS.map((s) => ({
      id: s.id,
      title: s.title,
      items: s.items.filter((it) => it.type === "check").map((it) => ({ id: it.id, label: it.label, estado: data.items[s.id]?.[it.id]?.estado ?? null })),
    })),
    hallazgos: data.cierre.hallazgos.map((h) => ({ severity: h.severity, equipo: h.equipo, tipoNovedad: h.tipoNovedad ?? null, cambioEquipo: Boolean(h.cambioEquipo), descripcion: h.descripcion })),
    busEquipos: (kase.busEquipos ?? []) as Array<{ id: string; name: string }>,
    inicio: kase.preventiveChecklist?.aperturaAt ? new Date(kase.preventiveChecklist.aperturaAt).toISOString() : null,
    aperturaBy: kase.preventiveChecklist?.aperturaByName ?? null,
    fin: kase.preventiveChecklist?.cierreAt ? new Date(kase.preventiveChecklist.cierreAt).toISOString() : null,
    cierreBy: kase.preventiveChecklist?.cierreByName ?? null,
  };
}

async function loadCaseForChecklist(tenantId: string, caseId: string) {
  const kase = await prisma.case.findFirst({
    where: { id: caseId, tenantId, type: CaseType.PREVENTIVO },
    select: {
      id: true,
      caseNo: true,
      status: true,
      busId: true,
      bus: { select: { id: true, code: true, plate: true } },
      preventiveChecklist: true,
    },
  });
  if (!kase) return null;
  const equipos = await prisma.busEquipment.findMany({
    where: { busId: kase.busId, active: true },
    select: { id: true, serial: true, equipmentType: { select: { name: true } } },
    orderBy: { id: "asc" },
  });
  (kase as any).busEquipos = equipos.map((e) => ({ id: e.id, name: `${e.equipmentType?.name ?? "Equipo"}${e.serial ? ` (${e.serial})` : ""}` }));
  return kase;
}

function dataOf(kase: any): ChecklistData {
  return normalizeChecklistData(kase?.preventiveChecklist?.data);
}

async function saveData(caseId: string, data: ChecklistData) {
  await prisma.casePreventiveChecklist.update({ where: { caseId }, data: { data: data as any } });
}

export async function POST(req: NextRequest) {
  if (badSecret(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const ct = req.headers.get("content-type") || "";
  let body: any = {};
  let file: File | null = null;
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ ok: false, error: "Formulario inválido" }, { status: 400 });
    for (const [k, v] of form.entries()) {
      if (v instanceof File) file = v;
      else body[k] = v;
    }
  } else {
    body = await req.json().catch(() => ({}));
  }

  const action = String(body.action || "").trim();
  const chatId = String(body.chatId || "").trim();
  const tenantId = await getTenantId(body.tenantCode);
  if (!tenantId) return NextResponse.json({ ok: false, error: "Tenant no encontrado" }, { status: 400 });

  try {
    // ----- registro / identidad -----
    if (action === "whoami") {
      const user = await getUserByChat(tenantId, chatId);
      return NextResponse.json({ ok: true, user: user ?? null });
    }
    if (action === "register") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!email) return NextResponse.json({ ok: true, error: "Falta el correo." });
      const user = await prisma.user.findFirst({ where: { tenantId, email: { equals: email, mode: "insensitive" }, active: true }, select: { id: true, name: true } });
      if (!user) return NextResponse.json({ ok: true, error: "No encontré un técnico con ese correo. Verifica con el administrador." });
      // libera el chat de cualquier otro usuario y lo asigna a este
      await prisma.user.updateMany({ where: { tenantId, telegramChatId: chatId }, data: { telegramChatId: null } });
      await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: chatId } });
      return NextResponse.json({ ok: true, user });
    }

    // A partir de aquí se requiere técnico registrado.
    const user = await getUserByChat(tenantId, chatId);
    if (!user) return NextResponse.json({ ok: true, needRegister: true });

    // ----- iniciar/encontrar el preventivo del mes por bus -----
    if (action === "start") {
      const bus = await findBus(tenantId, body.busCode);
      if (!bus) return NextResponse.json({ ok: true, found: false });
      // Reusar el preventivo ABIERTO más reciente del bus; si no hay, crear uno.
      let kase = await prisma.case.findFirst({
        where: { tenantId, busId: bus.id, type: CaseType.PREVENTIVO, status: { not: CaseStatus.CERRADO } },
        orderBy: { createdAt: "desc" },
        select: { id: true, caseNo: true, status: true, busId: true, bus: { select: { id: true, code: true, plate: true } }, preventiveChecklist: true },
      });
      let creado = false;
      if (!kase) {
        const nums = await nextNumbers(prisma as any, tenantId, { case: true });
        const mes = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", month: "long", year: "numeric" }).format(new Date());
        const created = await prisma.case.create({
          data: {
            tenantId,
            caseNo: nums.caseNo ?? null,
            type: CaseType.PREVENTIVO,
            status: CaseStatus.NUEVO,
            priority: 3,
            title: `Preventivo ${bus.code} — ${mes}`,
            description: `Preventivo del bus ${bus.code} (${mes}). Creado desde el bot de carga.`,
            busId: bus.id,
          },
          select: { id: true },
        });
        await prisma.casePreventiveChecklist.create({ data: { caseId: created.id, status: "draft", data: emptyChecklistData() as any } });
        await prisma.caseEvent.create({ data: { caseId: created.id, type: CaseEventType.CREATED, message: `Preventivo creado desde el bot por ${user.name}.`, meta: { source: "preventivo-bot", by: user.id } } });
        creado = true;
        kase = await loadCaseForChecklist(tenantId, created.id) as any;
      } else if (!kase.preventiveChecklist) {
        await prisma.casePreventiveChecklist.create({ data: { caseId: kase.id, status: "draft", data: emptyChecklistData() as any } });
      }
      const full = await loadCaseForChecklist(tenantId, kase!.id);
      return NextResponse.json({ ok: true, found: true, creado, status: buildStatus(full, dataOf(full)) });
    }

    // ----- revisar el bus (antes del preventivo): novedades reportadas abiertas -----
    if (action === "check-bus") {
      const bus = await findBus(tenantId, body.busCode);
      if (!bus) return NextResponse.json({ ok: true, found: false });
      const novedades = await prisma.case.findMany({
        where: { tenantId, busId: bus.id, type: CaseType.NOVEDAD, status: { not: CaseStatus.CERRADO } },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { id: true, caseNo: true, title: true, status: true },
      });
      return NextResponse.json({
        ok: true,
        found: true,
        bus: { code: bus.code, plate: bus.plate ?? null },
        novedades: novedades.map((n) => ({ id: n.id, ref: `CASO-${String(n.caseNo ?? "").padStart(3, "0")}`, title: n.title ?? "", status: n.status })),
      });
    }

    // ----- crear un correctivo ligado a una novedad reportada -----
    if (action === "crear-correctivo") {
      const novedadId = String(body.novedadId || "").trim();
      const nov = await prisma.case.findFirst({
        where: { id: novedadId, tenantId, type: CaseType.NOVEDAD },
        select: { id: true, caseNo: true, busId: true, title: true, bus: { select: { code: true } } },
      });
      if (!nov) return NextResponse.json({ ok: true, error: "No encuentro esa novedad." });
      const nums = await nextNumbers(prisma as any, tenantId, { case: true, workOrder: true });
      const novRef = `CASO-${String(nov.caseNo ?? "").padStart(3, "0")}`;
      const corr = await prisma.case.create({
        data: {
          tenantId,
          caseNo: nums.caseNo ?? null,
          type: CaseType.CORRECTIVO,
          status: CaseStatus.OT_ASIGNADA,
          priority: 3,
          title: `Correctivo de novedad ${novRef}${nov.bus?.code ? ` (${nov.bus.code})` : ""}`,
          description: `Generado desde el bot para atender la novedad ${novRef}.\n${nov.title ?? ""}`.trim(),
          busId: nov.busId,
          assignedToId: user.id,
        },
        select: { id: true, caseNo: true },
      });
      await prisma.workOrder.create({ data: { tenantId, workOrderNo: nums.workOrderNo ?? null, caseId: corr.id, status: WorkOrderStatus.CREADA, assignedToId: user.id } });
      const corrRef = `CASO-${String(corr.caseNo ?? "").padStart(3, "0")}`;
      await prisma.caseEvent.createMany({
        data: [
          { caseId: corr.id, type: CaseEventType.CREATED, message: `Correctivo generado desde el bot para la novedad ${novRef}.`, meta: { userId: user.id, sourceCaseId: nov.id, sourceCaseNo: nov.caseNo, manual: true, source: "preventivo-bot" } },
          { caseId: nov.id, type: CaseEventType.COMMENT, message: `Se generó correctivo ${corrRef} desde el bot.`, meta: { by: user.id, generatedCaseId: corr.id, source: "preventivo-bot" } },
        ],
      });
      return NextResponse.json({ ok: true, correctivoRef: corrRef, correctivoCaseId: corr.id, novedadRef: novRef });
    }

    // ----- correctivo desde el bot: cargar evidencia, nota y cerrar -----
    async function findCorrectivo(id: string) {
      return prisma.case.findFirst({ where: { id, tenantId, type: CaseType.CORRECTIVO }, select: { id: true, status: true, caseNo: true, bus: { select: { code: true } } } });
    }
    if (action === "correctivo-upload") {
      const corr = await findCorrectivo(String(body.caseId || "").trim());
      if (!corr) return NextResponse.json({ ok: true, error: "No encuentro el correctivo." });
      if (!file || file.size === 0) return NextResponse.json({ ok: true, error: "No llegó la foto." });
      const p = await saveUpload(file, `gestion/${corr.id}/evidencias`, { fileNamePrefix: corr.bus?.code ?? "EV" });
      await prisma.caseEvent.create({
        data: { caseId: corr.id, type: CaseEventType.COMMENT, message: "Evidencia cargada (bot).", meta: { userId: user.id, manualComment: true, source: "preventivo-bot", attachments: [{ filePath: p, fileName: file.name || "evidencia", mimeType: file.type || "image/jpeg", size: file.size }] } },
      });
      return NextResponse.json({ ok: true, saved: file.name || "evidencia" });
    }
    if (action === "correctivo-nota") {
      const corr = await findCorrectivo(String(body.caseId || "").trim());
      if (!corr) return NextResponse.json({ ok: true, error: "No encuentro el correctivo." });
      const nota = String(body.nota || "").trim();
      if (nota) await prisma.caseEvent.create({ data: { caseId: corr.id, type: CaseEventType.COMMENT, message: `Solución / diagnóstico: ${nota}`, meta: { by: user.id, source: "preventivo-bot", manualComment: true, solucion: nota } } });
      return NextResponse.json({ ok: true });
    }
    if (action === "correctivo-cerrar") {
      const corr = await findCorrectivo(String(body.caseId || "").trim());
      if (!corr) return NextResponse.json({ ok: true, error: "No encuentro el correctivo." });
      const corrRef = `CASO-${String(corr.caseNo ?? "").padStart(3, "0")}`;
      const diagnostico = String(body.diagnostico || "").trim();
      const solucion = String(body.solucion || "").trim();
      const observacion = String(body.observacion || "").trim();
      const fechaTexto = String(body.fecha || "").trim();
      let cerroNovedad = false;
      if (corr.status !== CaseStatus.CERRADO) {
        // Registro estandarizado del correctivo (diagnóstico + solución + observación + fecha realizada).
        const lineas: string[] = [];
        if (diagnostico) lineas.push(`Diagnóstico: ${diagnostico}`);
        if (solucion) lineas.push(`Solución: ${solucion}`);
        if (observacion) lineas.push(`Observación: ${observacion}`);
        lineas.push(`Realizado: ${fechaTexto || new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })}`);
        await prisma.caseEvent.create({
          data: {
            caseId: corr.id,
            type: CaseEventType.COMMENT,
            message: lineas.join("\n"),
            meta: { by: user.id, source: "preventivo-bot", manualComment: true, diagnostico, solucion, observacion, realizadoEn: fechaTexto || null },
          },
        });
        await prisma.case.update({ where: { id: corr.id }, data: { status: CaseStatus.CERRADO } });
        await prisma.caseEvent.create({ data: { caseId: corr.id, type: CaseEventType.STATUS_CHANGE, message: `Correctivo cerrado desde el bot por ${user.name}.`, meta: { by: user.id, source: "preventivo-bot" } } });
        cerroNovedad = await maybeAutoCloseLinkedNovedad(tenantId, corr.id, user.id).catch((e) => { console.error("PREVENTIVO_BOT_AUTOCLOSE_FAILED", e); return false; });
      }
      return NextResponse.json({ ok: true, ref: corrRef, cerroNovedad });
    }

    // Las demás acciones operan sobre un caso concreto.
    const caseId = String(body.caseId || "").trim();
    const kase = caseId ? await loadCaseForChecklist(tenantId, caseId) : null;
    if (!kase) return NextResponse.json({ ok: true, error: "No encuentro el preventivo. Manda el número del bus de nuevo." });
    if (kase.status === CaseStatus.CERRADO) return NextResponse.json({ ok: true, error: "Este preventivo ya está cerrado.", status: buildStatus(kase, dataOf(kase)) });

    if (action === "status") {
      return NextResponse.json({ ok: true, status: buildStatus(kase, dataOf(kase)) });
    }

    // ----- subir foto de una captura -----
    if (action === "upload") {
      const itemId = String(body.itemId || "").trim();
      const it = CAPTURAS?.items.find((x) => x.id === itemId);
      if (!it) return NextResponse.json({ ok: true, error: "Evidencia desconocida." });
      if (!file || file.size === 0) return NextResponse.json({ ok: true, error: "No llegó la foto." });
      const p = await saveUpload(file, `gestion/${kase.id}/checklist`, { fileNamePrefix: kase.bus?.code ?? "CHK" });
      const data = dataOf(kase);
      if (!data.items.capturas) data.items.capturas = {};
      data.items.capturas[itemId] = { ...data.items.capturas[itemId], photo: { filePath: p, fileName: file.name || `${itemId}.jpg`, mimeType: file.type || "image/jpeg", size: file.size } };
      await saveData(kase.id, data);
      const fresh = await loadCaseForChecklist(tenantId, kase.id);
      return NextResponse.json({ ok: true, saved: it.label, status: buildStatus(fresh, dataOf(fresh)) });
    }

    // ----- marcar checks / voltajes / textos (días, horas) -----
    if (action === "set") {
      const sectionId = String(body.sectionId || "").trim();
      const itemId = String(body.itemId || "").trim();
      const sec = PREVENTIVE_CHECKLIST.find((s) => s.id === sectionId);
      const it = sec?.items.find((x) => x.id === itemId);
      if (!it) return NextResponse.json({ ok: true, error: "Ítem desconocido." });
      const data = dataOf(kase);
      if (!data.items[sectionId]) data.items[sectionId] = {};
      if (it.type === "check") {
        const estado = String(body.estado || "").trim() as CheckState;
        if (!["ok", "hallazgo", "na"].includes(estado)) return NextResponse.json({ ok: true, error: "Estado inválido." });
        data.items[sectionId][itemId] = { ...data.items[sectionId][itemId], estado, ...(body.nota ? { nota: String(body.nota) } : {}) };
      } else {
        data.items[sectionId][itemId] = { ...data.items[sectionId][itemId], value: String(body.value ?? "").trim() };
      }
      await saveData(kase.id, data);
      const fresh = await loadCaseForChecklist(tenantId, kase.id);
      return NextResponse.json({ ok: true, status: buildStatus(fresh, dataOf(fresh)) });
    }

    // ----- agregar hallazgo de cierre -----
    if (action === "hallazgo") {
      const tipoNovedad = String(body.tipoNovedad || "").trim();
      if (!["sin_transmision", "falla_imagen", "afectado"].includes(tipoNovedad)) return NextResponse.json({ ok: true, error: "Tipo de novedad inválido." });
      const equipoId = String(body.equipoId || "").trim() || null;
      const equipoName = ((kase as any).busEquipos ?? []).find((e: any) => e.id === equipoId)?.name ?? String(body.equipo || "").trim();
      const cambioEquipo = Boolean(body.cambioEquipo);
      const severity = TIPO_NOVEDAD_SEVERITY[tipoNovedad as TipoNovedad];
      const data = dataOf(kase);
      data.cierre.hallazgos.push({ severity, equipoId, equipo: equipoName, tipoNovedad: tipoNovedad as TipoNovedad, cambioEquipo, descripcion: String(body.descripcion || "").trim() });
      data.cierre.requiereCorrectivo = true;
      await saveData(kase.id, data);
      const fresh = await loadCaseForChecklist(tenantId, kase.id);
      return NextResponse.json({ ok: true, status: buildStatus(fresh, dataOf(fresh)) });
    }

    // ----- inicio: registra técnico que abrió + hora -----
    if (action === "inicio") {
      const now = new Date();
      const data = dataOf(kase);
      if (!data.items.identificacion) data.items.identificacion = {};
      data.items.identificacion.horaInicio = { value: hhmmBogota(now) };
      await prisma.casePreventiveChecklist.update({
        where: { caseId: kase.id },
        data: { data: data as any, aperturaById: kase.preventiveChecklist?.aperturaById ?? user.id, aperturaByName: kase.preventiveChecklist?.aperturaByName ?? user.name, aperturaAt: kase.preventiveChecklist?.aperturaAt ?? now },
      });
      if (kase.status === CaseStatus.NUEVO) {
        await prisma.case.update({ where: { id: kase.id }, data: { status: CaseStatus.EN_EJECUCION, assignedToId: user.id } });
        await prisma.caseEvent.create({ data: { caseId: kase.id, type: CaseEventType.STATUS_CHANGE, message: `Inicio de gestión por ${user.name} (${hhmmBogota(now)}).`, meta: { source: "preventivo-bot", by: user.id } } });
      }
      const fresh = await loadCaseForChecklist(tenantId, kase.id);
      return NextResponse.json({ ok: true, status: buildStatus(fresh, dataOf(fresh)) });
    }

    // ----- fin: registra técnico que cerró + hora, cierra y genera certificado -----
    if (action === "fin") {
      const now = new Date();
      const data = dataOf(kase);
      if (!data.items.identificacion) data.items.identificacion = {};
      data.items.identificacion.horaFin = { value: hhmmBogota(now) };
      const summary = summarizeChecklist(data);
      const aperturaByName = kase.preventiveChecklist?.aperturaByName ?? user.name;

      await prisma.casePreventiveChecklist.update({
        where: { caseId: kase.id },
        data: {
          data: data as any,
          status: "completed",
          cierreById: user.id,
          cierreByName: user.name,
          cierreAt: now,
          executedById: kase.preventiveChecklist?.executedById ?? kase.preventiveChecklist?.aperturaById ?? user.id,
          executedByName: kase.preventiveChecklist?.executedByName ?? aperturaByName,
          executedAt: now,
        },
      });
      if (kase.status !== CaseStatus.CERRADO) {
        await prisma.case.update({ where: { id: kase.id }, data: { status: CaseStatus.CERRADO } });
        await prisma.caseEvent.create({ data: { caseId: kase.id, type: CaseEventType.STATUS_CHANGE, message: `Cierre de gestión por ${user.name} (${hhmmBogota(now)}). Caso cerrado desde el bot.`, meta: { source: "preventivo-bot", by: user.id } } });
      }

      // Certificado PDF adjunto al caso.
      let certificado = false;
      try {
        const bytes = await buildPreventiveCertificatePdf({
          caseNo: kase.caseNo ?? null,
          busCode: kase.bus?.code ?? null,
          busPlate: kase.bus?.plate ?? null,
          responsableName: user.name,
          aperturaName: aperturaByName,
          cierreName: user.name,
          executedAt: now,
          data,
          evidencias: [],
        });
        const fileName = `${kase.bus?.code ? kase.bus.code + "_" : ""}certificado_preventivo.pdf`;
        const relPath = await saveGeneratedUpload(`gestion/${kase.id}/certificado/${Date.now()}_${fileName}`, bytes, { originalName: fileName, mimeType: "application/pdf" });
        await prisma.caseEvent.create({
          data: {
            caseId: kase.id,
            type: CaseEventType.COMMENT,
            message: "Certificado de mantenimiento preventivo generado (bot).",
            meta: { userId: user.id, manualComment: true, source: "preventivo-bot", kind: "CERTIFICADO_PREVENTIVO", attachments: [{ filePath: relPath, fileName, mimeType: "application/pdf", size: bytes.length }] },
          },
        });
        certificado = true;
      } catch (e) {
        console.error("PREVENTIVO_BOT_CERT_FAILED", e);
      }

      const fresh = await loadCaseForChecklist(tenantId, kase.id);
      return NextResponse.json({ ok: true, cerrado: true, certificado, resumen: { ok: summary.okCount, hallazgo: summary.hallazgosTotal, pendientes: summary.pendientes }, status: buildStatus(fresh, dataOf(fresh)) });
    }

    return NextResponse.json({ ok: false, error: "Acción desconocida." }, { status: 400 });
  } catch (e: any) {
    console.error("PREVENTIVO_BOT_FAILED", action, e);
    return NextResponse.json({ ok: false, error: "Error interno.", detail: e?.message ?? String(e) }, { status: 500 });
  }
}
