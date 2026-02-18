import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProcedureType, Role } from "@prisma/client";
import { CASE_TYPE_REGISTRY } from "@/lib/case-type-registry";

import StartWorkOrderCard from "./ui/StartWorkOrderCard";
import FinishWorkOrderCard from "./ui/FinishWorkOrderCard";
import CorrectiveReportForm from "./ui/CorrectiveReportForm";
import PreventiveReportForm from "./ui/PreventiveReportForm";
import RenewalTechReportForm from "./ui/RenewalTechReportForm";
import { preventiveCompletion, correctiveCompletion, renewalCompletion } from "@/lib/work-orders/report-completion";
import { fmtWorkOrderNo, fmtCaseNo } from "@/lib/format-no";
import { caseTypeLabels, labelFromMap, workOrderStatusLabels } from "@/lib/labels";

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

type PageProps = { params: { id: string } };

export default async function WorkOrderDetailPage({ params }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <div className="sts-card p-6">
          <p className="text-sm">No autenticado.</p>
          <Link className="underline" href="/login">
            Ir a login
          </Link>
        </div>
      </div>
    );
  }

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;
  const role = (session.user as any).role as Role;

  // Permisos: ADMIN y TECHNICIAN
  if (role !== Role.ADMIN && role !== Role.TECHNICIAN) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <div className="sts-card p-6">
          <p className="text-sm">No autorizado.</p>
        </div>
      </div>
    );
  }

  const wo = await prisma.workOrder.findFirst({
    where: { id: params.id, tenantId },
    include: {
      assignedTo: { select: { id: true, name: true, email: true, role: true } },
      case: {
        select: {
          id: true,
          caseNo: true,
          title: true,
          description: true,
          type: true,
          bus: { select: { id: true, code: true, plate: true } },
          busEquipment: {
            select: {
              id: true,
              serial: true,
              location: true,
              active: true,
              equipmentType: { select: { name: true } },
            },
          },
          caseEquipments: {
            select: {
              busEquipment: {
                select: {
                  id: true,
                  serial: true,
                  location: true,
                  equipmentType: { select: { name: true } },
                },
              },
            },
          },
        },
      },
      steps: {
        orderBy: { createdAt: "asc" },
        include: { media: true },
      },
      correctiveReport: true,
      preventiveReport: true,
      renewalTechReport: true,
      interventionReceipt: true,
    },
  });

  if (!wo) return notFound();

  // Autorización: ADMIN o técnico asignado
  if (role !== Role.ADMIN && wo.assignedToId !== userId) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <div className="sts-card p-6">
          <p className="text-sm">No autorizado. Esta OT no está asignada a tu usuario.</p>
          <Link className="underline text-sm" href="/work-orders">
            Volver
          </Link>
        </div>
      </div>
    );
  }

  const cfg = CASE_TYPE_REGISTRY[wo.case.type];

  const equipments = wo.case.caseEquipments?.length
    ? wo.case.caseEquipments.map((c) => c.busEquipment)
    : wo.case.busEquipment
    ? [wo.case.busEquipment]
    : [];

  const equipmentLabel =
    equipments.length > 0
      ? equipments
          .map(
            (eq) =>
              `${eq.equipmentType.name}${eq.serial ? ` • ${eq.serial}` : ""}${eq.location ? ` • ${eq.location}` : ""}`
          )
          .join(" | ")
      : "No aplica / No seleccionado";
  const equipmentItems = equipmentLabel
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

  // Reglas finalizar por formulario (según registry)
  const requiresFinishForm = Boolean(cfg?.finishRequiresForm);

  const completion =
    cfg?.formKind === "CORRECTIVE"
      ? correctiveCompletion(wo.correctiveReport)
      : cfg?.formKind === "PREVENTIVE"
      ? preventiveCompletion(wo.preventiveReport)
      : cfg?.formKind === "RENEWAL"
      ? renewalCompletion((wo as any).renewalTechReport, wo.case.type as any)
      : { ok: true, reasons: [] as string[] };

  const missingFinishForm = requiresFinishForm && !completion.ok;
  const isPendingValidation = wo.status === ("EN_VALIDACION" as any);
  const canDownloadReportPdf = !missingFinishForm && !isPendingValidation;

  const startDone = Boolean(wo.startedAt);
  const finishDone = Boolean(wo.finishedAt);
  const canDownloadRenewalActa =
    cfg?.formKind === "RENEWAL" && finishDone && !isPendingValidation;
  const canDownloadCorrectiveActa =
    cfg?.formKind === "CORRECTIVE" &&
    finishDone &&
    !isPendingValidation &&
    wo.correctiveReport?.procedureType === ProcedureType.CAMBIO_COMPONENTE;
  const isProductImprovement = wo.case.type === "MEJORA_PRODUCTO";
  const renewalActaLabel =
    isProductImprovement
      ? "Descargar acta de mejora de producto (Word)"
      : "Descargar acta de cambios (plantilla)";
  const onlyStartFlow = !startDone && !finishDone;

  const suggestedTicketNumber =
    wo.interventionReceipt?.ticketNo ??
    (wo.workOrderNo ? `UPK-${String(wo.workOrderNo).padStart(3, "0")}` : "");
  const contextBoxClass = "rounded-lg border-2 border-border/60 bg-muted/30 p-4";

  return (
    <div className="mobile-page-shell overflow-x-hidden">
      <header className="mobile-page-header sticky top-16 lg:static lg:top-auto">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-3 px-4 py-4 lg:flex-row lg:items-start lg:justify-between lg:px-6 lg:py-0">
          <div className="min-w-0 space-y-2">
            <h1 className="text-base font-semibold leading-tight break-words lg:text-2xl">{fmtWorkOrderNo(wo.workOrderNo)}</h1>
            <p className="text-xs leading-tight text-muted-foreground break-all lg:text-sm lg:break-normal">
              Caso: <span className="font-medium">{fmtCaseNo(wo.case.caseNo)}</span> •{" "}
              <span className="font-medium">{wo.case.title}</span> • Bus:{" "}
              <span className="font-medium">{wo.case.bus.code}</span>
              {wo.case.bus.plate ? ` • ${wo.case.bus.plate}` : ""}
            </p>
            {isProductImprovement ? (
              <span className="inline-flex items-center rounded-full border border-sky-300 bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700">
                Modo mejora de producto
              </span>
            ) : null}
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Link className="sts-btn-ghost flex-1 text-sm sm:flex-none" href="/work-orders">
              Volver
            </Link>
            <Link className="sts-btn-primary flex-1 text-sm sm:flex-none" href={`/cases/${wo.case.id}`}>
              Abrir caso
            </Link>
          </div>
        </div>
      </header>

      <div className="mobile-page-content max-w-6xl overflow-x-hidden lg:px-6">
        <div className="ot-layout flex min-w-0 flex-col gap-6 xl:flex-row xl:items-start">
        {/* Contenido principal */}
        <div className="order-2 min-w-0 flex-1 space-y-5 lg:order-1">
          <section className="sts-card overflow-hidden">
            <div className="border-b border-border/50 bg-muted/20 p-4 lg:p-5">
              <h2 className="text-base font-semibold">Contexto</h2>
            </div>

            <div className="divide-y divide-border/30 lg:hidden">
              <div className="p-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Estado OT</p>
                <p className="text-sm font-medium">{labelFromMap(wo.status, workOrderStatusLabels)}</p>
                {wo.assignedAt ? <p className="mt-1 text-xs text-muted-foreground">Asignada: {fmtDate(wo.assignedAt)}</p> : null}
              </div>

              <div className="p-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Técnico</p>
                <p className="text-sm font-medium">{wo.assignedTo?.name ?? wo.assignedToId ?? "—"}</p>
                {wo.assignedTo?.email ? <p className="mt-1 text-xs text-muted-foreground">{wo.assignedTo.email}</p> : null}
              </div>

              <div className="p-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Tipo de caso</p>
                <p className="text-sm font-medium">{labelFromMap(wo.case.type, caseTypeLabels)}</p>
              </div>

              <div className="p-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Equipos</p>
                {equipmentItems.length === 0 ? (
                  <p className="text-sm font-medium">No aplica / No seleccionado</p>
                ) : (
                  <div className="max-h-40 overflow-y-auto rounded-lg bg-muted/30 p-3">
                    <ul className="space-y-1 text-xs">
                      {equipmentItems.map((item, idx) => (
                        <li key={`${item}-${idx}`} className="flex items-start gap-2">
                          <span className="mt-0.5 text-muted-foreground">•</span>
                          <span className="break-all">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="p-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Descripción del caso</p>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{wo.case.description}</p>
              </div>
            </div>

            <div className="hidden gap-4 p-5 md:grid md:grid-cols-2">
              <div className={contextBoxClass}>
                <p className="text-xs text-muted-foreground">Estado OT</p>
                <p className="mt-1 text-sm font-medium">{labelFromMap(wo.status, workOrderStatusLabels)}</p>
                {wo.assignedAt ? (
                  <p className="mt-1 text-xs text-muted-foreground">Asignada: {fmtDate(wo.assignedAt)}</p>
                ) : null}
              </div>

              <div className={contextBoxClass}>
                <p className="text-xs text-muted-foreground">Técnico</p>
                <p className="mt-1 text-sm font-medium">{wo.assignedTo?.name ?? wo.assignedToId ?? "—"}</p>
                {wo.assignedTo?.email ? <p className="mt-1 text-xs text-muted-foreground">{wo.assignedTo.email}</p> : null}
              </div>

              <div className={contextBoxClass}>
                <p className="text-xs text-muted-foreground">Tipo de caso</p>
                <p className="mt-1 text-sm font-medium">{labelFromMap(wo.case.type, caseTypeLabels)}</p>
              </div>

              <div className={contextBoxClass}>
                <p className="text-xs text-muted-foreground">Equipo</p>
                {equipmentItems.length === 0 ? (
                  <p className="mt-1 text-sm font-medium">No aplica / No seleccionado</p>
                ) : (
                  <div className="mt-2 max-h-32 space-y-1 overflow-y-auto rounded-lg border border-border/60 bg-card/80 p-2">
                    {equipmentItems.map((item, idx) => (
                      <p key={`${item}-${idx}`} className="text-xs leading-relaxed">
                        • {item}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              <div className={`${contextBoxClass} md:col-span-2`}>
                <p className="text-xs text-muted-foreground">Descripción del caso</p>
                <p className="mt-1 text-sm whitespace-pre-wrap">{wo.case.description}</p>
              </div>
            </div>
          </section>

          <section className="sts-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Evidencias y pasos</h2>
              <p className="text-xs text-muted-foreground">{wo.steps.length} pasos</p>
            </div>

            <div className="mt-4 space-y-3">
              {wo.steps.length === 0 ? (
                <div className="text-sm text-muted-foreground">Aún no hay pasos registrados.</div>
              ) : (
                wo.steps.map((s) => (
                  <div key={s.id} className="sts-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{s.stepType}</p>
                        <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{s.notes}</p>
                      </div>
                      <p className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(s.createdAt)}</p>
                    </div>

                    {s.media?.length ? (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {s.media.map((m) => (
                          <img
                            key={m.id}
                            src={`/api/uploads/${m.filePath}`}
                            alt={m.kind}
                            className="h-40 w-full rounded-md border object-cover"
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </section>

          {!onlyStartFlow ? (
            <section className="sts-card p-5">
              <h2 className="text-base font-semibold">Formularios</h2>

              <div className="mt-3 space-y-4">
                {!requiresFinishForm ? (
                  <div className="sts-card p-4">
                    <p className="text-sm text-muted-foreground">Este tipo de OT no requiere formulario para finalizar.</p>
                  </div>
                ) : cfg?.formKind === "CORRECTIVE" ? (
                  <CorrectiveReportForm
                    workOrderId={wo.id}
                    initialReport={wo.correctiveReport}
                    suggestedTicketNumber={suggestedTicketNumber}
                  />
                ) : cfg?.formKind === "RENEWAL" ? (
                  <RenewalTechReportForm
                    workOrderId={wo.id}
                    initialReport={(wo as any).renewalTechReport}
                    suggestedTicketNumber={suggestedTicketNumber}
                    caseType={wo.case.type}
                  />
                ) : (
                  <PreventiveReportForm
                    workOrderId={wo.id}
                    initialReport={wo.preventiveReport}
                    suggestedTicketNumber={suggestedTicketNumber}
                  />
                )}

                {requiresFinishForm ? (
                  <div className="sts-card p-4">
                    <p className="text-sm">
                      Estado formulario:{" "}
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs ${
                          missingFinishForm
                            ? "border-amber-200 bg-amber-50 text-amber-800"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {missingFinishForm ? "Pendiente" : "Realizado"}
                      </span>
                    </p>

                    {missingFinishForm && completion.reasons?.length ? (
                      <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
                        {completion.reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">Nota: el backend autollenará bus/placa/equipo.</p>
                    )}
                    {canDownloadReportPdf ? (
                      <div className="mt-2 space-y-2">
                        <a
                          className="text-xs underline"
                          href={`/api/work-orders/${wo.id}/report-pdf?kind=${cfg?.formKind ?? ""}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Descargar PDF del formulario
                        </a>
                        {canDownloadRenewalActa ? (
                          <div>
                            <a
                              className="text-xs underline"
                              href={`/api/work-orders/${wo.id}/renewal-acta`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {renewalActaLabel}
                            </a>
                          </div>
                        ) : null}
                        {canDownloadCorrectiveActa ? (
                          <div>
                            <a
                              className="text-xs underline"
                              href={`/api/work-orders/${wo.id}/corrective-acta`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Descargar acta de cambio de equipo (Word)
                            </a>
                          </div>
                        ) : null}
                      </div>
                    ) : isPendingValidation ? (
                      <p className="mt-2 text-xs text-amber-700">
                        PDF bloqueado: pendiente validación de acta por coordinador.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </section>
          ) : (
            <section className="sts-card p-5">
              <h2 className="text-base font-semibold">Flujo de ejecución</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                1) Inicia la OT. 2) Completa y guarda el formulario. 3) Finaliza la OT.
              </p>
            </section>
          )}
        </div>

        {/* Panel lateral */}
        <aside className="ot-panel order-1 w-full min-w-0 flex-shrink-0 space-y-4 xl:order-2 xl:w-[340px] 2xl:w-[380px]">
          <div className="space-y-3 xl:hidden">
            <details className="group rounded-xl border border-border/60 bg-card p-0">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">Iniciar OT</span>
                  {startDone ? (
                    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      Iniciada
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                      Pendiente
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground transition-transform group-open:rotate-180">▾</span>
              </summary>
              <div className="border-t border-border/50 p-3">
                <StartWorkOrderCard
                  workOrderId={wo.id}
                  disabled={startDone || finishDone}
                  startedAt={wo.startedAt ? fmtDate(wo.startedAt) : null}
                  embedded
                />
              </div>
            </details>

            {!onlyStartFlow ? (
              <details className="group rounded-xl border border-border/60 bg-card p-0">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">Finalizar OT</span>
                    {finishDone ? (
                      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                        Finalizada
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        En proceso
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground transition-transform group-open:rotate-180">▾</span>
                </summary>
                <div className="border-t border-border/50 p-3">
                  <FinishWorkOrderCard
                    workOrderId={wo.id}
                    disabled={!startDone || finishDone || missingFinishForm}
                    finishedAt={wo.finishedAt ? fmtDate(wo.finishedAt) : null}
                    embedded
                    caseType={wo.case.type}
                    equipmentOptions={equipments.map((eq) => ({
                      id: eq.id,
                      label: `${eq.equipmentType.name}${eq.serial ? ` • ${eq.serial}` : ""}${eq.location ? ` • ${eq.location}` : ""}`,
                    }))}
                    blockingReason={
                      !startDone
                        ? "Debes iniciar la OT primero."
                        : finishDone
                        ? "La OT ya está finalizada."
                        : missingFinishForm
                        ? "Debes completar el formulario requerido antes de finalizar."
                        : null
                    }
                  />
                </div>
              </details>
            ) : null}
          </div>

          <div className="hidden space-y-4 xl:sticky xl:top-20 xl:block">
            <StartWorkOrderCard
              workOrderId={wo.id}
              disabled={startDone || finishDone}
              startedAt={wo.startedAt ? fmtDate(wo.startedAt) : null}
            />

            {!onlyStartFlow ? (
              <FinishWorkOrderCard
                workOrderId={wo.id}
                disabled={!startDone || finishDone || missingFinishForm}
                finishedAt={wo.finishedAt ? fmtDate(wo.finishedAt) : null}
                caseType={wo.case.type}
                equipmentOptions={equipments.map((eq) => ({
                  id: eq.id,
                  label: `${eq.equipmentType.name}${eq.serial ? ` • ${eq.serial}` : ""}${eq.location ? ` • ${eq.location}` : ""}`,
                }))}
                blockingReason={
                  !startDone
                    ? "Debes iniciar la OT primero."
                    : finishDone
                    ? "La OT ya está finalizada."
                    : missingFinishForm
                    ? "Debes completar el formulario requerido antes de finalizar."
                    : null
                }
              />
            ) : null}
          </div>

          <section className="sts-card p-5">
            <h2 className="text-base font-semibold">Estado</h2>
            <div className="mt-3 space-y-2 text-sm">
              <div className="sts-card p-3">
                <p className="text-xs text-muted-foreground">Inicio</p>
                <p className="mt-1 font-medium">{wo.startedAt ? fmtDate(wo.startedAt) : "No iniciada"}</p>
              </div>
              <div className="sts-card p-3">
                <p className="text-xs text-muted-foreground">Finalización</p>
                <p className="mt-1 font-medium">{wo.finishedAt ? fmtDate(wo.finishedAt) : "No finalizada"}</p>
              </div>

              <Link
                className="inline-flex w-full items-center justify-center rounded-md border px-4 py-2 text-sm"
                href={`/buses/${wo.case.bus.id}`}
              >
                Hoja de vida del bus
              </Link>

              {wo.interventionReceipt ? (
                <a
                  className="inline-flex w-full items-center justify-center rounded-md border px-4 py-2 text-sm"
                  href={`/api/work-orders/${wo.id}/receipt-pdf`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Descargar RECIBO SLA
                </a>
              ) : null}
              {canDownloadRenewalActa ? (
                <a
                  className={
                    isProductImprovement
                      ? "inline-flex w-full items-center justify-center sts-btn-primary text-sm"
                      : "inline-flex w-full items-center justify-center rounded-md border px-4 py-2 text-sm"
                  }
                  href={`/api/work-orders/${wo.id}/renewal-acta`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {renewalActaLabel}
                </a>
              ) : null}
              {canDownloadCorrectiveActa ? (
                <a
                  className="inline-flex w-full items-center justify-center rounded-md border px-4 py-2 text-sm"
                  href={`/api/work-orders/${wo.id}/corrective-acta`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Descargar acta de cambio de equipo
                </a>
              ) : null}
            </div>
          </section>
        </aside>
        </div>
      </div>
    </div>
  );
}
