// Datos del panel "Resumen" de Casos (solo servidor: usa prisma).
import { prisma } from "@/lib/prisma";
import { CaseStatus, CaseEventType } from "@prisma/client";
import { slaDeadlineMs } from "@/lib/cases/sla";

const DAY = 86400000;
const COT_MS = 5 * 3600 * 1000;

function cotKey(d: Date): string {
  return new Date(d.getTime() - COT_MS).toISOString().slice(0, 10);
}
function fmtLabel(key: string): string {
  const [, m, d] = key.split("-");
  return `${d}/${m}`;
}

export type CasesSummary = {
  atendidos: number;
  pendientes: number;
  vencidos: number;
  series: { date: string; creados: number; resueltos: number }[];
  porEstado: { label: string; value: number; color: string }[];
};

export async function getCasesSummary(opts: {
  tenantId: string;
  extraWhere?: any;
  monthKey: string; // "YYYY-MM" en hora Colombia
}): Promise<CasesSummary> {
  const { tenantId, extraWhere = {}, monthKey } = opts;
  const base = { tenantId, ...extraWhere };

  const monthStart = new Date(`${monthKey}-01T05:00:00.000Z`);
  const [yy, mm] = monthKey.split("-").map(Number);
  const nextMonthKey = mm === 12 ? `${yy + 1}-01` : `${yy}-${String(mm + 1).padStart(2, "0")}`;
  const monthEnd = new Date(`${nextMonthKey}-01T05:00:00.000Z`);

  const openStatuses = [CaseStatus.NUEVO, CaseStatus.OT_ASIGNADA, CaseStatus.EN_EJECUCION];
  const doneStatuses = [CaseStatus.RESUELTO, CaseStatus.CERRADO];

  const seriesStart = new Date(Date.now() - 29 * DAY);

  const [pendientes, openRows, grouped, creadosRows, doneCases] = await Promise.all([
    prisma.case.count({ where: { ...base, status: { in: openStatuses } } }),
    prisma.case.findMany({
      where: { ...base, status: { in: openStatuses } },
      select: { createdAt: true, priority: true },
    }),
    prisma.case.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
    prisma.case.findMany({
      where: { ...base, createdAt: { gte: seriesStart } },
      select: { createdAt: true },
    }),
    // Casos resueltos/cerrados con su ÚLTIMO evento de cambio de estado = fecha REAL de resolución
    // (no usamos updatedAt: cualquier edición —p.ej. reasignar responsable— lo pondría en hoy).
    prisma.case.findMany({
      where: { ...base, status: { in: doneStatuses } },
      select: {
        updatedAt: true,
        events: { where: { type: CaseEventType.STATUS_CHANGE }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      },
    }),
  ]);

  // Fecha real de resolución = createdAt del último STATUS_CHANGE; si no hay, updatedAt.
  const resolvedAtOf = (c: { updatedAt: Date; events: { createdAt: Date }[] }): Date => c.events[0]?.createdAt ?? c.updatedAt;
  const atendidos = doneCases.filter((c) => {
    const r = resolvedAtOf(c);
    return r >= monthStart && r < monthEnd;
  }).length;

  const keys: string[] = [];
  const now = Date.now();
  for (let k = 29; k >= 0; k--) keys.push(cotKey(new Date(now - k * DAY)));
  const cMap = new Map<string, number>(keys.map((k) => [k, 0]));
  const rMap = new Map<string, number>(keys.map((k) => [k, 0]));
  for (const r of creadosRows) {
    const k = cotKey(r.createdAt);
    if (cMap.has(k)) cMap.set(k, (cMap.get(k) ?? 0) + 1);
  }
  for (const c of doneCases) {
    const r = resolvedAtOf(c);
    if (r.getTime() < seriesStart.getTime()) continue;
    const k = cotKey(r);
    if (rMap.has(k)) rMap.set(k, (rMap.get(k) ?? 0) + 1);
  }
  const series = keys.map((k) => ({
    date: fmtLabel(k),
    creados: cMap.get(k) ?? 0,
    resueltos: rMap.get(k) ?? 0,
  }));

  const nowMs = Date.now();
  const vencidos = openRows.filter((r) => slaDeadlineMs(r.createdAt, r.priority) < nowMs).length;

  const cnt: Record<string, number> = {};
  for (const g of grouped) cnt[g.status] = g._count._all;
  const ESTADO = [
    { key: "NUEVO", label: "Nuevo", color: "#2563eb" },
    { key: "OT_ASIGNADA", label: "OT asignada", color: "#06b6d4" },
    { key: "EN_EJECUCION", label: "En ejecución", color: "#f59e0b" },
    { key: "RESUELTO", label: "Resuelto", color: "#16a34a" },
    { key: "CERRADO", label: "Cerrado", color: "#64748b" },
  ];
  const porEstado = ESTADO.map((e) => ({ label: e.label, value: cnt[e.key] ?? 0, color: e.color })).filter(
    (x) => x.value > 0
  );

  return { atendidos, pendientes, vencidos, series, porEstado };
}

// Etiquetas de meses recientes (para el selector del Resumen), en hora Colombia.
export function recentMonths(n = 6): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const now = new Date();
  const baseY = now.getUTCFullYear();
  const baseM = now.getUTCMonth(); // 0-11
  const MES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(baseY, baseM - i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    out.push({ key: `${y}-${String(m + 1).padStart(2, "0")}`, label: `${MES[m]} ${y}` });
  }
  return out;
}
