// src/app/api/cases/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  CaseEventType,
  CaseStatus,
  NotificationType,
  Role,
  StsTicketChannel,
  StsTicketEventType,
  StsTicketSeverity,
  VideoRequestEventType,
  WorkOrderStatus,
} from "@prisma/client";
import { CASE_TYPE_REGISTRY } from "@/lib/case-type-registry";
import { VideoDownloadRequestSchema } from "@/lib/validators/video";
import { notifyTenantUsers } from "@/lib/notifications";
import { ensureTenantSequence } from "@/lib/tenant-sequence";
import { sendMail } from "@/lib/mailer";
import { buildVideoEmail } from "@/lib/video-emails";
import { saveUpload } from "@/lib/uploads";
import { CAPABILITIES } from "@/lib/capabilities";

function normalizePriority(input: any): number | undefined {
  if (input === null || input === undefined || input === "") return undefined;
  const n = typeof input === "number" ? input : Number(String(input));
  if (Number.isFinite(n)) return Math.max(1, Math.min(5, Math.trunc(n)));

  const s = String(input).toUpperCase();
  if (s === "ALTA") return 2;
  if (s === "MEDIA") return 3;
  if (s === "BAJA") return 4;
  return undefined;
}

function severityFromPriority(priority: number): StsTicketSeverity {
  if (priority <= 2) return StsTicketSeverity.HIGH;
  if (priority >= 4) return StsTicketSeverity.LOW;
  return StsTicketSeverity.MEDIUM;
}

type RawNovedadItem = {
  localKey?: unknown;
  busId?: unknown;
  busCode?: unknown;
  busPlate?: unknown;
  busEquipmentIds?: unknown;
  catalogCode?: unknown;
  affectedEquipment?: unknown;
  priority?: unknown;
  reportedNovelty?: unknown;
  observations?: unknown;
};

type NovedadItem = {
  localKey: string;
  busId: string;
  busCode: string | null;
  busPlate: string | null;
  busEquipmentIds: string[];
  catalogCode: string;
  affectedEquipment: string;
  priority: number;
  reportedNovelty: string;
  observations: string;
};

async function ensureAndTakeNumbers(
  tx: any,
  tenantId: string,
  counts: { caseCount: number; workOrderCount: number }
) {
  await ensureTenantSequence(tx as any, tenantId);
  await tx.$queryRaw`SELECT "tenantId" FROM "TenantSequence" WHERE "tenantId" = ${tenantId} FOR UPDATE`;

  let seq = await tx.tenantSequence.findUnique({
    where: { tenantId },
    select: { nextCaseNo: true, nextWorkOrderNo: true },
  });
  if (!seq) throw new Error("TenantSequence missing after upsert");

  const maxCase = await tx.case.aggregate({ where: { tenantId }, _max: { caseNo: true } });
  const maxCaseNo = maxCase._max.caseNo ?? 0;
  if (seq.nextCaseNo <= maxCaseNo) {
    await tx.tenantSequence.update({
      where: { tenantId },
      data: { nextCaseNo: maxCaseNo + 1 },
    });
    seq = { ...seq, nextCaseNo: maxCaseNo + 1 };
  }

  if (counts.workOrderCount > 0) {
    const maxWo = await tx.workOrder.aggregate({ where: { tenantId }, _max: { workOrderNo: true } });
    const maxWoNo = maxWo._max.workOrderNo ?? 0;
    if (seq.nextWorkOrderNo <= maxWoNo) {
      await tx.tenantSequence.update({
        where: { tenantId },
        data: { nextWorkOrderNo: maxWoNo + 1 },
      });
      seq = { ...seq, nextWorkOrderNo: maxWoNo + 1 };
    }
  }

  const caseNos = Array.from({ length: counts.caseCount }, (_, i) => seq.nextCaseNo + i);
  const workOrderNos = Array.from(
    { length: counts.workOrderCount },
    (_, i) => seq.nextWorkOrderNo + i
  );

  await tx.tenantSequence.update({
    where: { tenantId },
    data: {
      ...(counts.caseCount > 0 ? { nextCaseNo: { increment: counts.caseCount } } : {}),
      ...(counts.workOrderCount > 0
        ? { nextWorkOrderNo: { increment: counts.workOrderCount } }
        : {}),
    },
  });

  return { caseNos, workOrderNos };
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as Role;
  // ITEM 5: los técnicos también pueden crear casos (p. ej. al detectar una
  // novedad en patio). Mantiene ADMIN/BACKOFFICE como antes.
  if (role !== Role.ADMIN && role !== Role.BACKOFFICE && role !== Role.TECHNICIAN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const capabilities = ((session.user as any).capabilities as string[] | undefined) ?? [];
  const videosOnly =
    role === Role.BACKOFFICE && capabilities.includes(CAPABILITIES.VIDEOS_ONLY);

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;

  const contentType = req.headers.get("content-type") ?? "";
  let body: any = {};
  let multipart: FormData | null = null;
  if (contentType.includes("multipart/form-data")) {
    multipart = await req.formData().catch(() => null);
    const rawPayload = multipart?.get("payload");
    const payloadText = typeof rawPayload === "string" ? rawPayload : "{}";
    try {
      body = JSON.parse(payloadText || "{}");
    } catch {
      return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
    }
  } else {
    body = await req.json().catch(() => ({}));
  }

  const type = body.type as keyof typeof CASE_TYPE_REGISTRY;
  const cfg = CASE_TYPE_REGISTRY[type];
  if (!cfg) return NextResponse.json({ error: "Tipo de caso inválido" }, { status: 400 });
  if (videosOnly && cfg.type !== "SOLICITUD_DESCARGA_VIDEO") {
    return NextResponse.json(
      { error: "Tu perfil solo puede crear solicitudes de descarga de video." },
      { status: 403 }
    );
  }

  if (cfg.type === "NOVEDAD" && Array.isArray(body.novedadItems)) {
    const rows = (body.novedadItems as RawNovedadItem[]).map((row) => {
      const busId = String(row?.busId ?? "").trim();
      const busCode = row?.busCode ? String(row.busCode).trim() : null;
      const busPlate = row?.busPlate ? String(row.busPlate).trim() : null;
      const localKey = String(row?.localKey ?? "").trim() || `nvd-${busId}`;
      const catalogCode = String(row?.catalogCode ?? "").trim();
      const affectedEquipment = String(row?.affectedEquipment ?? "").trim();
      const reportedNovelty = String(row?.reportedNovelty ?? "").trim();
      const observations = String(row?.observations ?? "").trim();
      const rawEqIds = Array.isArray(row?.busEquipmentIds) ? row.busEquipmentIds : [];
      const busEquipmentIds = Array.from(
        new Set(rawEqIds.map((id) => String(id ?? "").trim()).filter(Boolean))
      );
      const priority = normalizePriority(row?.priority) ?? 3;

      return {
        localKey,
        busId,
        busCode,
        busPlate,
        busEquipmentIds,
        catalogCode,
        affectedEquipment,
        priority,
        reportedNovelty,
        observations,
      } as NovedadItem;
    });

    if (!rows.length) {
      return NextResponse.json(
        { error: "Debes reportar al menos una novedad con bus." },
        { status: 400 }
      );
    }

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (!row.busId) {
        return NextResponse.json(
          { error: `Bus requerido en la novedad #${i + 1}.` },
          { status: 400 }
        );
      }
      if (!row.affectedEquipment) {
        return NextResponse.json(
          { error: `Equipo afectado requerido en la novedad #${i + 1}.` },
          { status: 400 }
        );
      }
      if (!row.reportedNovelty || row.reportedNovelty.length < 3) {
        return NextResponse.json(
          { error: `Novedad reportada inválida en la novedad #${i + 1}.` },
          { status: 400 }
        );
      }
    }

    const uniqueBusIds = Array.from(new Set(rows.map((row) => row.busId)));
    const buses = await prisma.bus.findMany({
      where: { tenantId, id: { in: uniqueBusIds } },
      select: { id: true, code: true, plate: true },
    });
    const busById = new Map(buses.map((bus) => [bus.id, bus]));

    const missingBusIds = uniqueBusIds.filter((id) => !busById.has(id));
    if (missingBusIds.length) {
      return NextResponse.json(
        { error: "Uno o más buses de la novedad no existen en el tenant actual." },
        { status: 400 }
      );
    }

    const uniqueEquipmentIds = Array.from(new Set(rows.flatMap((row) => row.busEquipmentIds)));
    const equipments = await prisma.busEquipment.findMany({
      where: {
        id: { in: uniqueEquipmentIds },
        busId: { in: uniqueBusIds },
      },
      select: { id: true, busId: true },
    });
    const equipmentById = new Map(equipments.map((eq) => [eq.id, eq]));

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const invalidEq = row.busEquipmentIds.find((equipmentId) => {
        const equipment = equipmentById.get(equipmentId);
        return !equipment || equipment.busId !== row.busId;
      });
      if (invalidEq) {
        return NextResponse.json(
          { error: `Equipo inválido (${invalidEq}) en la novedad #${i + 1}.` },
          { status: 400 }
        );
      }
    }

    const correctiveCfg = CASE_TYPE_REGISTRY.CORRECTIVO;
    let stsComponentId: string | null = null;
    if (correctiveCfg.stsComponentCode) {
      const component = await prisma.stsComponent.findFirst({
        where: { tenantId, code: correctiveCfg.stsComponentCode },
        select: { id: true },
      });
      if (!component) {
        return NextResponse.json(
          { error: "Componente STS no configurado para generar tickets de correctivo." },
          { status: 400 }
        );
      }
      stsComponentId = component.id;
    }

    const uploadBatchKey = `novedades-${tenantId}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const evidenceByLocalKey = new Map<
      string,
      { filePath: string; fileName: string; mimeType: string; size: number }
    >();

    for (const row of rows) {
      const file = multipart?.get(`evidence:${row.localKey}`);
      if (!(file instanceof File) || file.size <= 0) continue;
      const bus = busById.get(row.busId)!;
      const filePath = await saveUpload(file, `novedades/${uploadBatchKey}/${bus.code}`, {
        fileNamePrefix: bus.code,
      });
      evidenceByLocalKey.set(row.localKey, {
        filePath,
        fileName: file.name || "evidencia",
        mimeType: file.type || "application/octet-stream",
        size: file.size,
      });
    }

    try {
      const created = await prisma.$transaction(
        async (tx) => {
          let batchRef: string | null = null;
          const out: Array<{
            batchRef: string;
            busCode: string;
            busPlate: string | null;
            reportedNovelty: string;
            affectedEquipment: string;
            noveltyCaseId: string;
            noveltyCaseNo: number | null;
            noveltyStatus: CaseStatus;
            correctiveCaseId: string;
            correctiveCaseNo: number | null;
            correctiveStatus: CaseStatus;
            workOrderId: string;
            workOrderNo: number | null;
            workOrderStatus: WorkOrderStatus;
            stsTicketId: string | null;
            stsTicketStatus: "OPEN" | null;
            evidencePath: string | null;
          }> = [];

          for (const row of rows) {
            const bus = busById.get(row.busId)!;
            const evidence = evidenceByLocalKey.get(row.localKey) ?? null;

            const noveltyNumbers = await ensureAndTakeNumbers(tx as any, tenantId, {
              caseCount: 1,
              workOrderCount: 0,
            });
            const noveltyCase = await tx.case.create({
              data: {
                tenantId,
                caseNo: noveltyNumbers.caseNos[0],
                type: "NOVEDAD",
                status: CaseStatus.NUEVO,
                priority: row.priority,
                title: `Novedad ${bus.code} - ${row.reportedNovelty}`,
                description: [
                  row.catalogCode ? `Código novedad: ${row.catalogCode}` : null,
                  `Equipo afectado: ${row.affectedEquipment}`,
                  `Novedad reportada: ${row.reportedNovelty}`,
                  row.observations ? `Observaciones: ${row.observations}` : null,
                ]
                  .filter(Boolean)
                  .join("\n"),
                busId: bus.id,
              },
            });

            if (!batchRef) {
              batchRef = `NVD-${String(noveltyCase.caseNo ?? 0).padStart(4, "0")}`;
            }

            const noveltyState = {
              batchRef,
              sourceCaseNo: noveltyCase.caseNo ?? null,
              catalogCode: row.catalogCode || null,
              affectedEquipment: row.affectedEquipment,
              reportedNovelty: row.reportedNovelty,
              observations: row.observations || null,
              evidence,
            };

            if (row.busEquipmentIds.length) {
              await tx.caseEquipment.createMany({
                data: row.busEquipmentIds.map((busEquipmentId) => ({
                  caseId: noveltyCase.id,
                  busEquipmentId,
                })),
                skipDuplicates: true,
              });
            }

            await tx.caseEvent.createMany({
              data: [
                {
                  caseId: noveltyCase.id,
                  type: CaseEventType.CREATED,
                  message: "Novedad reportada",
                  meta: { userId, noveltyState },
                },
                {
                  caseId: noveltyCase.id,
                  type: CaseEventType.COMMENT,
                  message:
                    "Hemos recibido su novedad y está pendiente su asignación de tickets.",
                  meta: { userId, automated: true, batchRef },
                },
                ...(evidence
                  ? [
                      {
                        caseId: noveltyCase.id,
                        type: CaseEventType.COMMENT,
                        message: "Evidencia de novedad cargada.",
                        meta: { userId, batchRef, evidence },
                      },
                    ]
                  : []),
              ],
            });

            const correctiveNumbers = await ensureAndTakeNumbers(tx as any, tenantId, {
              caseCount: 1,
              workOrderCount: 1,
            });
            const correctiveDescription = [
              row.catalogCode ? `Código novedad: ${row.catalogCode}` : null,
              `Equipo afectado: ${row.affectedEquipment}`,
              `Novedad reportada: ${row.reportedNovelty}`,
              row.observations ? `Observaciones: ${row.observations}` : null,
              `Generado automáticamente por novedad CASO-${noveltyCase.caseNo}.`,
            ]
              .filter(Boolean)
              .join("\n");

            const correctiveCase = await tx.case.create({
              data: {
                tenantId,
                caseNo: correctiveNumbers.caseNos[0],
                type: "CORRECTIVO",
                status: CaseStatus.OT_ASIGNADA,
                priority: row.priority,
                title: `Correctivo generado por novedad CASO-${noveltyCase.caseNo} (${bus.code})`,
                description: correctiveDescription,
                busId: bus.id,
                busEquipmentId: row.busEquipmentIds[0] ?? null,
              },
            });

            if (row.busEquipmentIds.length) {
              await tx.caseEquipment.createMany({
                data: row.busEquipmentIds.map((busEquipmentId) => ({
                  caseId: correctiveCase.id,
                  busEquipmentId,
                })),
                skipDuplicates: true,
              });
            }

            const workOrder = await tx.workOrder.create({
              data: {
                tenantId,
                workOrderNo: correctiveNumbers.workOrderNos[0],
                caseId: correctiveCase.id,
                status: WorkOrderStatus.EN_VALIDACION,
              },
            });

            await tx.caseEvent.createMany({
              data: [
                {
                  caseId: correctiveCase.id,
                  type: CaseEventType.CREATED,
                  message: `Correctivo generado por novedad CASO-${noveltyCase.caseNo}.`,
                  meta: {
                    userId,
                    sourceCaseId: noveltyCase.id,
                    sourceCaseNo: noveltyCase.caseNo,
                    noveltyState,
                  },
                },
                {
                  caseId: correctiveCase.id,
                  type: CaseEventType.STATUS_CHANGE,
                  message: "OT generada automáticamente en estado por validar coordinador.",
                  meta: { userId, workOrderId: workOrder.id, batchRef },
                },
                ...(evidence
                  ? [
                      {
                        caseId: correctiveCase.id,
                        type: CaseEventType.COMMENT,
                        message: "Evidencia de novedad asociada al correctivo.",
                        meta: { userId, batchRef, evidence },
                      },
                    ]
                  : []),
              ],
            });

            let stsTicketId: string | null = null;
            if (stsComponentId) {
              const stsTicket = await tx.stsTicket.create({
                data: {
                  tenantId,
                  caseId: correctiveCase.id,
                  componentId: stsComponentId,
                  severity: severityFromPriority(row.priority),
                  status: "OPEN",
                  channel: StsTicketChannel.OTHER,
                  description: correctiveCase.description,
                  openedAt: new Date(),
                },
              });
              stsTicketId = stsTicket.id;

              await tx.stsTicketEvent.create({
                data: {
                  ticketId: stsTicket.id,
                  type: StsTicketEventType.STATUS_CHANGE,
                  status: "OPEN",
                  message: "Ticket generado automáticamente desde novedad reportada.",
                  createdById: userId,
                },
              });

              await tx.caseEvent.create({
                data: {
                  caseId: correctiveCase.id,
                  type: CaseEventType.COMMENT,
                  message: "Ticket STS generado automáticamente.",
                  meta: { userId, stsTicketId: stsTicket.id, batchRef },
                },
              });
            }

            await tx.caseEvent.create({
              data: {
                caseId: noveltyCase.id,
                type: CaseEventType.COMMENT,
                message: `Su ticket ha sido generado: CASO-${correctiveCase.caseNo} / OT-${workOrder.workOrderNo}.`,
                meta: {
                  userId,
                  batchRef,
                  generatedCaseId: correctiveCase.id,
                  generatedWorkOrderId: workOrder.id,
                  stsTicketId,
                },
              },
            });

            out.push({
              batchRef,
              busCode: bus.code,
              busPlate: bus.plate ?? null,
              reportedNovelty: row.reportedNovelty,
              affectedEquipment: row.affectedEquipment,
              noveltyCaseId: noveltyCase.id,
              noveltyCaseNo: noveltyCase.caseNo ?? null,
              noveltyStatus: noveltyCase.status,
              correctiveCaseId: correctiveCase.id,
              correctiveCaseNo: correctiveCase.caseNo ?? null,
              correctiveStatus: correctiveCase.status,
              workOrderId: workOrder.id,
              workOrderNo: workOrder.workOrderNo ?? null,
              workOrderStatus: workOrder.status,
              stsTicketId,
              stsTicketStatus: stsTicketId ? "OPEN" : null,
              evidencePath: evidence?.filePath ?? null,
            });
          }

          return { batchRef: batchRef ?? "NVD-SIN-REF", items: out };
        },
        { maxWait: 10000, timeout: 30000 }
      );

      await notifyTenantUsers({
        tenantId,
        userIds: [userId],
        type: NotificationType.CASE_CREATED,
        title: `Hemos recibido su novedad (${created.batchRef})`,
        body: "Su novedad está pendiente de asignación de tickets.",
        meta: { kind: "NOVEDAD_BATCH", batchRef: created.batchRef, count: created.items.length },
        sendEmail: false,
      });

      const escapeHtml = (value: string) =>
        String(value ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");

      const lotRowsHtml = created.items
        .map((item) => {
          const busLabel = `${item.busCode}${item.busPlate ? ` (${item.busPlate})` : ""}`;
          const ticketLabel = item.stsTicketStatus ?? "Sin ticket";
          return `
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;vertical-align:top;">${escapeHtml(busLabel)}</td>
              <td style="padding:8px;border:1px solid #e5e7eb;vertical-align:top;">${escapeHtml(item.reportedNovelty)}</td>
              <td style="padding:8px;border:1px solid #e5e7eb;vertical-align:top;">CASO-${String(item.noveltyCaseNo ?? "").padStart(3, "0")} · ${escapeHtml(item.noveltyStatus)}</td>
              <td style="padding:8px;border:1px solid #e5e7eb;vertical-align:top;">CASO-${String(item.correctiveCaseNo ?? "").padStart(3, "0")} · ${escapeHtml(item.correctiveStatus)}</td>
              <td style="padding:8px;border:1px solid #e5e7eb;vertical-align:top;">OT-${String(item.workOrderNo ?? "").padStart(3, "0")} · ${escapeHtml(item.workOrderStatus)}</td>
              <td style="padding:8px;border:1px solid #e5e7eb;vertical-align:top;">${escapeHtml(ticketLabel)}</td>
            </tr>
          `;
        })
        .join("");

      const lotTableHtml = `
        <p style="margin:0 0 10px;font-size:14px;color:#374151;">
          ID ${escapeHtml(created.batchRef)}: ${created.items.length} buses reportados y ${created.items.length} tickets correctivos en validación.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;color:#111827;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:8px;border:1px solid #e5e7eb;text-align:left;">Bus</th>
              <th style="padding:8px;border:1px solid #e5e7eb;text-align:left;">Novedad reportada</th>
              <th style="padding:8px;border:1px solid #e5e7eb;text-align:left;">Caso novedad</th>
              <th style="padding:8px;border:1px solid #e5e7eb;text-align:left;">Correctivo</th>
              <th style="padding:8px;border:1px solid #e5e7eb;text-align:left;">OT</th>
              <th style="padding:8px;border:1px solid #e5e7eb;text-align:left;">Ticket STS</th>
            </tr>
          </thead>
          <tbody>${lotRowsHtml}</tbody>
        </table>
      `;

      const lotTableText = [
        `Novedades reportadas (${created.batchRef})`,
        `ID ${created.batchRef}: ${created.items.length} buses reportados y ${created.items.length} tickets correctivos en validación.`,
        ...created.items.map((item) => {
          const busLabel = `${item.busCode}${item.busPlate ? ` (${item.busPlate})` : ""}`;
          const ticketLabel = item.stsTicketStatus ?? "Sin ticket";
          return `${busLabel} | ${item.reportedNovelty} | Novedad CASO-${String(item.noveltyCaseNo ?? "").padStart(3, "0")} (${item.noveltyStatus}) | Correctivo CASO-${String(item.correctiveCaseNo ?? "").padStart(3, "0")} (${item.correctiveStatus}) | OT-${String(item.workOrderNo ?? "").padStart(3, "0")} (${item.workOrderStatus}) | ${ticketLabel}`;
        }),
      ].join("\n");

      await Promise.all(
        created.items.map((item) =>
          notifyTenantUsers({
            tenantId,
            userIds: [userId],
            type: NotificationType.CASE_ASSIGNED,
            title: `Su ticket ha sido generado (${item.busCode})`,
            body: `Lote ${created.batchRef} | Novedad CASO-${item.noveltyCaseNo} -> Correctivo CASO-${item.correctiveCaseNo} / OT-${item.workOrderNo}.`,
            meta: {
              batchRef: created.batchRef,
              noveltyCaseId: item.noveltyCaseId,
              correctiveCaseId: item.correctiveCaseId,
              workOrderId: item.workOrderId,
              stsTicketId: item.stsTicketId,
              evidencePath: item.evidencePath,
            },
            sendEmail: false,
          })
        )
      );

      await notifyTenantUsers({
        tenantId,
        // Destinatarios acotados: solo quienes asignan (pocos). Evita blast a ADMIN/BACKOFFICE.
        roles: [Role.SUPERVISOR, Role.PLANNER],
        type: NotificationType.CASE_CREATED,
        title: `Novedades reportadas (${created.batchRef})`,
        body: `ID ${created.batchRef}: ${created.items.length} buses reportados y ${created.items.length} tickets correctivos en validación.`,
        meta: { kind: "NOVEDAD_BATCH", batchRef: created.batchRef, count: created.items.length },
        sendEmail: true,
        emailBodyHtml: lotTableHtml,
        emailBodyText: lotTableText,
      });

      return NextResponse.json({
        ok: true,
        batchRef: created.batchRef,
        received: rows.length,
        createdNovedades: created.items.length,
        createdCorrectivos: created.items.length,
        items: created.items,
      });
    } catch (e: any) {
      return NextResponse.json(
        { error: "No se pudo registrar la novedad masiva", detail: e?.message ?? String(e) },
        { status: 400 }
      );
    }
  }

  const busId = String(body.busId ?? "").trim();
  if (!busId) return NextResponse.json({ error: "Selecciona un bus" }, { status: 400 });

  const rawEquipmentIds = Array.isArray(body.busEquipmentIds)
    ? body.busEquipmentIds
    : body.busEquipmentId
      ? [body.busEquipmentId]
      : [];
  const busEquipmentIds = rawEquipmentIds.map((id: any) => String(id)).filter(Boolean);
  const renewalEquipmentIds =
    cfg.type === "RENOVACION_TECNOLOGICA"
      ? (
          await prisma.busEquipment.findMany({
            where: { busId, active: true },
            select: { id: true },
          })
        ).map((e) => e.id)
      : [];
  const effectiveEquipmentIds =
    cfg.type === "RENOVACION_TECNOLOGICA" ? renewalEquipmentIds : busEquipmentIds;
  const busEquipmentId =
    cfg.type === "RENOVACION_TECNOLOGICA" ? null : effectiveEquipmentIds[0] ?? null;
  if (cfg.requiresEquipment && !effectiveEquipmentIds.length) {
    return NextResponse.json({ error: "Equipo del bus requerido para este tipo de caso" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();
  if (title.length < 3) return NextResponse.json({ error: "Título muy corto" }, { status: 400 });
  if (description.length < 5) return NextResponse.json({ error: "Descripción muy corta" }, { status: 400 });

  // Enlace opcional a una novedad de origen (convención meta.sourceCaseId).
  const fromNovedadRaw = String(body.fromNovedad ?? "").trim();
  let fromNovedadId: string | null = null;
  if (fromNovedadRaw && (cfg.type === "CORRECTIVO" || cfg.type === "PREVENTIVO")) {
    const novedad = await prisma.case.findFirst({
      where: { id: fromNovedadRaw, tenantId, type: "NOVEDAD" },
      select: { id: true },
    });
    fromNovedadId = novedad?.id ?? null;
  }

  const priority = normalizePriority(body.priority);
  const stsSeverity = cfg.stsComponentCode ? (body.stsSeverity as StsTicketSeverity) : null;
  if (cfg.stsComponentCode && (!stsSeverity || !Object.values(StsTicketSeverity).includes(stsSeverity))) {
    return NextResponse.json({ error: "Severidad STS requerida" }, { status: 400 });
  }

  // 1) Asegurar inline form
  if (cfg.hasInlineCreateForm && !body.videoDownloadRequest) {
    return NextResponse.json({ error: "Debes completar el formulario de video." }, { status: 400 });
  }

  // Validar + normalizar (fechas incluidas) con Zod
  const parsedVideo = cfg.hasInlineCreateForm
    ? VideoDownloadRequestSchema.safeParse(body.videoDownloadRequest)
    : null;

  if (cfg.hasInlineCreateForm && !parsedVideo?.success) {
    return NextResponse.json(
      { error: parsedVideo!.error.issues[0]?.message ?? "Formulario de video inválido" },
      { status: 400 }
    );
  }

  try {
    const splitByEquipment = cfg.type === "CORRECTIVO" && effectiveEquipmentIds.length > 1;
    const targets = splitByEquipment ? effectiveEquipmentIds : [busEquipmentId];
    const splitGroupKey = splitByEquipment
      ? `split-${tenantId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      : null;

    // Reservar consecutivos en transacción corta para evitar locks largos en el flujo principal
    const reserved = await prisma.$transaction(
      async (tx) => {
      await ensureTenantSequence(tx as any, tenantId);
      await tx.$queryRaw`SELECT "tenantId" FROM "TenantSequence" WHERE "tenantId" = ${tenantId} FOR UPDATE`;

      let seq = await tx.tenantSequence.findUnique({
        where: { tenantId },
        select: { nextCaseNo: true, nextWorkOrderNo: true },
      });
      if (!seq) throw new Error("TenantSequence missing after upsert");

      const maxCase = await tx.case.aggregate({ where: { tenantId }, _max: { caseNo: true } });
      const maxCaseNo = maxCase._max.caseNo ?? 0;
      if (seq.nextCaseNo <= maxCaseNo) {
        await tx.tenantSequence.update({
          where: { tenantId },
          data: { nextCaseNo: maxCaseNo + 1 },
        });
        seq = { ...seq, nextCaseNo: maxCaseNo + 1 };
      }

      if (cfg.requiresWorkOrder) {
        const maxWo = await tx.workOrder.aggregate({ where: { tenantId }, _max: { workOrderNo: true } });
        const maxWoNo = maxWo._max.workOrderNo ?? 0;
        if (seq.nextWorkOrderNo <= maxWoNo) {
          await tx.tenantSequence.update({
            where: { tenantId },
            data: { nextWorkOrderNo: maxWoNo + 1 },
          });
          seq = { ...seq, nextWorkOrderNo: maxWoNo + 1 };
        }
      }

      const caseNos = Array.from({ length: targets.length }, (_, i) => seq!.nextCaseNo + i);
      const workOrderNos = cfg.requiresWorkOrder
        ? Array.from({ length: targets.length }, (_, i) => seq!.nextWorkOrderNo + i)
        : [];

      await tx.tenantSequence.update({
        where: { tenantId },
        data: {
          nextCaseNo: { increment: targets.length },
          ...(cfg.requiresWorkOrder ? { nextWorkOrderNo: { increment: targets.length } } : {}),
        },
      });

      return { caseNos, workOrderNos };
      },
      { maxWait: 10000, timeout: 20000 }
    );

    const created = await prisma.$transaction(
      async (tx) => {
      const createdCases: any[] = [];
      const createdStsCases: Array<{ caseId: string; description: string }> = [];

      for (let i = 0; i < targets.length; i += 1) {
        const eqId = targets[i];
        const nums = {
          caseNo: reserved.caseNos[i],
          workOrderNo: cfg.requiresWorkOrder ? reserved.workOrderNos[i] : undefined,
        };

        const c = await tx.case.create({
          data: {
            tenantId,
            caseNo: nums.caseNo!,
            type: cfg.type,
            status: CaseStatus.NUEVO,
            priority: priority ?? 3,
            title,
            description,
            busId,
            // Preventivo debe ser un caso de bus (equipos vinculados por caseEquipment).
            busEquipmentId: cfg.type === "PREVENTIVO" ? null : eqId ?? null,
          },
        });

        if (splitByEquipment) {
          if (eqId) {
            await tx.caseEquipment.create({
              data: { caseId: c.id, busEquipmentId: eqId },
            });
          }
        } else if (effectiveEquipmentIds.length) {
          await tx.caseEquipment.createMany({
            data: effectiveEquipmentIds.map((id: string) => ({ caseId: c.id, busEquipmentId: id })),
            skipDuplicates: true,
          });
        }

        await tx.caseEvent.create({
          data: {
            caseId: c.id,
            type: CaseEventType.CREATED,
            message: "Caso creado",
            meta: {
              userId,
              ...(splitGroupKey ? { splitGroupKey } : {}),
              ...(fromNovedadId ? { sourceCaseId: fromNovedadId } : {}),
            },
          },
        });

        if (cfg.requiresWorkOrder) {
          await tx.workOrder.create({
            data: { tenantId, workOrderNo: nums.workOrderNo!, caseId: c.id },
          });

          if (!cfg.stsComponentCode) {
            await tx.case.update({ where: { id: c.id }, data: { status: CaseStatus.OT_ASIGNADA } });
          }

          await tx.caseEvent.create({
            data: {
              caseId: c.id,
              type: CaseEventType.STATUS_CHANGE,
              message: "OT creada automáticamente",
              meta: { userId },
            },
          });
        }

        if (cfg.stsComponentCode) {
          createdStsCases.push({ caseId: c.id, description: c.description });
        }

        createdCases.push(c);
      }

      return { case: createdCases[0], createdCount: createdCases.length, createdStsCases };
      },
      { maxWait: 10000, timeout: 20000 }
    );

    await notifyTenantUsers({
      tenantId,
      // Destinatarios acotados: solo quienes asignan (pocos). Evita blast a ADMIN/BACKOFFICE.
      roles: [Role.SUPERVISOR, Role.PLANNER],
      type: NotificationType.CASE_CREATED,
      title: `Nuevo caso: ${created.case.title}`,
      body: `Tipo: ${created.case.type} | Estado: ${created.case.status}`,
      meta: { caseId: created.case.id },
    });
    let createdVideoRequestId: string | null = null;
    if (cfg.hasInlineCreateForm) {
      const v = parsedVideo!.data as any;
      const targetCase = created.case;

      const req = await prisma.videoDownloadRequest.create({
        data: {
          caseId: targetCase.id,
          origin: v.origin,
          requestType: v.requestType || null,

          tmsaRadicado: v.radicadoTMSA || null,
          tmsaFiledAt: v.radicadoTMSADate ?? null,
          concessionaireFiledAt: v.radicadoConcesionarioDate ?? null,

          requesterName: v.requesterName || null,
          requesterId: v.requesterDocument || null,
          requesterRole: v.requesterRole || null,
          requesterPhone: v.requesterPhone || null,
          requesterEmail: v.requesterEmail || null,
          requesterEmails: v.requesterEmails?.length ? v.requesterEmails : null,

          vehicleId: v.vehicleId || null,

          eventStart: v.eventStartAt ?? null,
          eventEnd: v.eventEndAt ?? null,

          camerasRequested: v.cameras || null,
          deliveryMethod: v.deliveryMethod || null,

          descriptionNovedad: v.descriptionNovedad || null,
          finSolicitud: v.finSolicitud?.length ? v.finSolicitud : null,
        },
      });
      createdVideoRequestId = req.id;

      await prisma.caseEvent.create({
        data: { caseId: targetCase.id, type: CaseEventType.COMMENT, message: "Formulario video guardado", meta: { userId } },
      });

      await prisma.videoRequestEvent.create({
        data: {
          requestId: req.id,
          type: VideoRequestEventType.STATUS_CHANGE,
          message: "Estado inicial EN_ESPERA",
          meta: { by: userId },
          actorUserId: userId,
        },
      });
    }

    if (createdVideoRequestId) {
      const req = await prisma.videoDownloadRequest.findFirst({
        where: { id: createdVideoRequestId },
        include: { case: { include: { bus: true } } },
      });

      if (req) {
        const emails = Array.isArray(req.requesterEmails) ? req.requesterEmails : [];
        const allEmails = Array.from(new Set([...emails, req.requesterEmail].filter(Boolean))) as string[];
        const bodyLines = [
          `ID caso: ${req.case.caseNo ?? req.caseId}`,
          `Bus: ${req.case.bus.code}${req.case.bus.plate ? ` (${req.case.bus.plate})` : ""}`,
          req.vehicleId ? `Vehiculo: ${req.vehicleId}` : "",
          req.descriptionNovedad ? `Descripcion: ${req.descriptionNovedad}` : "",
          req.finSolicitud ? `Fin solicitud: ${(req.finSolicitud as any[]).join(", ")}` : "",
        ].filter(Boolean) as string[];

        if (allEmails.length && !req.notifPendingSentAt) {
          const email = buildVideoEmail({
            title: `Solicitud recibida - ${req.case.caseNo ?? req.caseId}`,
            bodyLines: [...bodyLines, "Su solicitud fue recibida y esta en espera."],
          });

          await Promise.allSettled(
            allEmails.map(async (to) => {
              try {
                await sendMail({ to, subject: email.subject, html: email.html, text: email.text });
              } catch (err) {
                console.error("VIDEO_EMAIL_SEND_FAILED", { to, err });
              }
            })
          );

          await prisma.videoDownloadRequest.update({
            where: { id: req.id },
            data: { notifPendingSentAt: new Date() },
          });

          await prisma.videoRequestEvent.create({
            data: {
              requestId: req.id,
              type: VideoRequestEventType.EMAIL_SENT,
              message: "Correo enviado: EN_ESPERA",
              meta: { to: allEmails },
              actorUserId: userId,
            },
          });
        }

        // Notificación interna acotada: si la solicitud ya tiene responsable
        // asignado, solo a él; si no, a quienes asignan (SUPERVISOR/PLANNER).
        // El correo directo al/los solicitante(s) ya se envió arriba.
        await notifyTenantUsers({
          tenantId,
          ...(req.assignedToId
            ? { userIds: [req.assignedToId] }
            : { roles: [Role.SUPERVISOR, Role.PLANNER] }),
          type: NotificationType.VIDEO_REQUEST_CREATED,
          title: `Nuevo caso video - ${req.case.caseNo ?? req.caseId}`,
          body: `Bus: ${req.case.bus.code}${req.case.bus.plate ? ` (${req.case.bus.plate})` : ""}`,
          href: `/video-requests/${req.id}`,
          meta: { requestId: req.id, caseId: req.caseId },
        });
      }
    }

    // Crear tickets STS fuera de la transacción para evitar cierre del tx
    if (cfg.stsComponentCode && created.createdStsCases?.length) {
      const comp = await prisma.stsComponent.findFirst({
        where: { tenantId, code: cfg.stsComponentCode },
      });
      if (!comp) {
        return NextResponse.json(
          { error: "Componente STS no configurado" },
          { status: 400 }
        );
      }

      for (const item of created.createdStsCases) {
        const ticket = await prisma.stsTicket.create({
          data: {
            tenantId,
            caseId: item.caseId,
            componentId: comp.id,
            severity: stsSeverity as StsTicketSeverity,
            status: "OPEN",
            channel: StsTicketChannel.OTHER,
            description: item.description,
            openedAt: new Date(),
          },
        });

        await prisma.stsTicketEvent.create({
          data: {
            ticketId: ticket.id,
            type: "STATUS_CHANGE",
            status: "OPEN",
            message: "Ticket creado desde caso",
            createdById: userId,
          },
        });

        await prisma.caseEvent.create({
          data: {
            caseId: item.caseId,
            type: CaseEventType.COMMENT,
            message: `Ticket STS creado (${cfg.stsComponentCode})`,
            meta: { userId, stsTicketId: ticket.id },
          },
        });
      }
    }

    return NextResponse.json(created.case);
  } catch (e: any) {
    return NextResponse.json(
      { error: "No se pudo crear el caso", detail: e?.message ?? String(e) },
      { status: 400 }
    );
  }
}
