import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const id = ctx.params.id;

  const bus = await prisma.bus.findFirst({
    where: { id, tenantId },
    select: {
      id: true,
      code: true,
      plate: true,
      active: true,

      // equipments BusEquipment[]
      equipments: {
        orderBy: [{ equipmentType: { name: "asc" } }, { id: "asc" }],
        select: {
          id: true,
          equipmentType: { select: { id: true, name: true } },
          serial: true,
          location: true,
          active: true,
        },
      },

      cases: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          type: true,
          status: true,
          priority: true,
          title: true,
          createdAt: true,
        },
      },

      lifecycle: {
        orderBy: { occurredAt: "desc" },
        take: 100,
        select: {
          id: true,
          eventType: true,
          summary: true,
          occurredAt: true,
          caseId: true,
          workOrderId: true,
          busEquipmentId: true,
        },
      },
    },
  });

  if (!bus) return NextResponse.json({ error: "Bus no encontrado" }, { status: 404 });
  return NextResponse.json(bus);
}
