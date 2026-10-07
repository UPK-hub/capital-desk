export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listarEventos } from "@/lib/telemetry/alarms";
import { ALARM_CATALOG, ALARM_LEVELS } from "@/lib/telemetry/catalog";
import { bogToday, labelKey } from "@/lib/telemetry/tz";

/** Exporta a CSV el detalle de alarmas del filtro. Tope de 20.000 filas. */
const TOPE = 20000;

function etiquetaDesdeTexto(valor: string | null): Date | null {
  if (!valor) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

function celda(valor: unknown): string {
  const s = String(valor ?? "");
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tenantId = (session.user as any).tenantId as string;
  const sp = req.nextUrl.searchParams;

  const hoy = bogToday();
  const desde = etiquetaDesdeTexto(sp.get("desde")) ?? hoy;
  const hasta = etiquetaDesdeTexto(sp.get("hasta")) ?? hoy;
  const busCode = (sp.get("bus") ?? "").trim() || null;
  const codeParam = sp.get("code");
  const levelParam = sp.get("level");
  const code = ALARM_CATALOG.some((a) => a.code === codeParam) ? codeParam : null;
  const level = ALARM_LEVELS.some((l) => l.code === levelParam) ? levelParam : null;

  const eventos = await listarEventos({ tenantId, desde, hasta, busCode, code, level }, TOPE);

  const encabezado = [
    "Fecha y hora (Bogota)",
    "Bus",
    "Codigo",
    "Alarma",
    "Nivel",
    "Descripcion del nivel",
    "Velocidad (km/h)",
    "Latitud",
    "Longitud",
  ];

  const fmt = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "short",
    timeStyle: "medium",
  });

  const lineas = [encabezado.join(";")];
  for (const e of eventos) {
    lineas.push(
      [
        e.eventAt ? fmt.format(new Date(e.eventAt)) : "",
        e.busCode,
        e.code,
        e.label,
        e.level,
        e.levelLabel,
        e.velocidad ?? "",
        e.lat ?? "",
        e.lng ?? "",
      ]
        .map(celda)
        .join(";")
    );
  }

  // BOM para que Excel en Windows abra bien los acentos.
  const cuerpo = "﻿" + lineas.join("\r\n");
  const nombre = `alarmas_${labelKey(desde)}_a_${labelKey(hasta)}.csv`;

  return new NextResponse(cuerpo, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
