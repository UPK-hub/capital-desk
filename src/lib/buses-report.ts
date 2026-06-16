import { prisma } from "@/lib/prisma";
import { CaseType } from "@prisma/client";
import renovData from "@/data/renovacion-tecnologica.json";

const MONTH_LABELS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Mapa código de bus -> fecha de renovación tecnológica (YYYY-MM-DD).
const RENOV: Record<string, string> = renovData as Record<string, string>;
function renovFor(code: string | null | undefined): Date | null {
  if (!code) return null;
  const iso = RENOV[code.trim().toUpperCase()];
  return iso ? new Date(iso + "T00:00:00") : null;
}

export type BusReportRow = {
  busId: string;
  code: string;
  plate: string | null;
  prev: number; // preventivos ejecutados DESDE la renovación (cuentan para cumplimiento)
  prevPre: number; // preventivos ANTES de la renovación (pre renovación tecnológica)
  corr: number;
  video: number;
  ot: number;
  expected: number; // preventivos esperados para este bus en el período (1 por mes desde su renovación)
  renov: string | null; // fecha de renovación (YYYY-MM-DD) o null si no está en el listado
  total: number;
};

export type BusesReport = {
  year: number;
  month: number; // 0 = todos los meses, 1-12 = mes específico
  months: { label: string; prev: number; corr: number; video: number; ot: number }[];
  buses: BusReportRow[];
  kpis: { prev: number; corr: number; video: number; ot: number; expected: number; executed: number };
};

// Preventivos esperados para un bus: 1 por mes A PARTIR DEL MES SIGUIENTE a su renovación.
// El preventivo de cada mes vence al final de ese mes, por eso solo contamos meses ya cumplidos
// (el mes en curso todavía no cuenta como atrasado).
function expectedForBus(renov: Date | null, year: number, month: number, now: Date): number {
  const currentIdx = now.getFullYear() * 12 + (now.getMonth() + 1); // mes en curso (aún no vencido)
  // Primer preventivo: el mes siguiente a la renovación (si no hay fecha, desde enero del año).
  const firstDue = renov ? renov.getFullYear() * 12 + (renov.getMonth() + 1) + 1 : year * 12 + 1;

  if (month >= 1 && month <= 12) {
    const a = year * 12 + month;
    return a >= firstDue && a < currentIdx ? 1 : 0;
  }

  const last = Math.min(year * 12 + 12, currentIdx - 1);
  const first = Math.max(firstDue, year * 12 + 1);
  return Math.max(0, last - first + 1);
}

export async function buildBusesReport(params: { tenantId: string; year: number; month?: number }): Promise<BusesReport> {
  const { tenantId } = params;
  const year = params.year;
  const month = params.month && params.month >= 1 && params.month <= 12 ? params.month : 0;
  const now = new Date();
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);

  const [cases, wos, allBuses] = await Promise.all([
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
    prisma.bus.findMany({
      where: { tenantId, NOT: { code: "BUS_ID" } },
      select: { id: true, code: true, plate: true },
    }),
  ]);

  // Serie mensual (toda la flota) para el gráfico.
  const months = MONTH_LABELS.map((label) => ({ label, prev: 0, corr: 0, video: 0, ot: 0 }));
  for (const c of cases) {
    const m = new Date(c.createdAt).getMonth();
    if (c.type === "PREVENTIVO") months[m].prev++;
    else if (c.type === "CORRECTIVO") months[m].corr++;
    else if (c.type === "SOLICITUD_DESCARGA_VIDEO") months[m].video++;
  }
  for (const w of wos) months[new Date(w.createdAt).getMonth()].ot++;

  // Agregación por bus, acotada al mes elegido (o todo el año).
  const inMonth = (d: Date | string) => (month ? new Date(d).getMonth() === month - 1 : true);
  type Agg = { prev: number; prevPre: number; corr: number; video: number; ot: number };
  const map = new Map<string, Agg>();
  const getAgg = (busId: string) => {
    let r = map.get(busId);
    if (!r) {
      r = { prev: 0, prevPre: 0, corr: 0, video: 0, ot: 0 };
      map.set(busId, r);
    }
    return r;
  };
  for (const c of cases) {
    if (!inMonth(c.createdAt)) continue;
    const r = getAgg(c.busId);
    if (c.type === "PREVENTIVO") {
      const renov = renovFor(c.bus.code);
      if (renov && new Date(c.createdAt) < renov) r.prevPre++;
      else r.prev++;
    } else if (c.type === "CORRECTIVO") r.corr++;
    else if (c.type === "SOLICITUD_DESCARGA_VIDEO") r.video++;
  }
  for (const w of wos) {
    if (!inMonth(w.createdAt) || !w.case) continue;
    getAgg(w.case.busId).ot++;
  }

  // Una fila por CADA bus de la flota (aunque tenga 0) para detectar atrasados.
  const buses: BusReportRow[] = allBuses
    .map((b) => {
      const a = map.get(b.id);
      const prev = a?.prev ?? 0;
      const prevPre = a?.prevPre ?? 0;
      const corr = a?.corr ?? 0;
      const video = a?.video ?? 0;
      const ot = a?.ot ?? 0;
      const renov = renovFor(b.code);
      const expected = expectedForBus(renov, year, month, now);
      return {
        busId: b.id,
        code: b.code,
        plate: b.plate,
        prev,
        prevPre,
        corr,
        video,
        ot,
        expected,
        renov: renov ? renov.toISOString().slice(0, 10) : null,
        total: prev + prevPre + corr + video + ot,
      };
    })
    .sort((a, b) => b.total - a.total || a.code.localeCompare(b.code));

  const kpis = buses.reduce(
    (acc, r) => ({
      prev: acc.prev + r.prev + r.prevPre,
      corr: acc.corr + r.corr,
      video: acc.video + r.video,
      ot: acc.ot + r.ot,
      expected: acc.expected + r.expected,
      executed: acc.executed + r.prev,
    }),
    { prev: 0, corr: 0, video: 0, ot: 0, expected: 0, executed: 0 }
  );

  return { year, month, months, buses, kpis };
}
