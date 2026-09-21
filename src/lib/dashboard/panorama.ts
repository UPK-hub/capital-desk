// Panorama operativo del Inicio (solo servidor: usa prisma).
// Reúne, en una sola consulta por bloque, los indicadores que la mesa necesita
// leer de un vistazo: estado de la flota, cumplimiento del preventivo del mes,
// lo que está vencido hoy y la actividad del mes.
import { prisma } from "@/lib/prisma";
import { CaseStatus, CaseType, Prisma } from "@prisma/client";
import { slaDeadlineMs } from "@/lib/cases/sla";
import { getCasesSummary } from "@/lib/cases/summary";

const DIA_MS = 86400000;
// Retención del material de video en los NVR. Una solicitud cuyo evento sea
// anterior a este límite ya no se puede atender: el video no existe.
export const RETENCION_VIDEO_DIAS = 45;
const COT_MS = 5 * 3600 * 1000;

export type EstadoBus = "AL_DIA" | "PENDIENTE" | "CORRECTIVO" | "SIN_REPORTE";

export type Panorama = {
  mesKey: string;
  generadoEn: string;
  flota: {
    total: number;
    alDia: number;
    // Buses con preventivo del mes que, por tener una alerta activa (correctivo
    // abierto o sin reportar), se pintan en otra categoría del muro.
    alDiaConAlerta: number;
    pendiente: number;
    correctivo: number;
    sinReporte: number;
    buses: { code: string; estado: EstadoBus }[];
  };
  cumplimiento: {
    hechos: number;
    meta: number;
    pct: number;
    estaSemana: number;
    ritmoDiario: number;
    requeridoDia: number;
    proyeccion: number;
    diasRestantes: number;
  };
  alertas: {
    casosVencidos: number;
    casoMasAntiguoDias: number;
    videosFueraRetencion: number;
    otsAntiguas: number;
    novedadesSinResponsable: number;
    panicIncompletos: number;
    busesReincidentes: number;
  };
  actividad: {
    dias: string[];
    creados: number[];
    resueltos: number[];
    totalCreados: number;
    totalResueltos: number;
  };
  preventivosHeat: { valores: number[][]; max: number };
  carga: { label: string; value: number }[];
  topBuses: { code: string; falla: string; casos: number }[];
  videoSla: { dentro: number; porSalir: number; fuera: number; diasRetencion: number };
};

/**
 * Preventivos ejecutados dentro de un rango, por bus.
 *
 * Un preventivo se da por ejecutado desde tres fuentes, igual que el cálculo de
 * "último preventivo" que ya usa la Revisión Remota: el cierre de la orden de
 * trabajo, el checklist del bot de preventivos y el cambio de estado del caso a
 * resuelto/cerrado. Mirar solo la OT deja por fuera casi todo, porque muchos
 * preventivos se cierran por el bot o desde el caso sin finalizar la OT.
 */
async function getPreventivosEjecutados(
  tenantId: string,
  desde: Date,
  hasta: Date
): Promise<{ busId: string; at: Date }[]> {
  return prisma.$queryRaw<Array<{ busId: string; at: Date }>>(Prisma.sql`
    SELECT "busId", "at" FROM (
      SELECT c."busId" AS "busId", w."finishedAt" AS "at"
      FROM "WorkOrder" w
      JOIN "Case" c ON c."id" = w."caseId"
      WHERE w."tenantId" = ${tenantId}
        AND w."finishedAt" >= ${desde}
        AND w."finishedAt" < ${hasta}
        AND c."type"::text = 'PREVENTIVO'
        AND c."busId" IS NOT NULL

      UNION ALL

      SELECT c."busId" AS "busId", COALESCE(pc."cierreAt", pc."executedAt") AS "at"
      FROM "CasePreventiveChecklist" pc
      JOIN "Case" c ON c."id" = pc."caseId"
      WHERE c."tenantId" = ${tenantId}
        AND COALESCE(pc."cierreAt", pc."executedAt") >= ${desde}
        AND COALESCE(pc."cierreAt", pc."executedAt") < ${hasta}
        AND c."type"::text = 'PREVENTIVO'
        AND c."busId" IS NOT NULL

      UNION ALL

      SELECT c."busId" AS "busId", e."createdAt" AS "at"
      FROM "CaseEvent" e
      JOIN "Case" c ON c."id" = e."caseId"
      WHERE c."tenantId" = ${tenantId}
        AND c."type"::text = 'PREVENTIVO'
        AND c."status"::text IN ('RESUELTO', 'CERRADO')
        AND e."type"::text = 'STATUS_CHANGE'
        AND e."createdAt" >= ${desde}
        AND e."createdAt" < ${hasta}
        AND (e."message" ILIKE '%cerrad%' OR e."message" ILIKE '%resuelt%')
        AND e."message" NOT ILIKE '%backfill%'
        AND e."message" NOT ILIKE '%unific%'
        AND c."busId" IS NOT NULL
    ) t
    WHERE t."busId" IS NOT NULL AND t."at" IS NOT NULL
  `);
}

/** Fecha local Colombia (para agrupar por día/semana sin depender del servidor). */
function local(d: Date): Date {
  return new Date(d.getTime() - COT_MS);
}

export async function getPanoramaOperativo(opts: {
  tenantId: string;
  monthKey: string; // "YYYY-MM"
}): Promise<Panorama> {
  const { tenantId, monthKey } = opts;
  const ahora = new Date();

  const mesInicio = new Date(`${monthKey}-01T05:00:00.000Z`);
  const [yy, mm] = monthKey.split("-").map(Number);
  const siguiente = mm === 12 ? `${yy + 1}-01` : `${yy}-${String(mm + 1).padStart(2, "0")}`;
  const mesFin = new Date(`${siguiente}-01T05:00:00.000Z`);

  const abiertos = [CaseStatus.NUEVO, CaseStatus.OT_ASIGNADA, CaseStatus.EN_EJECUCION];
  const hace5 = new Date(ahora.getTime() - 5 * DIA_MS);
  const hace7 = new Date(ahora.getTime() - 7 * DIA_MS);
  const hace30 = new Date(ahora.getTime() - 30 * DIA_MS);

  const [
    buses,
    preventivosMes,
    correctivosAbiertos,
    reportanTelemetria,
    casosAbiertos,
    otsAntiguas,
    novedadesSinResp,
    panicIncompletos,
    correctivos30,
    solicitudesVideo,
    resumen,
  ] = await Promise.all([
    prisma.bus.findMany({
      where: { tenantId, active: true },
      select: { id: true, code: true },
      orderBy: { code: "asc" },
    }),
    getPreventivosEjecutados(tenantId, mesInicio, mesFin),
    prisma.case.findMany({
      where: { tenantId, type: CaseType.CORRECTIVO, status: { in: abiertos } },
      select: { busId: true },
    }),
    prisma.telemetryDailyRollup.groupBy({
      by: ["busCode"],
      where: { tenantId, day: { gte: hace5 } },
      _count: { _all: true },
    }),
    prisma.case.findMany({
      where: { tenantId, status: { in: abiertos } },
      select: { createdAt: true, priority: true, type: true },
    }),
    prisma.workOrder.count({
      where: {
        tenantId,
        finishedAt: null,
        createdAt: { lt: hace7 },
        case: { status: { in: abiertos } },
      },
    }),
    prisma.case.count({
      where: { tenantId, type: CaseType.NOVEDAD, status: { in: abiertos }, assignedToId: null },
    }),
    prisma.panicEvent.count({
      where: { tenantId, complete: false, receivedAt: { gte: mesInicio, lt: mesFin } },
    }),
    prisma.case.groupBy({
      by: ["busId"],
      where: { tenantId, type: CaseType.CORRECTIVO, createdAt: { gte: hace30 } },
      _count: { _all: true },
    }),
    prisma.videoDownloadRequest.findMany({
      where: { case: { tenantId, status: { in: abiertos } } },
      select: { eventStart: true },
    }),
    getCasesSummary({ tenantId, monthKey }),
  ]);

  // ---------------------------------------------------------------- flota
  const busesConPreventivo = new Set(preventivosMes.map((r) => r.busId));
  const busesConCorrectivo = new Set(correctivosAbiertos.map((c) => c.busId));
  const codigosQueReportan = new Set(reportanTelemetria.map((r) => r.busCode));

  const estadoDe = (b: { id: string; code: string }): EstadoBus => {
    if (busesConCorrectivo.has(b.id)) return "CORRECTIVO";
    if (!codigosQueReportan.has(b.code)) return "SIN_REPORTE";
    return busesConPreventivo.has(b.id) ? "AL_DIA" : "PENDIENTE";
  };
  const conEstado = buses.map((b) => ({ code: b.code, estado: estadoDe(b) }));
  const cuenta = (e: EstadoBus) => conEstado.filter((b) => b.estado === e).length;

  // ------------------------------------------------------- cumplimiento
  const meta = buses.length;
  const hechos = busesConPreventivo.size;
  const diaHoy = local(ahora).getUTCDate();
  const diasMes = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const mismoMes = local(ahora).getUTCMonth() + 1 === mm && local(ahora).getUTCFullYear() === yy;
  const transcurridos = mismoMes ? diaHoy : diasMes;
  const diasRestantes = mismoMes ? Math.max(0, diasMes - diaHoy) : 0;
  const ritmoDiario = transcurridos > 0 ? hechos / transcurridos : 0;
  const faltan = Math.max(0, meta - hechos);
  const busesEstaSemana = new Set(
    preventivosMes.filter((r) => new Date(r.at) >= hace7).map((r) => r.busId)
  );
  const estaSemana = busesEstaSemana.size;

  // ------------------------------------------------------------ alertas
  const ahoraMs = ahora.getTime();
  const vencidos = casosAbiertos.filter(
    (c) => slaDeadlineMs(c.createdAt, c.priority, c.type) < ahoraMs
  );
  const masAntiguo = vencidos.reduce(
    (max, c) => Math.max(max, ahoraMs - c.createdAt.getTime()),
    0
  );
  const reincidentes = correctivos30.filter((g) => g._count._all >= 3).length;

  // ------------------------------------------------------------ video
  // "Fuera de SLA" en descargas de video NO es el tiempo de atención: es que la
  // fecha del evento solicitado quede fuera de la ventana de retención de los
  // NVR (45 días). Pasado ese punto el material ya no existe y la solicitud no
  // se puede atender, por eso se vigila aparte.
  const limiteRetencion = new Date(ahoraMs - RETENCION_VIDEO_DIAS * DIA_MS);
  const limiteAviso = new Date(ahoraMs - (RETENCION_VIDEO_DIAS - 7) * DIA_MS);
  let videoFuera = 0;
  let videoPorSalir = 0;
  let videoDentro = 0;
  for (const v of solicitudesVideo) {
    if (!v.eventStart) {
      videoDentro += 1;
      continue;
    }
    if (v.eventStart < limiteRetencion) videoFuera += 1;
    else if (v.eventStart < limiteAviso) videoPorSalir += 1;
    else videoDentro += 1;
  }

  // ----------------------------------------- mapa de calor de preventivos
  const semanasMax = 6;
  const valores: number[][] = Array.from({ length: semanasMax }, () => Array(7).fill(0));
  let maxHeat = 0;
  const vistosEnDia = new Set<string>();
  for (const r of preventivosMes) {
    if (!r.at) continue;
    const fecha = new Date(r.at);
    const clave = `${r.busId}|${fecha.toISOString().slice(0, 10)}`;
    if (vistosEnDia.has(clave)) continue; // un bus cuenta una vez por día
    vistosEnDia.add(clave);
    const l = local(fecha);
    const diaMes = l.getUTCDate();
    const diaSemana = (l.getUTCDay() + 6) % 7; // lunes = 0
    const primerDia = local(mesInicio).getUTCDay();
    const desfase = (primerDia + 6) % 7;
    const semana = Math.floor((diaMes - 1 + desfase) / 7);
    if (semana < 0 || semana >= semanasMax) continue;
    valores[semana][diaSemana] += 1;
    if (valores[semana][diaSemana] > maxHeat) maxHeat = valores[semana][diaSemana];
  }
  const semanasUsadas = valores.filter((fila) => fila.some((v) => v > 0)).length || 4;

  // ---------------------------------------------------------- top buses
  const topIds = [...correctivos30]
    .sort((a, b) => b._count._all - a._count._all)
    .slice(0, 5);
  const detallesTop = topIds.length
    ? await prisma.case.findMany({
        where: {
          tenantId,
          type: CaseType.CORRECTIVO,
          createdAt: { gte: hace30 },
          busId: { in: topIds.map((t) => t.busId) },
        },
        orderBy: { createdAt: "desc" },
        select: { busId: true, title: true, bus: { select: { code: true } } },
      })
    : [];
  const topBuses = topIds.map((t) => {
    const ultimo = detallesTop.find((d) => d.busId === t.busId);
    return {
      code: ultimo?.bus.code ?? "—",
      falla: ultimo?.title ?? "Correctivo",
      casos: t._count._all,
    };
  });

  return {
    mesKey: monthKey,
    generadoEn: ahora.toISOString(),
    flota: {
      total: meta,
      alDia: cuenta("AL_DIA"),
      alDiaConAlerta: Math.max(0, hechos - cuenta("AL_DIA")),
      pendiente: cuenta("PENDIENTE"),
      correctivo: cuenta("CORRECTIVO"),
      sinReporte: cuenta("SIN_REPORTE"),
      buses: conEstado,
    },
    cumplimiento: {
      hechos,
      meta,
      pct: meta > 0 ? Math.round((hechos / meta) * 100) : 0,
      estaSemana,
      ritmoDiario: Number(ritmoDiario.toFixed(1)),
      requeridoDia: diasRestantes > 0 ? Number((faltan / diasRestantes).toFixed(1)) : 0,
      proyeccion: Math.min(meta, Math.round(hechos + ritmoDiario * diasRestantes)),
      diasRestantes,
    },
    alertas: {
      casosVencidos: vencidos.length,
      casoMasAntiguoDias: masAntiguo > 0 ? Math.floor(masAntiguo / DIA_MS) : 0,
      videosFueraRetencion: videoFuera,
      otsAntiguas,
      novedadesSinResponsable: novedadesSinResp,
      panicIncompletos,
      busesReincidentes: reincidentes,
    },
    actividad: {
      dias: resumen.series.map((s) => s.date),
      creados: resumen.series.map((s) => s.creados),
      resueltos: resumen.series.map((s) => s.resueltos),
      totalCreados: resumen.creadosMes,
      totalResueltos: resumen.atendidos,
    },
    preventivosHeat: { valores: valores.slice(0, semanasUsadas), max: maxHeat },
    carga: resumen.cargaResponsable.slice(0, 5),
    topBuses,
    videoSla: {
      dentro: videoDentro,
      porSalir: videoPorSalir,
      fuera: videoFuera,
      diasRetencion: RETENCION_VIDEO_DIAS,
    },
  };
}
