import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import {
  buildVideoRequestCaseScope,
  isBackofficeRestricted,
  isVideosOnlyBackoffice,
} from "@/lib/access-control";
import VideoRequestDetailClient from "./ui/VideoRequestDetailClient";

export default async function VideoRequestDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="sts-card p-6">
          <p className="text-sm">Debes iniciar sesión.</p>
          <Link className="underline text-sm" href="/login">
            Ir a login
          </Link>
        </div>
      </div>
    );
  }

  const role = (session.user as any).role as Role;
  if (![Role.ADMIN, Role.BACKOFFICE, Role.TECHNICIAN, Role.SUPERVISOR].includes(role)) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="sts-card p-6">
          <p className="text-sm">No autorizado.</p>
        </div>
      </div>
    );
  }

  const tenantId = (session.user as any).tenantId as string;
  const capabilities = (session.user as any).capabilities as string[] | undefined;
  const userId = String((session.user as any).id ?? "");
  const caseScope = buildVideoRequestCaseScope({ role, capabilities, userId });
  const canManage =
    role === Role.ADMIN ||
    role === Role.TECHNICIAN ||
    (role === Role.BACKOFFICE &&
      !isBackofficeRestricted(role, capabilities) &&
      !isVideosOnlyBackoffice(role, capabilities));
  const requestId = String(params.id);

  const item = await prisma.videoDownloadRequest.findFirst({
    where: { id: requestId, case: { tenantId, ...caseScope } },
    include: {
case: { select: { id: true, caseNo: true, title: true, description: true, bus: { select: { code: true, plate: true } } } },
      assignedTo: { select: { id: true, name: true, email: true } },
      attachments: { where: { active: true }, orderBy: { createdAt: "desc" } },
      events: { orderBy: { createdAt: "desc" }, take: 200 },
    },
  });

  if (!item) return notFound();

  return (
    <VideoRequestDetailClient
      initialItem={item}
      canManage={canManage}
      currentUserId={userId}
      isAdmin={role === Role.ADMIN}
    />
  );
}
