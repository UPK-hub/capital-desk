import { prisma } from "@/lib/prisma";
import { CaseType } from "@prisma/client";

const MONTH_LABELS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export type BusReportRow = {
  busId: string;
  code: string;
  plate: string | null;
  prev: number;
  corr: number;
  video: number;
  ot: number;
  total: number;
};

export type BusesReport = {
  year: number;
  month: number; // 0 = todos los meses, 1-12 = mes específico
  months: { label: string; prev: number; corr: number; video: number; ot: number }[];
  buses: BusReportRow[];
  kpis: { prev: number; corr: number; video: number; ot: number };
};

/**
 * Agrega la actividad de la flota por mes y por bus:
 * - Preventivos / Correctivos / Solicitudes de video = casos por tipo.
 * - OTs = órdenes de trabajo.
 * El gráfico mensual cubre los 12 meses del año; los KPIs y la tabla por bus
 * se acotan al mes elegido (month) o a todo el año (month = 0).
 */
export async function buildBusesReport(params: { tenantId: string; year: number; month?: number }): Promise<BusesReport> {
  const { tenantId } = params;
  const year = params.year;
  const month = params.month && params.month >= 1 && params.month <= 12 ? params.month : 0;
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);

  const [cases, wos] = await Promise.all([
    prisma.case.findMany({
      where: {
        tenantId,
        type: { in: [CaseType.PREVENTIVO, CaseType.CORRECTIVO, CaseType.SOLICITUD_DESCARGA_VIDEO] },
        createdAt: { gte: start, lt: end },
      },
      select: { type: true, createdAt: true, busId: true, bus: { select: { code: true, plate: true } } },
    }),
    prisma.workOrder.findMany({
      where: { tenantId, createdAt: { gte: start, lt: end } },
      select: { createdAt: true, case: { select: { busId: true, bus: { select: { code: true, plate: true } } } } },
    }),
  ]);

  const months = MONTH_LABELS.map((label) => ({ label, prev: 0, corr: 0, video: 0, ot: 0 }));
  for (const c of cases) {
    const m = new Date(c.createdAt).getMonth();
    if (c.type === "PREVENTIVO") months[m].prev++;
    else if (c.type === "CORRECTIVO") months[m].corr++;
    else if (c.type === "SOLICITUD_DESCARGA_VIDEO") months[m].video++;
  }
  for (const w of wos) {
    const m = new Date(w.createdAt).getMonth();
    months[m].ot++;
  }

  const inMonth = (d: Date | string) => (month ? new Date(d).getMonth() === month - 1 : true);
  const map = new Map<string, BusReportRow>();
  const getRow = (busId: string, code: string, plate: string | null) => {
    let r = map.get(busId);
    if (!r) {
      r = { busId, code, plate, prev: 0, corr: 0, video: 0, ot: 0, total: 0 };
      map.set(busId, r);
    }
    return r;
  };
  for (const c of cases) {
    if (!inMonth(c.createdAt)) continue;
    const r = getRow(c.busId, c.bus.code, c.bus.plate);
    if (c.type === "PREVENTIVO") r.prev++;
    else if (c.type === "CORRECTIVO") r.corr++;
    else if (c.type === "SOLICITUD_DESCARGA_VIDEO") r.video++;
  }
  for (const w of wos) {
    if (!inMonth(w.createdAt) || !w.case) continue;
    const r = getRow(w.case.busId, w.case.bus.code, w.case.bus.plate);
    r.ot++;
  }

  const buses = [...map.values()]
    .map((r) => ({ ...r, total: r.prev + r.corr + r.video + r.ot }))
    .sort((a, b) => b.total - a.total);
  const kpis = buses.reduce(
    (acc, r) => ({ prev: acc.prev + r.prev, corr: acc.corr + r.corr, video: acc.video + r.video, ot: acc.ot + r.ot }),
    { prev: 0, corr: 0, video: 0, ot: 0 }
  );

  return { year, month, months, buses, kpis };
}
