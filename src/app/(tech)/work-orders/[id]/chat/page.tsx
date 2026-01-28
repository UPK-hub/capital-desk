import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import CaseChat from "@/components/CaseChat";

export default async function WorkOrderChatPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return (
      <div className="mx-auto max-w-4xl p-6">
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
  const role = session.user.role as Role;
  const workOrderId = String(params.id);

  const wo = await prisma.workOrder.findFirst({
    where: { id: workOrderId, tenantId },
    include: { case: { select: { id: true, caseNo: true } } },
  });

  if (!wo) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="sts-card p-6">
          <p className="text-sm">OT no encontrada.</p>
        </div>
      </div>
    );
  }

  if (role === Role.TECHNICIAN && wo.assignedToId !== userId) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="sts-card p-6">
          <p className="text-sm">No autorizado.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Chat de la OT</h1>
          <p className="text-sm text-muted-foreground">Caso #{wo.case.caseNo ?? wo.case.id}</p>
        </div>
        <Link className="sts-btn-ghost text-sm" href={`/work-orders/${workOrderId}`}>
          Volver a la OT
        </Link>
      </div>

      <CaseChat caseId={wo.case.id} currentUserId={userId} currentUserName={session.user?.name ?? "Usuario"} />
    </div>
  );
}
