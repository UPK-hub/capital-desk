import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import CorrectiveReportForm from "../ui/CorrectiveReportForm";

type PageProps = { params: { id: string } };

function extractLatestNovedadState(events: Array<{ meta: unknown }>) {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const state = (events[i].meta as any)?.noveltyState;
    if (state && typeof state === "object") {
      return {
        catalogCode: String(state.catalogCode ?? "").trim(),
        affectedEquipment: String(state.affectedEquipment ?? "").trim(),
        reportedNovelty: String(state.reportedNovelty ?? "").trim(),
      };
    }
  }
  return null;
}

function extractLatestQuickVerification(events: Array<{ meta: unknown }>) {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const quick = (events[i].meta as any)?.quickVerification;
    if (!quick || typeof quick !== "object") continue;
    const result = String(quick.result ?? "").trim().toUpperCase();
    if (!["CONFIRMADA", "DESCARTADA", "REQUIERE_REVISION"].includes(result)) continue;

    const checklistRaw = Array.isArray(quick.checklist) ? quick.checklist : [];
    const evidenceRaw = Array.isArray(quick.evidence)
      ? quick.evidence
      : Array.isArray(quick.evidenceItems)
      ? quick.evidenceItems
      : [];

    return {
      result,
      notes: String(quick.notes ?? "").trim(),
      suggestedAction: String(quick.suggestedAction ?? "").trim(),
      checklistSummary: checklistRaw
        .map((item: any) => String(item?.label ?? "").trim())
        .filter(Boolean)
        .join(" | "),
      evidenceSummary: evidenceRaw
        .map((item: any) => String(item?.label ?? "").trim())
        .filter(Boolean)
        .join(" | "),
    };
  }
  return null;
}

export default async function CorrectiveReportPage({ params }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="sts-card p-6">
          <p className="text-sm">Debes iniciar sesión.</p>
          <Link className="underline text-sm" href="/login">Ir a login</Link>
        </div>
      </div>
    );
  }

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;
  const role = (session.user as any).role as Role;

  const wo = await prisma.workOrder.findFirst({
    where: {
      id: params.id,
      tenantId,
      ...(role === Role.ADMIN ? {} : { assignedToId: userId }),
    },
    include: {
      case: {
        include: {
          bus: true,
          events: { orderBy: { createdAt: "asc" }, select: { meta: true }, take: 120 },
        },
      },
      correctiveReport: true,
      interventionReceipt: true,
    },
  });

  if (!wo) return notFound();
  const noveltyState =
    wo.case.type === "CORRECTIVO" ? extractLatestNovedadState(wo.case.events ?? []) : null;
  const quickVerification =
    wo.case.type === "CORRECTIVO" ? extractLatestQuickVerification(wo.case.events ?? []) : null;

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Formato Correctivo</h1>
          <p className="text-sm text-muted-foreground">
            OT <span className="font-mono">{wo.id}</span> • Bus {wo.case.bus.code} • Caso: {wo.case.title}
          </p>
        </div>

        <Link className="sts-btn-ghost text-sm" href={`/work-orders/${wo.id}`}>
          Volver a OT
        </Link>
      </div>

      <section className="sts-card p-5">
        <CorrectiveReportForm
          workOrderId={wo.id}
          initialReport={wo.correctiveReport}
          suggestedTicketNumber={
            wo.interventionReceipt?.ticketNo ??
            (wo.workOrderNo ? `UPK-${String(wo.workOrderNo).padStart(3, "0")}` : "")
          }
          busCode={wo.case.bus.code}
          caseRef={wo.case.caseNo ? `CASO-${String(wo.case.caseNo).padStart(3, "0")}` : undefined}
          ticketRequestedAt={wo.case.createdAt.toISOString()}
          isCorrectiveFromNovelty={Boolean(noveltyState)}
          noveltyAutoFill={
            noveltyState
              ? {
                  catalogCode: noveltyState.catalogCode,
                  affectedEquipment: noveltyState.affectedEquipment,
                  reportedNovelty: noveltyState.reportedNovelty,
                  quickResult: quickVerification?.result ?? "",
                  quickNotes: quickVerification?.notes ?? "",
                  quickSuggestedAction: quickVerification?.suggestedAction ?? "",
                  quickChecklistSummary: quickVerification?.checklistSummary ?? "",
                  quickEvidenceSummary: quickVerification?.evidenceSummary ?? "",
                }
              : null
          }
        />
      </section>
    </div>
  );
}
