import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import VideoRequestDetailClient from "./ui/VideoRequestDetailClient";

export default async function VideoRequestDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="rounded-xl border bg-white p-6">
          <p className="text-sm">Debes iniciar sesión.</p>
          <Link className="underline text-sm" href="/login">
            Ir a login
          </Link>
        </div>
      </div>
    );
  }

  const role = (session.user as any).role as Role;
  if (![Role.ADMIN, Role.BACKOFFICE, Role.TECHNICIAN].includes(role)) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="rounded-xl border bg-white p-6">
          <p className="text-sm">No autorizado.</p>
        </div>
      </div>
    );
  }

  const tenantId = (session.user as any).tenantId as string;
  const requestId = String(params.id);

  const item = await prisma.videoDownloadRequest.findFirst({
    where: { id: requestId, case: { tenantId } },
    include: {
      case: { select: { id: true, caseNo: true, title: true, bus: { select: { code: true, plate: true } } } },
      assignedTo: { select: { id: true, name: true, email: true } },
      attachments: { orderBy: { createdAt: "desc" } },
      events: { orderBy: { createdAt: "desc" }, take: 200 },
    },
  });

  if (!item) return notFound();

  return <VideoRequestDetailClient initialItem={item} />;
}
