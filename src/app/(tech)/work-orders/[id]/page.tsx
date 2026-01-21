import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { CASE_TYPE_REGISTRY } from "@/lib/case-type-registry";

import StartWorkOrderCard from "./ui/StartWorkOrderCard";
import FinishWorkOrderCard from "./ui/FinishWorkOrderCard";
import CorrectiveReportForm from "./ui/CorrectiveReportForm";
import PreventiveReportForm from "./ui/PreventiveReportForm";
import { preventiveCompletion, correctiveCompletion } from "@/lib/work-orders/report-completion";
import { fmtWorkOrderNo, fmtCaseNo } from "@/lib/format-no";

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
        <div className="rounded-xl border bg-white p-6">
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
        <div className="rounded-xl border bg-white p-6">
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
        },
      },
      steps: {
        orderBy: { createdAt: "asc" },
        include: { media: true },
      },
      correctiveReport: true,
      preventiveReport: true,
    },
  });

  if (!wo) return notFound();

  // Autorización: ADMIN o técnico asignado
  if (role !== Role.ADMIN && wo.assignedToId !== userId) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <div className="rounded-xl border bg-white p-6">
          <p className="text-sm">No autorizado. Esta OT no está asignada a tu usuario.</p>
          <Link className="underline text-sm" href="/work-orders">
            Volver
          </Link>
        </div>
      </div>
    );
  }

  const cfg = CASE_TYPE_REGISTRY[wo.case.type];

  const equipmentLabel = wo.case.busEquipment
    ? `${wo.case.busEquipment.equipmentType.name}${wo.case.busEquipment.serial ? ` • ${wo.case.busEquipment.serial}` : ""}${
        wo.case.busEquipment.location ? ` • ${wo.case.busEquipment.location}` : ""
      }`
    : "No aplica / No seleccionado";

  // Reglas finalizar por formulario (según registry)
  const requiresFinishForm = Boolean(cfg?.finishRequiresForm);

  const completion =
    cfg?.formKind === "CORRECTIVE"
      ? correctiveCompletion(wo.correctiveReport)
      : cfg?.formKind === "PREVENTIVE"
      ? preventiveCompletion(wo.preventiveReport)
      : { ok: true, reasons: [] as string[] };

  const missingFinishForm = requiresFinishForm && !completion.ok;

  const startDone = Boolean(wo.startedAt);
  const finishDone = Boolean(wo.finishedAt);

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{fmtWorkOrderNo(wo.workOrderNo)}</h1>
          <p className="text-sm text-muted-foreground">
            Caso: <span className="font-medium">{fmtCaseNo(wo.case.caseNo)}</span> •{" "}
            <span className="font-medium">{wo.case.title}</span> • Bus:{" "}
            <span className="font-medium">{wo.case.bus.code}</span>
            {wo.case.bus.plate ? ` • ${wo.case.bus.plate}` : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link className="rounded-md border px-3 py-2 text-sm" href="/work-orders">
            Volver
          </Link>
          <Link className="rounded-md bg-black px-3 py-2 text-sm text-white" href={`/cases/${wo.case.id}`}>
            Abrir caso
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Izquierda */}
        <div className="lg:col-span-2 space-y-6">
          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold">Contexto</h2>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Estado OT</p>
                <p className="mt-1 text-sm font-medium">{wo.status}</p>
                {wo.assignedAt ? (
                  <p className="mt-1 text-xs text-muted-foreground">Asignada: {fmtDate(wo.assignedAt)}</p>
                ) : null}
              </div>

              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Técnico</p>
                <p className="mt-1 text-sm font-medium">{wo.assignedTo?.name ?? wo.assignedToId ?? "—"}</p>
                {wo.assignedTo?.email ? <p className="mt-1 text-xs text-muted-foreground">{wo.assignedTo.email}</p> : null}
              </div>

              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Tipo de caso</p>
                <p className="mt-1 text-sm font-medium">{wo.case.type}</p>
              </div>

              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Equipo</p>
                <p className="mt-1 text-sm font-medium">{equipmentLabel}</p>
              </div>

              <div className="rounded-lg border p-3 md:col-span-2">
                <p className="text-xs text-muted-foreground">Descripción del caso</p>
                <p className="mt-1 text-sm whitespace-pre-wrap">{wo.case.description}</p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Evidencias y pasos</h2>
              <p className="text-xs text-muted-foreground">{wo.steps.length} pasos</p>
            </div>

            <div className="mt-4 space-y-3">
              {wo.steps.length === 0 ? (
                <div className="text-sm text-muted-foreground">Aún no hay pasos registrados.</div>
              ) : (
                wo.steps.map((s) => (
                  <div key={s.id} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{s.stepType}</p>
                        <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{s.notes}</p>
                      </div>
                      <p className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(s.createdAt)}</p>
                    </div>

                    {s.media?.length ? (
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {s.media.map((m) => (
                          <div key={m.id} className="rounded border p-2">
                            <p className="text-xs text-muted-foreground">{m.kind}</p>
                            <p className="mt-1 text-xs font-mono break-all">{m.filePath}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold">Formularios</h2>

            <div className="mt-3 space-y-4">
              {!requiresFinishForm ? (
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">Este tipo de OT no requiere formulario para finalizar.</p>
                </div>
              ) : cfg?.formKind === "CORRECTIVE" ? (
                <CorrectiveReportForm workOrderId={wo.id} initialReport={wo.correctiveReport} />
              ) : (
                <PreventiveReportForm workOrderId={wo.id} initialReport={wo.preventiveReport} />
              )}

              {requiresFinishForm ? (
                <div className="rounded-lg border p-4">
                  <p className="text-sm">
                    Estado formulario: <span className="font-medium">{missingFinishForm ? "Pendiente" : "Completado"}</span>
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
                </div>
              ) : null}
            </div>
          </section>
        </div>

        {/* Derecha */}
        <div className="space-y-6">
          <StartWorkOrderCard
            workOrderId={wo.id}
            disabled={startDone || finishDone}
            startedAt={wo.startedAt ? fmtDate(wo.startedAt) : null}
          />

          <FinishWorkOrderCard
            workOrderId={wo.id}
            disabled={!startDone || finishDone || missingFinishForm}
            finishedAt={wo.finishedAt ? fmtDate(wo.finishedAt) : null}
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

          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold">Estado</h2>
            <div className="mt-3 space-y-2 text-sm">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Inicio</p>
                <p className="mt-1 font-medium">{wo.startedAt ? fmtDate(wo.startedAt) : "No iniciada"}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Finalización</p>
                <p className="mt-1 font-medium">{wo.finishedAt ? fmtDate(wo.finishedAt) : "No finalizada"}</p>
              </div>

              <Link
                className="inline-flex w-full items-center justify-center rounded-md border px-4 py-2 text-sm"
                href={`/buses/${wo.case.bus.id}`}
              >
                Hoja de vida del bus
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
