/**
 * Análisis del reporte de cámaras offline, previo a crear las novedades.
 *
 *   POST /api/novedades/import/parse
 *     - multipart con `file` (imagen, .xlsx o .csv), o
 *     - JSON { text: "<cuadro pegado>" }
 *
 * No crea nada: devuelve las filas detectadas, los buses que no existen en la
 * flota y las novedades abiertas que ya tiene cada bus, para que la pantalla de
 * revisión lo muestre antes de confirmar.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CaseStatus, CaseType, Role } from "@prisma/client";
import { analizarTexto, extraerTextoDeArchivo, type OrigenTexto } from "@/lib/novedades/import-camaras";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = (session.user as any).role as Role;
  if (![Role.ADMIN, Role.BACKOFFICE, Role.SUPERVISOR, Role.HELPDESK].includes(role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const tenantId = (session.user as any).tenantId as string;

  let texto = "";
  let origen: OrigenTexto = "texto";
  let aviso: string | undefined;

  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      const pegado = String(form.get("text") ?? "").trim();
      if (file instanceof File && file.size > 0) {
        const res = await extraerTextoDeArchivo(file);
        texto = res.texto;
        origen = res.origen;
        aviso = res.aviso;
      } else if (pegado) {
        texto = pegado;
      }
    } else {
      const body = await req.json().catch(() => ({} as any));
      texto = String(body?.text ?? "").trim();
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "No se pudo leer el archivo." }, { status: 400 });
  }

  if (!texto.trim()) {
    return NextResponse.json({ error: "No hay nada que analizar. Pega el cuadro o carga el archivo." }, { status: 400 });
  }

  const { filas, ignoradas } = analizarTexto(texto);
  if (!filas.length) {
    return NextResponse.json(
      {
        error:
          "No se reconoció ningún bus en el reporte. Verifica que cada fila empiece por el código del bus (K1408, K1506...).",
        ignoradas,
      },
      { status: 422 }
    );
  }

  // Validar los buses contra la flota y mirar si ya tienen novedades abiertas.
  const codigos = filas.map((f) => f.busCode);
  const buses = await prisma.bus.findMany({
    where: { tenantId, code: { in: codigos } },
    select: { id: true, code: true, plate: true },
  });
  const busByCode = new Map(buses.map((b) => [b.code, b]));

  const abiertas = buses.length
    ? await prisma.case.findMany({
        where: {
          tenantId,
          type: CaseType.NOVEDAD,
          busId: { in: buses.map((b) => b.id) },
          status: { notIn: [CaseStatus.CERRADO] },
        },
        select: { id: true, caseNo: true, title: true, busId: true, status: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const abiertasPorBus = new Map<string, typeof abiertas>();
  for (const c of abiertas) {
    const lista = abiertasPorBus.get(c.busId) ?? [];
    lista.push(c);
    abiertasPorBus.set(c.busId, lista);
  }

  const resultado = filas.map((f) => {
    const bus = busByCode.get(f.busCode) ?? null;
    const previas = bus ? (abiertasPorBus.get(bus.id) ?? []) : [];
    return {
      busCode: f.busCode,
      busIp: f.busIp,
      busId: bus?.id ?? null,
      placa: bus?.plate ?? null,
      existeEnFlota: Boolean(bus),
      cameras: f.cameras.map((c) => ({ name: c.name, ip: c.ip, raw: c.raw, desconocida: c.desconocida })),
      avisos: [
        ...f.avisos,
        ...(bus ? [] : ["Este bus no existe en la flota; no se creará el ticket."]),
      ],
      novedadesAbiertas: previas.slice(0, 3).map((c) => ({
        caseNo: c.caseNo,
        title: c.title,
        status: c.status,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  });

  return NextResponse.json({
    ok: true,
    origen,
    aviso,
    filas: resultado,
    ignoradas,
    totales: {
      buses: resultado.length,
      camaras: resultado.reduce((n, f) => n + f.cameras.length, 0),
      sinFlota: resultado.filter((f) => !f.existeEnFlota).length,
    },
  });
}
