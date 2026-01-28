import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import CaseChat from "@/components/CaseChat";

export default async function CaseChatPage({ params }: { params: { id: string } }) {
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
  const caseId = String(params.id);

  const c = await prisma.case.findFirst({
    where: { id: caseId, tenantId },
    include: { workOrder: { select: { assignedToId: true } } },
  });
  if (!c) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="sts-card p-6">
          <p className="text-sm">Caso no encontrado.</p>
        </div>
      </div>
    );
  }

  if (role === Role.TECHNICIAN && c.workOrder?.assignedToId !== userId) {
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
          <h1 className="text-2xl font-semibold">Chat del caso</h1>
          <p className="text-sm text-muted-foreground">Caso #{c.caseNo ?? c.id}</p>
        </div>
        <Link className="sts-btn-ghost text-sm" href={`/cases/${caseId}`}>
          Volver al caso
        </Link>
      </div>

      <CaseChat caseId={caseId} currentUserId={userId} currentUserName={session.user?.name ?? "Usuario"} />
    </div>
  );
}
