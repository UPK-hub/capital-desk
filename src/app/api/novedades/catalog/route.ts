export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Role } from "@prisma/client";
import novedadCatalogUtils from "@/lib/novedad-catalog";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as Role;
  if (
    role !== Role.ADMIN &&
    role !== Role.BACKOFFICE &&
    role !== Role.SUPERVISOR &&
    role !== Role.PLANNER
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const items = await novedadCatalogUtils.loadNovedadCatalog();
  const byEquipment = items.reduce<Record<string, typeof items>>((acc, item) => {
    if (!acc[item.affectedEquipment]) acc[item.affectedEquipment] = [];
    acc[item.affectedEquipment].push(item);
    return acc;
  }, {});

  return NextResponse.json({
    ok: true,
    count: items.length,
    byEquipment,
    items,
  });
}
