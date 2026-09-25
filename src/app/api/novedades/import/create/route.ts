/**
 * Creación de las novedades a partir del reporte ya revisado.
 *
 *   POST /api/novedades/import/create
 *   {
 *     "fechaReporte": "2026-09-23",
 *     "filas": [ { "busCode": "K1506", "busIp": "172.23.22.100",
 *                  "cameras": [ { "name": "BV2_1", "ip": "172.16.6.9" } ] } ]
 *   }
 *
 * Crea UNA novedad por bus, fechada el día del reporte del cliente, vinculando
 * las cámaras del inventario que coincidan por ubicación.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CaseEventType, CaseStatus, CaseType, Role } from "@prisma/client";
import { nextNumbers } from "@/lib/tenant-sequence";
import { loadNovedadCatalog } from "@/lib/novedad-catalog";
import { isCameraEquipment } from "@/lib/equipment-category";
import { parsePerformedDateInput, performedDateInputValue } from "@/lib/cases/performed-at";
import {
  CODIGO_NOVEDAD_CAMARA,
  ORIGEN_IMPORTACION,
  analizarTexto,
  descripcionNovedad,
  tituloNovedad,
} from "@/lib/novedades/import-camaras";

type CamaraEntrada = { name?: string; ip?: string | null };
type FilaEntrada = {
  busCode?: string;
  busIp?: string | null;
  cameras?: CamaraEntrada[];
  /** Alternativa a `cameras`: el listado tal como quedó en la pantalla de revisión. */
  camerasText?: string;
};

/** Convierte el texto editado de una fila en cámaras, con el mismo parser. */
function camarasDesdeTexto(busCode: string, texto: string) {
  const { filas } = analizarTexto(`${busCode} ${texto}`);
  const fila = filas[0];
  if (!fila) return [];
  return fila.cameras.map((c) => ({ name: c.name, ip: c.ip }));
}

/** Compara nombres de cámara ignorando guiones bajos, espacios y acentos. */
function clave(valor?: string | null) {
  return String(valor ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = (session.user as any).role as Role;
  if (![Role.ADMIN, Role.BACKOFFICE, Role.SUPERVISOR, Role.HELPDESK].includes(role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;

  const body = await req.json().catch(() => ({} as any));
  const fecha = parsePerformedDateInput(String(body?.fechaReporte ?? ""));
  if (!fecha) {
    return NextResponse.json({ error: "Indica la fecha del reporte del cliente (dd/mm/aaaa)." }, { status: 400 });
  }
  if (fecha.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "La fecha del reporte no puede ser futura." }, { status: 400 });
  }

  const filasEntrada: FilaEntrada[] = Array.isArray(body?.filas) ? body.filas : [];
  const filas = filasEntrada
    .map((f) => ({
      busCode: String(f?.busCode ?? "").trim().toUpperCase(),
      busIp: f?.busIp ? String(f.busIp).trim() : null,
      cameras: (f?.camerasText && String(f.camerasText).trim()
        ? camarasDesdeTexto(String(f?.busCode ?? ""), String(f.camerasText))
        : (Array.isArray(f?.cameras) ? f.cameras : []).map((c) => ({
            name: String(c?.name ?? "").trim(),
            ip: c?.ip ? String(c.ip).trim() : null,
          }))
      ).filter((c) => c.name.length > 0),
    }))
    .filter((f) => f.busCode && f.cameras.length);

  if (!filas.length) {
    return NextResponse.json({ error: "No hay filas válidas para crear." }, { status: 400 });
  }

  const buses = await prisma.bus.findMany({
    where: { tenantId, code: { in: filas.map((f) => f.busCode) } },
    select: { id: true, code: true },
  });
  const busByCode = new Map(buses.map((b) => [b.code, b]));

  // Prioridad del catálogo para NVD-300 (cámara sin video).
  let prioridad = 3;
  try {
    const catalogo = await loadNovedadCatalog();
    const items: any[] = Array.isArray((catalogo as any)?.items) ? (catalogo as any).items : (catalogo as any);
    const item = items?.find?.((i: any) => i?.code === CODIGO_NOVEDAD_CAMARA);
    if (item?.priorityValue && Number.isInteger(item.priorityValue)) prioridad = item.priorityValue;
  } catch {
    /* si el catálogo no carga, se queda la prioridad media */
  }

  const autor = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  const fechaTexto = performedDateInputValue(fecha).split("-").reverse().join("/");

  const creados: Array<{ busCode: string; caseNo: number | null; caseId: string; camaras: number }> = [];
  const omitidos: Array<{ busCode: string; motivo: string }> = [];

  for (const fila of filas) {
    const bus = busByCode.get(fila.busCode);
    if (!bus) {
      omitidos.push({ busCode: fila.busCode, motivo: "El bus no existe en la flota." });
      continue;
    }

    // Vincular las cámaras del inventario que coincidan por ubicación.
    const equipos = await prisma.busEquipment.findMany({
      where: { busId: bus.id, active: true },
      select: { id: true, serial: true, location: true, equipmentType: { select: { name: true } } },
    });
    const camarasBus = equipos.filter((e) => isCameraEquipment(e.equipmentType?.name, e.location));
    const vinculados: { id: string; label: string }[] = [];
    for (const cam of fila.cameras) {
      const k = clave(cam.name);
      const match = camarasBus.find((e) => clave(e.location) === k);
      if (match && !vinculados.some((v) => v.id === match.id)) {
        vinculados.push({
          id: match.id,
          label: `${match.location ?? "Cámara"}${match.serial ? ` (${match.serial})` : ""}`,
        });
      }
    }

    const filaParser = { busCode: fila.busCode, busIp: fila.busIp, cameras: fila.cameras.map((c) => ({ ...c, raw: c.name, desconocida: false })), avisos: [] as string[] };

    try {
      const creado = await prisma.$transaction(async (tx) => {
        const { caseNo } = await nextNumbers(tx as any, tenantId, { case: true });
        const novedad = await tx.case.create({
          data: {
            tenantId,
            caseNo: caseNo!,
            type: CaseType.NOVEDAD,
            status: CaseStatus.NUEVO,
            priority: prioridad,
            title: tituloNovedad(filaParser as any),
            description: descripcionNovedad(filaParser as any, {
              fechaReporte: fechaTexto,
              equiposVinculados: vinculados.map((v) => v.label),
              creador: autor?.name ?? null,
            }),
            busId: bus.id,
            // El ticket queda con la fecha en que el cliente reportó, no con la
            // fecha en que se cargó el archivo.
            createdAt: fecha,
          },
          select: { id: true, caseNo: true },
        });

        if (vinculados.length) {
          await tx.caseEquipment.createMany({
            data: vinculados.map((v) => ({ caseId: novedad.id, busEquipmentId: v.id })),
            skipDuplicates: true,
          });
        }

        await tx.caseEvent.create({
          data: {
            caseId: novedad.id,
            type: CaseEventType.CREATED,
            message: `Novedad creada desde el reporte de cámaras offline del ${fechaTexto}.`,
            // El creador del caso se toma de meta.userId (ver /api/cases/creators).
            meta: {
              userId,
              source: ORIGEN_IMPORTACION,
              channel: "importacion",
              catalogCode: CODIGO_NOVEDAD_CAMARA,
              affectedEquipment: "CAMARAS",
              reportedAt: fecha.toISOString(),
              busIp: fila.busIp,
              cameras: fila.cameras,
              busEquipmentIds: vinculados.map((v) => v.id),
            },
            createdAt: fecha,
          },
        });

        return novedad;
      });

      creados.push({
        busCode: fila.busCode,
        caseNo: creado.caseNo ?? null,
        caseId: creado.id,
        camaras: fila.cameras.length,
      });
    } catch (e: any) {
      console.error("IMPORT_CAMARAS_OFFLINE_FALLO", { busCode: fila.busCode, error: String(e?.message ?? e) });
      omitidos.push({ busCode: fila.busCode, motivo: "Error al crear el ticket. Revisa el log del servidor." });
    }
  }

  return NextResponse.json({
    ok: true,
    fechaReporte: performedDateInputValue(fecha),
    creados,
    omitidos,
    total: creados.length,
  });
}
