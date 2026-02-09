export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

function canAccessModules(role: Role, caps: string[] | undefined) {
  const canBackoffice = role === Role.ADMIN || role === Role.BACKOFFICE;
  const canTech = role === Role.ADMIN || role === Role.TECHNICIAN;
  const canVideo = role === Role.ADMIN || role === Role.BACKOFFICE;
  const canSts =
    role === Role.ADMIN ||
    (role === Role.BACKOFFICE &&
      (caps?.includes("STS_READ") || caps?.includes("STS_WRITE") || caps?.includes("STS_ADMIN")));
  const isAdmin = role === Role.ADMIN;
  return { canBackoffice, canTech, canVideo, canSts, isAdmin };
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const term = (req.nextUrl.searchParams.get("term") ?? "").trim();
  if (term.length < 2) return NextResponse.json({ items: [] });

  const tenantId = (session.user as any).tenantId as string;
  const role = session.user.role as Role;
  const caps = (session.user as any).capabilities as string[] | undefined;
  const { canBackoffice, canTech, canVideo, canSts, isAdmin } = canAccessModules(role, caps);
  const isNumeric = /^\d+$/.test(term);
  const numericValue = isNumeric ? Number(term) : null;

  const results: Array<{ type: string; title: string; subtitle: string; href: string }> = [];

  if (canBackoffice) {
    const cases = await prisma.case.findMany({
      where: {
        tenantId,
        OR: [
          { title: { contains: term, mode: "insensitive" } },
          { description: { contains: term, mode: "insensitive" } },
          { bus: { is: { code: { contains: term, mode: "insensitive" } } } },
          { bus: { is: { plate: { contains: term, mode: "insensitive" } } } },
          ...(numericValue ? [{ caseNo: numericValue }] : []),
        ],
      },
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { bus: { select: { code: true, plate: true } } },
    });
    results.push(
      ...cases.map((c) => ({
        type: "Caso",
        title: c.title,
        subtitle: `Caso #${c.caseNo ?? "-"} · ${c.bus.code}${c.bus.plate ? ` (${c.bus.plate})` : ""} · ${c.status}`,
        href: `/cases/${c.id}`,
      })),
    );
  }

  if (canTech || canBackoffice) {
    const workOrders = await prisma.workOrder.findMany({
      where: {
        tenantId,
        OR: [
          ...(numericValue ? [{ workOrderNo: numericValue }] : []),
          { case: { is: { title: { contains: term, mode: "insensitive" } } } },
          { case: { is: { bus: { is: { code: { contains: term, mode: "insensitive" } } } } } },
          { case: { is: { bus: { is: { plate: { contains: term, mode: "insensitive" } } } } } },
        ],
      },
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { case: { select: { title: true, bus: { select: { code: true } } } } },
    });
    results.push(
      ...workOrders.map((wo) => ({
        type: "OT",
        title: `OT #${wo.workOrderNo ?? "-"}`,
        subtitle: `${wo.case.title} · ${wo.case.bus.code} · ${wo.status}`,
        href: `/work-orders/${wo.id}`,
      })),
    );
  }

  if (canBackoffice) {
    const buses = await prisma.bus.findMany({
      where: {
        tenantId,
        OR: [
          { code: { contains: term, mode: "insensitive" } },
          { plate: { contains: term, mode: "insensitive" } },
        ],
      },
      take: 5,
      orderBy: { code: "asc" },
    });
    results.push(
      ...buses.map((b) => ({
        type: "Bus",
        title: b.code,
        subtitle: b.plate ? `Placa ${b.plate}` : "Sin placa",
        href: `/buses/${b.id}`,
      })),
    );
  }

  if (canSts) {
    const stsTickets = await prisma.stsTicket.findMany({
      where: {
        tenantId,
        OR: [
          { description: { contains: term, mode: "insensitive" } },
          { component: { is: { name: { contains: term, mode: "insensitive" } } } },
        ],
      },
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { component: { select: { name: true } } },
    });
    results.push(
      ...stsTickets.map((t) => ({
        type: "STS Ticket",
        title: t.component.name,
        subtitle: `${t.severity} · ${t.status}`,
        href: `/sts/tickets/${t.id}`,
      })),
    );
  }

  if (canVideo) {
    const videos = await prisma.videoDownloadRequest.findMany({
      where: {
        OR: [
          { case: { is: { tenantId, title: { contains: term, mode: "insensitive" } } } },
          { case: { is: { tenantId, bus: { is: { code: { contains: term, mode: "insensitive" } } } } } },
          { case: { is: { tenantId, bus: { is: { plate: { contains: term, mode: "insensitive" } } } } } },
          { requesterName: { contains: term, mode: "insensitive" } },
        ],
      },
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { case: { select: { title: true } } },
    });
    results.push(
      ...videos.map((v) => ({
        type: "Video",
        title: v.case.title,
        subtitle: `${v.status} · ${v.downloadStatus}`,
        href: `/video-requests/${v.id}`,
      })),
    );
  }

  if (isAdmin) {
    const users = await prisma.user.findMany({
      where: {
        tenantId,
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { email: { contains: term, mode: "insensitive" } },
        ],
      },
      take: 5,
      orderBy: { name: "asc" },
    });
    results.push(
      ...users.map((u) => ({
        type: "Usuario",
        title: u.name,
        subtitle: u.email,
        href: `/admin/users`,
      })),
    );
  }

  return NextResponse.json({ items: results.slice(0, 20) });
}
