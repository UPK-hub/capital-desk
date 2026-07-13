export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const role = (session.user as any).role as Role;
  if (role !== Role.ADMIN) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const tenantId = (session.user as any).tenantId as string;

  const equipos = await prisma.busEquipment.findMany({
    where: { bus: { tenantId } },
    include: {
      bus: { select: { code: true, plate: true } },
      equipmentType: { select: { name: true } },
    },
    orderBy: [{ bus: { code: "asc" } }, { equipmentType: { name: "asc" } }],
  });

  const rows = [
    ["Bus", "Placa", "Tipo Equipo", "Marca", "Modelo", "Serial", "IP", "Ubicacion", "Estado"],
    ...equipos.map((e) => [
      e.bus.code,
      e.bus.plate ?? "",
      e.equipmentType.name,
      e.brand ?? "",
      e.model ?? "",
      e.serial ?? "",
      e.ipAddress ?? "",
      e.location ?? "",
      e.active ? "Activo" : "Inactivo",
    ]),
  ];

  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="seriales_buses.csv"`,
    },
  });
}
