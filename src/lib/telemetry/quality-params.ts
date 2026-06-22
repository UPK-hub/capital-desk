import type { NextRequest } from "next/server";

/** Lee start/end (YYYY-MM-DD) y busId de la query; con fallback a últimos 30 días. */
export function parseQualityRange(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const startStr = sp.get("start");
  const endStr = sp.get("end");
  const busId = sp.get("busId");
  let start = startStr ? new Date(`${startStr}T00:00:00`) : null;
  let end = endStr ? new Date(`${endStr}T23:59:59.999`) : null;
  if (!start || Number.isNaN(start.getTime()) || !end || Number.isNaN(end.getTime())) {
    end = new Date();
    start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  return { start, end, busId: busId || null };
}
