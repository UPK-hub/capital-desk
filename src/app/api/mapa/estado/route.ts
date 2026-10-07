import { NextResponse } from "next/server";
import { estadoMapaCacheado } from "@/lib/mapa/pmtiles";

/**
 * Dice si el archivo de teselas esta montado y hasta donde cubre. La pantalla
 * del mapa lo consulta una vez para poder avisar en vez de mostrar un fondo
 * gris sin explicacion.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const estado = await estadoMapaCacheado();
  return NextResponse.json(estado, {
    headers: { "Cache-Control": "private, max-age=30" },
  });
}
