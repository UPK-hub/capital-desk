export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  findInventoryModelBySerial,
  normalizeInventorySerial,
  searchInventoryBySerial,
} from "@/lib/inventory-catalog";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenantId = (session.user as any).tenantId as string;

  const q = String(req.nextUrl.searchParams.get("q") ?? "");
  const exact = String(req.nextUrl.searchParams.get("exact") ?? "")
    .toLowerCase()
    .trim();
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "10");

  const query = normalizeInventorySerial(q);
  if (!query) {
    return NextResponse.json({ ok: true, item: null, items: [] });
  }

  if (exact === "1" || exact === "true" || exact === "yes") {
    const model = await findInventoryModelBySerial(tenantId, query);
    return NextResponse.json({
      ok: true,
      item: model ? { serial: query, model } : null,
      items: [],
    });
  }

  const items = await searchInventoryBySerial(tenantId, query, limit);
  return NextResponse.json({ ok: true, items });
}
