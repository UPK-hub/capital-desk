import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import CorrectiveReportForm from "../ui/CorrectiveReportForm";

type PageProps = { params: { id: string } };

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
      case: { include: { bus: true } },
      correctiveReport: true,
      interventionReceipt: true,
    },
  });

  if (!wo) return notFound();

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
        />
      </section>
    </div>
  );
}
