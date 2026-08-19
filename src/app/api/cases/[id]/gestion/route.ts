export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Panel "Gestionar caso": un solo endpoint que orquesta la ejecución de un
// PREVENTIVO o CORRECTIVO sin pasear por los estados de la OT.
//
// En una transacción:
//  - responsable = persona que ejecutó (+ evento ASSIGNED)
//  - OT del cliente: se adjunta (WorkOrder.orderFile*) o se marca pendiente
//  - evidencias (fotos/videos/archivos, sin límite) -> comentario con adjuntos
//  - PREVENTIVO: resultado (sin/con novedad) + equipos con falla + observación;
//      "generar correctivo" crea el correctivo asociado (bus + equipos + causa + misma persona)
//  - CORRECTIVO: tipo (físico/firmware/software) + diagnóstico o causa raíz;
//      "cambio de equipo" actualiza la hoja de vida (BusEquipment) + histórico (BusLifecycleEvent)
//  - resolver: el caso pasa a RESUELTO
// Todo queda en el histórico del caso (CaseEvent). Pensado para try/catch.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveUpload, saveGeneratedUpload } from "@/lib/uploads";
import { nextNumbers } from "@/lib/tenant-sequence";
import { normalizeChecklistData, type ChecklistData } from "@/lib/preventive/checklist-template";
import { buildPreventiveCertificatePdf } from "@/lib/preventive/certificate-pdf";
import { getDocumentSignatures } from "@/lib/document-signatures";
import { CaseEventType, CaseStatus, CaseType, Role, WorkOrderStatus } from "@prisma/client";

const ALLOWED = new Set<Role>([Role.ADMIN, Role.BACKOFFICE, Role.PLANNER, Role.SUPERVISOR, Role.TECHNICIAN]);

type Attachment = { filePath: string; fileName: string; mimeType: string; size: number };

function str(v: FormDataEntryValue | null): string {
  return v === null || v === undefined ? "" : String(v).trim();
}
function normSerial(s: string | null | undefined): string {
  return String(s ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = (session.user as any).role as Role;
  if (!ALLOWED.has(role)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const tenantId = (session.user as any).tenantId as string;
  const userId = String((session.user as any).id ?? "");
  const caseId = String(ctx.params.id);

  const kase = await prisma.case.findFirst({
    where: { id: caseId, tenantId, type: { in: [CaseType.PREVENTIVO, CaseType.CORRECTIVO] } },
    select: {
      id: true,
      type: true,
      status: true,
      caseNo: true,
      busId: true,
      assignedToId: true,
      assignedTo: { select: { name: true } },
      bus: { select: { id: true, code: true, plate: true } },
      busEquipment: { select: { id: true } },
      workOrder: { select: { id: true } },
      preventiveChecklist: { select: { executedByName: true, aperturaByName: true, cierreByName: true } },
    },
  });
  if (!kase) return NextResponse.json({ error: "Caso no encontrado o no es preventivo/correctivo." }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Formulario inválido." }, { status: 400 });
  }

  const personaId = str(form.get("personaId"));
  const personaName = str(form.get("personaName"));
  const ot = str(form.get("ot")); // "si" | "pend" | ""
  const otNota = str(form.get("otNota"));
  const resolver = str(form.get("resolver")) === "1";

  const isPrev = kase.type === CaseType.PREVENTIVO;
  const tipoCorr = str(form.get("tipoCorr")); // fisico | firmware | software
  const needsOT = isPrev || (!isPrev && tipoCorr === "fisico");

  // Validaciones mínimas (las mismas que el panel).
  if (needsOT && !ot) {
    return NextResponse.json({ error: "Falta la OT del cliente: adjúntala o márcala como pendiente." }, { status: 400 });
  }

  // 1) Guardar archivos (fuera de la transacción). Si uno falla, no rompe todo: se omite.
  const subdir = `gestion/${kase.id}`;
  const skipped: string[] = [];
  let otAttachment: Attachment | null = null;
  const otFile = form.get("otFile");
  if (ot === "si" && otFile instanceof File && otFile.size > 0) {
    try {
      const p = await saveUpload(otFile, `${subdir}/ot`, { fileNamePrefix: kase.bus?.code ?? "OT" });
      otAttachment = { filePath: p, fileName: otFile.name || "orden_trabajo", mimeType: otFile.type || "application/pdf", size: otFile.size };
    } catch (e) {
      console.error("GESTION_OT_UPLOAD_FAILED", e);
      skipped.push(otFile.name || "OT");
    }
  }
  const evidencias: Attachment[] = [];
  for (const f of form.getAll("evidencias")) {
    if (f instanceof File && f.size > 0) {
      try {
        const p = await saveUpload(f, `${subdir}/evidencias`, { fileNamePrefix: kase.bus?.code ?? "EV" });
        evidencias.push({ filePath: p, fileName: f.name || "evidencia", mimeType: f.type || "application/octet-stream", size: f.size });
      } catch (e) {
        console.error("GESTION_EVIDENCIA_UPLOAD_FAILED", e);
        skipped.push(f.name || "evidencia");
      }
    }
  }
  let serialPhoto: Attachment | null = null;
  const sp = form.get("serialFoto");
  if (sp instanceof File && sp.size > 0) {
    try {
      const p = await saveUpload(sp, `${subdir}/seriales`, { fileNamePrefix: kase.bus?.code ?? "SER" });
      serialPhoto = { filePath: p, fileName: sp.name || "serial", mimeType: sp.type || "image/jpeg", size: sp.size };
    } catch (e) {
      console.error("GESTION_SERIAL_UPLOAD_FAILED", e);
      skipped.push(sp.name || "serial");
    }
  }

  // Checklist del preventivo: JSON + fotos por ítem (field: item_photo::sección::ítem).
  let checklistData: ChecklistData | null = null;
  if (isPrev) {
    const rawChecklist = str(form.get("checklist"));
    if (rawChecklist) {
      try {
        checklistData = normalizeChecklistData(JSON.parse(rawChecklist));
      } catch {
        checklistData = null;
      }
    }
    if (checklistData) {
      for (const [key, val] of form.entries()) {
        if (!key.startsWith("item_photo::")) continue;
        if (!(val instanceof File) || val.size === 0) continue;
        const [sid, iid] = key.slice("item_photo::".length).split("::");
        if (!sid || !iid) continue;
        try {
          const p = await saveUpload(val, `${subdir}/checklist`, { fileNamePrefix: kase.bus?.code ?? "CHK" });
          if (!checklistData.items[sid]) checklistData.items[sid] = {};
          checklistData.items[sid][iid] = {
            ...checklistData.items[sid][iid],
            photo: { filePath: p, fileName: val.name || "foto", mimeType: val.type || "image/jpeg", size: val.size },
          };
        } catch (e) {
          console.error("GESTION_CHECKLIST_PHOTO_FAILED", e);
          skipped.push(val.name || "foto checklist");
        }
      }
    }
  }

  // Persona que ejecutó (responsable).
  let persona: { id: string; name: string } | null = null;
  if (personaId) {
    const u = await prisma.user.findFirst({ where: { id: personaId, tenantId }, select: { id: true, name: true } });
    if (u) persona = u;
  }

  // Datos del flujo.
  const resultado = str(form.get("resultado")); // sin | con
  const observacion = str(form.get("observacion"));
  const generarCorrectivo = str(form.get("generarCorrectivo")) === "1";
  let equipos: Array<{ id: string; name: string }> = [];
  try {
    const raw = JSON.parse(str(form.get("equipos")) || "[]");
    if (Array.isArray(raw)) equipos = raw.filter((e) => e && e.id).map((e) => ({ id: String(e.id), name: String(e.name ?? "") }));
  } catch {}

  const diagnostico = str(form.get("diagnostico"));
  const causa = str(form.get("causa"));
  const causaLibre = str(form.get("causaLibre"));
  const cambio = str(form.get("cambio")) === "1";
  const cEquipoId = str(form.get("cEquipoId"));
  const cEquipoName = str(form.get("cEquipoName"));
  const cAnt = str(form.get("cAnt"));
  const cNue = str(form.get("cNue"));
  const cMM = str(form.get("cMM"));

  if (!isPrev && cambio && !cNue) {
    return NextResponse.json({ error: "Indica el serial del equipo nuevo para actualizar la hoja de vida." }, { status: 400 });
  }

  const result: any = { ok: true, skipped };

  try {
    await prisma.$transaction(async (tx) => {
      // a) Responsable
      if (persona && kase.assignedToId !== persona.id) {
        await tx.case.update({ where: { id: kase.id }, data: { assignedToId: persona.id } });
        await tx.caseEvent.create({
          data: { caseId: kase.id, type: CaseEventType.ASSIGNED, message: `Responsable del caso: ${persona.name}`, meta: { assignedToId: persona.id, by: userId, source: "gestion" } },
        });
      }

      // b) OT del cliente
      if (needsOT && ot === "si" && otAttachment) {
        let woId = kase.workOrder?.id ?? null;
        if (!woId) {
          const { workOrderNo } = await nextNumbers(tx as any, tenantId, { workOrder: true });
          const wo = await tx.workOrder.create({
            data: { tenantId, workOrderNo: workOrderNo ?? null, caseId: kase.id, status: WorkOrderStatus.EN_CAMPO },
          });
          woId = wo.id;
        }
        await tx.workOrder.update({
          where: { id: woId },
          data: {
            orderFilePath: otAttachment.filePath,
            orderFileName: `${kase.bus?.code ? kase.bus.code + "_" : ""}${otAttachment.fileName}`,
            orderFileMimeType: otAttachment.mimeType,
            orderFileSize: otAttachment.size,
            orderFileUpdatedAt: new Date(),
          },
        });
        await tx.caseEvent.create({
          data: { caseId: kase.id, type: CaseEventType.COMMENT, message: `OT del cliente adjuntada: ${otAttachment.fileName}`, meta: { by: userId, kind: "WORK_ORDER_FILE", filePath: otAttachment.filePath, workOrderId: woId } },
        });
      } else if (needsOT && ot === "pend") {
        await tx.caseEvent.create({
          data: { caseId: kase.id, type: CaseEventType.COMMENT, message: `OT del cliente pendiente por cargar${otNota ? `: ${otNota}` : ""}`, meta: { by: userId, kind: "OT_PENDIENTE", otPendiente: true, nota: otNota || null } },
        });
      }

      // c) Evidencias
      if (evidencias.length) {
        await tx.caseEvent.create({
          data: { caseId: kase.id, type: CaseEventType.COMMENT, message: `${evidencias.length} evidencia(s) cargada(s)`, meta: { userId, manualComment: true, attachments: evidencias, source: "gestion" } },
        });
      }

      // d) Flujo PREVENTIVO
      if (isPrev) {
        // Guardar/actualizar el checklist estructurado (borrador o completado).
        if (checklistData) {
          await tx.casePreventiveChecklist.upsert({
            where: { caseId: kase.id },
            create: {
              caseId: kase.id,
              status: resolver ? "completed" : "draft",
              data: checklistData as any,
              executedById: persona?.id ?? null,
              executedByName: persona?.name ?? null,
              executedAt: resolver ? new Date() : null,
            },
            update: {
              status: resolver ? "completed" : "draft",
              data: checklistData as any,
              ...(persona ? { executedById: persona.id, executedByName: persona.name } : {}),
              ...(resolver ? { executedAt: new Date() } : {}),
            },
          });
        }

        if (resultado) {
          const eqTxt = equipos.map((e) => e.name).filter(Boolean).join(", ");
          await tx.caseEvent.create({
            data: {
              caseId: kase.id,
              type: CaseEventType.COMMENT,
              message: resultado === "con" ? `Preventivo con novedad de falla${eqTxt ? ` — equipos: ${eqTxt}` : ""}` : "Preventivo sin novedad",
              meta: { by: userId, source: "gestion", resultado, equipos, observacion: observacion || null },
            },
          });
          if (resultado === "con" && equipos.length) {
            await tx.caseEquipment.createMany({
              data: equipos.map((e) => ({ caseId: kase.id, busEquipmentId: e.id })),
              skipDuplicates: true,
            });
          }
        }

        if (generarCorrectivo) {
          const eqTxt = equipos.map((e) => e.name).filter(Boolean).join(", ");
          const nums = await nextNumbers(tx as any, tenantId, { case: true, workOrder: true });
          const corr = await tx.case.create({
            data: {
              tenantId,
              caseNo: nums.caseNo ?? null,
              type: CaseType.CORRECTIVO,
              status: CaseStatus.OT_ASIGNADA,
              priority: 3,
              title: `Correctivo de preventivo CASO-${kase.caseNo ?? ""} (${kase.bus?.code ?? ""})`.trim(),
              description: [`Generado desde el preventivo CASO-${kase.caseNo ?? ""}.`, eqTxt ? `Equipos: ${eqTxt}` : null, observacion ? `Observación: ${observacion}` : null].filter(Boolean).join("\n"),
              busId: kase.busId,
              busEquipmentId: equipos[0]?.id ?? kase.busEquipment?.id ?? null,
              assignedToId: persona?.id ?? kase.assignedToId ?? null,
            },
          });
          if (equipos.length) {
            await tx.caseEquipment.createMany({ data: equipos.map((e) => ({ caseId: corr.id, busEquipmentId: e.id })), skipDuplicates: true });
          }
          const woc = await tx.workOrder.create({
            data: { tenantId, workOrderNo: nums.workOrderNo ?? null, caseId: corr.id, status: WorkOrderStatus.CREADA, assignedToId: persona?.id ?? null },
          });
          await tx.caseEvent.createMany({
            data: [
              { caseId: corr.id, type: CaseEventType.CREATED, message: `Correctivo generado desde preventivo CASO-${kase.caseNo ?? ""}.`, meta: { userId, sourceCaseId: kase.id, sourceCaseNo: kase.caseNo, manual: true, equipos } },
              { caseId: kase.id, type: CaseEventType.COMMENT, message: `Se generó correctivo asociado CASO-${corr.caseNo ?? ""}.`, meta: { by: userId, generatedCaseId: corr.id, workOrderId: woc.id } },
            ],
          });
          result.correctivoId = corr.id;
          result.correctivoCaseNo = corr.caseNo;
        }
      }

      // e) Flujo CORRECTIVO
      if (!isPrev) {
        const partes: string[] = [];
        if (tipoCorr) partes.push(`Tipo: correctivo ${tipoCorr}`);
        if (tipoCorr === "fisico" && diagnostico) partes.push(`Diagnóstico/solución: ${diagnostico}`);
        if ((tipoCorr === "firmware" || tipoCorr === "software") && causa) partes.push(`Causa raíz: ${causa}${causaLibre ? ` — ${causaLibre}` : ""}`);
        if (partes.length) {
          await tx.caseEvent.create({
            data: { caseId: kase.id, type: CaseEventType.COMMENT, message: partes.join(" · "), meta: { by: userId, source: "gestion", tipoCorr, diagnostico: diagnostico || null, causa: causa || null, causaLibre: causaLibre || null } },
          });
        }

        if (cambio) {
          const targetId = cEquipoId || kase.busEquipment?.id || null;
          if (targetId) {
            const current = await tx.busEquipment.findFirst({
              where: { id: targetId, busId: kase.busId },
              select: { id: true, serial: true, equipmentType: { select: { name: true } } },
            });
            if (current) {
              await tx.busEquipment.update({
                where: { id: current.id },
                data: { serial: cNue || undefined, ...(cMM ? { model: cMM } : {}) },
              });
              if (normSerial(cNue) !== normSerial(current.serial)) {
                await tx.busLifecycleEvent.create({
                  data: {
                    busId: kase.busId,
                    busEquipmentId: current.id,
                    caseId: kase.id,
                    workOrderId: kase.workOrder?.id ?? null,
                    eventType: "SERIAL_CHANGED",
                    summary: `${current.equipmentType?.name ?? cEquipoName ?? "Equipo"}: ${current.serial ?? "Sin serial"} -> ${cNue}`,
                  },
                });
              }
              result.hojaVidaActualizada = true;
            }
          }
          await tx.caseEvent.create({
            data: {
              caseId: kase.id,
              type: CaseEventType.COMMENT,
              message: `Cambio de equipo: ${cEquipoName || "equipo"} — serial ${cAnt || "?"} → ${cNue}`,
              meta: { by: userId, source: "gestion", cambioEquipo: true, equipoId: cEquipoId || kase.busEquipment?.id || null, serialAnterior: cAnt || null, serialNuevo: cNue, marcaModelo: cMM || null, ...(serialPhoto ? { attachments: [serialPhoto], manualComment: true } : {}) },
            },
          });
        }
      }

      // f) Estado del caso
      if (resolver) {
        if (kase.status !== CaseStatus.CERRADO) {
          await tx.case.update({ where: { id: kase.id }, data: { status: CaseStatus.CERRADO } });
          await tx.caseEvent.create({
            data: { caseId: kase.id, type: CaseEventType.STATUS_CHANGE, message: "Caso cerrado desde Gestionar caso.", meta: { by: userId, source: "gestion" } },
          });
        }
      } else if (kase.status === CaseStatus.NUEVO) {
        await tx.case.update({ where: { id: kase.id }, data: { status: CaseStatus.EN_EJECUCION } });
        await tx.caseEvent.create({
          data: { caseId: kase.id, type: CaseEventType.STATUS_CHANGE, message: "Caso en ejecución.", meta: { by: userId, source: "gestion" } },
        });
      }
    }, { maxWait: 10000, timeout: 30000 });
  } catch (e: any) {
    console.error("GESTION_CASO_FAILED", e);
    return NextResponse.json({ error: "No se pudo guardar la gestión.", detail: e?.message ?? String(e) }, { status: 400 });
  }

  // Certificado del preventivo: se genera al RESOLVER (fuera de la transacción
  // para no alargarla) y se adjunta al histórico del caso como evidencia.
  if (isPrev && resolver && checklistData) {
    try {
      const bytes = await buildPreventiveCertificatePdf({
        caseNo: kase.caseNo ?? null,
        busCode: kase.bus?.code ?? null,
        busPlate: kase.bus?.plate ?? null,
        responsableName:
          persona?.name ??
          kase.preventiveChecklist?.executedByName ??
          kase.preventiveChecklist?.aperturaByName ??
          kase.assignedTo?.name ??
          null,
        executedAt: new Date(),
        data: checklistData,
        evidencias: evidencias.map((e) => e.fileName),
        signatures: await getDocumentSignatures(tenantId),
      });
      const fileName = `${kase.bus?.code ? kase.bus.code + "_" : ""}certificado_preventivo.pdf`;
      const relPath = await saveGeneratedUpload(
        `${subdir}/certificado/${Date.now()}_${fileName}`,
        bytes,
        { originalName: fileName, mimeType: "application/pdf" }
      );
      await prisma.caseEvent.create({
        data: {
          caseId: kase.id,
          type: CaseEventType.COMMENT,
          message: "Certificado de mantenimiento preventivo generado.",
          meta: {
            userId,
            manualComment: true,
            source: "gestion",
            kind: "CERTIFICADO_PREVENTIVO",
            attachments: [{ filePath: relPath, fileName, mimeType: "application/pdf", size: bytes.length }],
          },
        },
      });
      result.certificado = true;
    } catch (e) {
      console.error("GESTION_CERTIFICADO_FAILED", e);
      result.certificado = false;
    }
  }

  return NextResponse.json(result);
}
