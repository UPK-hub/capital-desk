export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, TechnicianRestDay, TechnicianShiftType } from "@prisma/client";
import { z } from "zod";

const upsertSchema = z.object({
  userId: z.string().min(1),
  shiftType: z.nativeEnum(TechnicianShiftType),
  restDay: z.nativeEnum(TechnicianRestDay),
});

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as Role;
  if (role !== Role.ADMIN) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tenantId = (session.user as any).tenantId as string;

  const technicians = await prisma.user.findMany({
    where: { tenantId, active: true, role: Role.TECHNICIAN },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      technicianSchedule: { select: { shiftType: true, restDay: true, timezone: true } },
    },
  });

  return NextResponse.json({
    items: technicians.map((t) => ({
      id: t.id,
      name: t.name,
      email: t.email,
      shiftType: t.technicianSchedule?.shiftType ?? null,
      restDay: t.technicianSchedule?.restDay ?? null,
      timezone: t.technicianSchedule?.timezone ?? null,
    })),
  });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as Role;
  if (role !== Role.ADMIN) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tenantId = (session.user as any).tenantId as string;
  const body = await req.json().catch(() => ({}));
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validacion fallida", issues: parsed.error.issues }, { status: 400 });
  }

  const tech = await prisma.user.findFirst({
    where: { id: parsed.data.userId, tenantId, active: true, role: Role.TECHNICIAN },
    select: { id: true },
  });
  if (!tech) return NextResponse.json({ error: "Tecnico invalido" }, { status: 404 });

  const schedule = await prisma.technicianSchedule.upsert({
    where: { userId: tech.id },
    create: {
      userId: tech.id,
      tenantId,
      shiftType: parsed.data.shiftType,
      restDay: parsed.data.restDay,
      timezone: "America/Bogota",
    },
    update: {
      shiftType: parsed.data.shiftType,
      restDay: parsed.data.restDay,
      timezone: "America/Bogota",
    },
    select: { userId: true, shiftType: true, restDay: true, timezone: true },
  });

  return NextResponse.json({ ok: true, schedule });
}
