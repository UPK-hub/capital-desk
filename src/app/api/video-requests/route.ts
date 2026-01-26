export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as Role;
  if (![Role.ADMIN, Role.BACKOFFICE, Role.TECHNICIAN].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const downloadStatus = url.searchParams.get("downloadStatus");

  const items = await prisma.videoDownloadRequest.findMany({
    where: {
      case: { tenantId },
      ...(status ? { status: status as any } : {}),
      ...(downloadStatus ? { downloadStatus: downloadStatus as any } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      case: { select: { id: true, caseNo: true, title: true, bus: { select: { code: true, plate: true } } } },
      assignedTo: { select: { id: true, name: true, email: true } },
    },
    take: 200,
  });

  return NextResponse.json({ items });
}
