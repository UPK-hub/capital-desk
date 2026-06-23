// ============================================================================
// Resolución de datos de cada widget del tablero (SOLO servidor: usa prisma).
// ============================================================================
import { prisma } from "@/lib/prisma";
import {
  CaseStatus,
  CaseType,
  Role,
  StsTelemetryKind,
  StsTicketStatus,
  VideoCaseStatus,
  WorkOrderStatus,
} from "@prisma/client";
import { isVideosOnlyBackoffice, ownCasesWhere } from "@/lib/access-control";
import {
  type AccessFlags,
  getMetric,
  CASE_STATUS_LABEL,
  CASE_STATUS_COLOR,
  WO_STATUS_LABEL,
  WO_STATUS_COLOR,
  VIDEO_STATUS_LABEL,
  VIDEO_STATUS_COLOR,
  STS_SEVERITY_LABEL,
  STS_SEVERITY_COLOR,
} from "@/lib/dashboard/catalog";

export type ResolveCtx = {
  tenantId: string;
  userId: string;
  role: Role;
  caps: string[] | undefined;
  flags: AccessFlags;
  rangeDays: number;
};

export type ListItem = {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  tone?: string;
};

export type WidgetResult =
  | {
      kind: "scalar";
      value: number;
      spark?: number[];
      delta?: { value: number; unit: "%" | "abs"; dir: "up" | "down" | "flat" };
    }
  | {
      kind: "series";
      label: string;
      label2?: string;
      accent2?: string;
      points: { date: string; value: number; value2?: number }[];
    }
  | { kind: "breakdown"; items: { label: string; value: number; color: string }[] }
  | { kind: "list"; items: ListItem[] }
  | { kind: "error"; message: string };

// ---- Helpers de fechas (Colombia, UTC-5, sin horario de verano) ----
const DAY = 86400000;
const COT_MS = 5 * 3600 * 1000;

function cotKey(d: Date): string {
  return new Date(d.getTime() - COT_MS).toISOString().slice(0, 10);
}
function dayLabels(n: number): string[] {
  const out: string[] = [];
  const now = Date.now();
  for (let k = n - 1; k >= 0; k--) out.push(cotKey(new Date(now - k * DAY)));
  return out;
}
function startInstant(n: number): Date {
  const first = dayLabels(n)[0]; // YYYY-MM-DD en hora Colombia
  return new Date(`${first}T05:00:00.000Z`); // medianoche COT en UTC
}
function fmtLabel(key: string): string {
  const [, m, d] = key.split("-");
  return `${d}/${m}`;
}
function bucketByDay(dates: Date[], n: number): { date: string; value: number }[] {
  const keys = dayLabels(n);
  const map = new Map<string, number>(keys.map((k) => [k, 0]));
  for (const d of dates) {
    const k = cotKey(d);
    if (map.has(k)) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return keys.map((k) => ({ date: fmtLabel(k), value: map.get(k) ?? 0 }));
}
function clampRange(n: number): number {
  return [7, 14, 30, 90].includes(n) ? n : 14;
}

// Mini-serie (sparkline) de los últimos n días + variación vs. el período
// anterior de igual duración. Usa el campo de fecha de creación de la entidad.
async function sparkAndDelta(
  model: string,
  where: any,
  dateField: string,
  n: number
): Promise<{
  spark: number[];
  delta: { value: number; unit: "%" | "abs"; dir: "up" | "down" | "flat" } | null;
}> {
  const span = n * 2;
  const rows: any[] = await (prisma as any)[model].findMany({
    where: { ...where, [dateField]: { gte: startInstant(span) } },
    select: { [dateField]: true },
  });
  const keys = dayLabels(span);
  const map = new Map<string, number>(keys.map((k) => [k, 0]));
  for (const r of rows) {
    const k = cotKey(r[dateField] as Date);
    if (map.has(k)) map.set(k, (map.get(k) ?? 0) + 1);
  }
  const vals = keys.map((k) => map.get(k) ?? 0);
  const prev = vals.slice(0, n);
  const cur = vals.slice(n);
  const curSum = cur.reduce((a, b) => a + b, 0);
  const prevSum = prev.reduce((a, b) => a + b, 0);
  const absChange = curSum - prevSum;
  const dir: "up" | "down" | "flat" =
    absChange > 0 ? "up" : absChange < 0 ? "down" : "flat";
  let value: number;
  let unit: "%" | "abs";
  if (prevSum >= 4) {
    // Base suficiente: porcentaje (con tope para que no salga gigante).
    value = Math.min(Math.round((Math.abs(absChange) / prevSum) * 100), 999);
    unit = "%";
  } else {
    // Base muy pequeña: el porcentaje engaña, mejor el cambio absoluto.
    value = Math.abs(absChange);
    unit = "abs";
  }
  const delta = curSum === 0 && prevSum === 0 ? null : { value, unit, dir };
  return { spark: cur, delta };
}

// ---- Helpers de alcance (qué puede ver el usuario) ----
function videoCaseWhere(ctx: ResolveCtx): any {
  const videosOnly = isVideosOnlyBackoffice(ctx.role, ctx.caps);
  return { tenantId: ctx.tenantId, ...(videosOnly ? ownCasesWhere(ctx.userId) : {}) };
}
function woScope(ctx: ResolveCtx): any {
  if (ctx.role === Role.TECHNICIAN && !ctx.flags.isAdmin) {
    return { tenantId: ctx.tenantId, assignedToId: ctx.userId };
  }
  return { tenantId: ctx.tenantId };
}

async function groupCount(
  model: string,
  where: any,
  field: string
): Promise<{ key: string; value: number }[]> {
  const rows: any[] = await (prisma as any)[model].groupBy({
    by: [field],
    where,
    _count: { _all: true },
  });
  return rows.map((r) => ({ key: String(r[field]), value: r._count?._all ?? 0 }));
}

function breakdown(
  rows: { key: string; value: number }[],
  labels: Record<string, string>,
  colors: Record<string, string>
): WidgetResult {
  const order = Object.keys(labels);
  const sorted = [...rows].sort(
    (a, b) => order.indexOf(a.key) - order.indexOf(b.key)
  );
  return {
    kind: "breakdown",
    items: sorted.map((r) => ({
      label: labels[r.key] ?? r.key,
      value: r.value,
      color: colors[r.key] ?? "#64748b",
    })),
  };
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
function woTone(s: string): string {
  return s === "EN_CAMPO" ? "amber" : s === "EN_VALIDACION" ? "violet" : "blue";
}
function videoTone(s: string): string {
  return s === "EN_CURSO" ? "blue" : "amber";
}
function sevTone(s: string): string {
  return s === "EMERGENCY" ? "red" : s === "HIGH" || s === "MEDIUM" ? "amber" : "green";
}

async function misPendientes(ctx: ResolveCtx): Promise<WidgetResult> {
  const items: ListItem[] = [];
  const [wos, vids, sts] = await Promise.all([
    prisma.workOrder.findMany({
      where: {
        tenantId: ctx.tenantId,
        assignedToId: ctx.userId,
        status: { not: WorkOrderStatus.FINALIZADA },
      },
      select: { id: true, workOrderNo: true, status: true, case: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.videoDownloadRequest.findMany({
      where: {
        assignedToId: ctx.userId,
        status: { not: VideoCaseStatus.COMPLETADO },
        case: { tenantId: ctx.tenantId },
      },
      select: { id: true, status: true, case: { select: { title: true, caseNo: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.stsTicket.findMany({
      where: {
        tenantId: ctx.tenantId,
        assignedToId: ctx.userId,
        status: {
          in: [
            StsTicketStatus.OPEN,
            StsTicketStatus.IN_PROGRESS,
            StsTicketStatus.WAITING_VENDOR,
          ],
        },
      },
      select: { id: true, description: true, severity: true },
      orderBy: { openedAt: "desc" },
      take: 8,
    }),
  ]);

  for (const w of wos) {
    items.push({
      id: `wo-${w.id}`,
      title: w.case?.title ?? `OT ${w.workOrderNo ?? ""}`.trim(),
      subtitle: "Orden de trabajo",
      badge: WO_STATUS_LABEL[w.status] ?? w.status,
      tone: woTone(w.status),
    });
  }
  for (const v of vids) {
    items.push({
      id: `vid-${v.id}`,
      title: v.case?.title ?? `Video ${v.case?.caseNo ?? ""}`.trim(),
      subtitle: "Solicitud de video",
      badge: VIDEO_STATUS_LABEL[v.status] ?? v.status,
      tone: videoTone(v.status),
    });
  }
  for (const t of sts) {
    items.push({
      id: `sts-${t.id}`,
      title: truncate(t.description, 70),
      subtitle: "Ticket STS",
      badge: STS_SEVERITY_LABEL[t.severity] ?? t.severity,
      tone: sevTone(t.severity),
    });
  }

  return { kind: "list", items: items.slice(0, 15) };
}

export async function resolveWidget(
  ctx: ResolveCtx,
  metricKey: string
): Promise<WidgetResult> {
  const m = getMetric(metricKey);
  if (!m) return { kind: "error", message: "Métrica desconocida" };
  if (!m.can(ctx.flags)) return { kind: "error", message: "Sin acceso" };
  const n = clampRange(ctx.rangeDays);

  try {
    switch (metricKey) {
      // ---- KPIs ----
      case "casos_abiertos": {
        const value = await prisma.case.count({
          where: {
            tenantId: ctx.tenantId,
            status: {
              in: [CaseStatus.NUEVO, CaseStatus.OT_ASIGNADA, CaseStatus.EN_EJECUCION],
            },
          },
        });
        const sd = await sparkAndDelta("case", { tenantId: ctx.tenantId }, "createdAt", n);
        return { kind: "scalar", value, spark: sd.spark, delta: sd.delta ?? undefined };
      }
      case "videos_pendientes": {
        const value = await prisma.videoDownloadRequest.count({
          where: {
            case: videoCaseWhere(ctx),
            status: { in: [VideoCaseStatus.EN_ESPERA, VideoCaseStatus.EN_CURSO] },
          },
        });
        const sd = await sparkAndDelta(
          "videoDownloadRequest",
          { case: videoCaseWhere(ctx) },
          "createdAt",
          n
        );
        return { kind: "scalar", value, spark: sd.spark, delta: sd.delta ?? undefined };
      }
      case "ots_activas": {
        const value = await prisma.workOrder.count({
          where: { ...woScope(ctx), status: { not: WorkOrderStatus.FINALIZADA } },
        });
        const sd = await sparkAndDelta("workOrder", woScope(ctx), "createdAt", n);
        return { kind: "scalar", value, spark: sd.spark, delta: sd.delta ?? undefined };
      }
      case "sts_abiertos": {
        const value = await prisma.stsTicket.count({
          where: {
            tenantId: ctx.tenantId,
            status: { in: [StsTicketStatus.OPEN, StsTicketStatus.IN_PROGRESS] },
          },
        });
        const sd = await sparkAndDelta("stsTicket", { tenantId: ctx.tenantId }, "openedAt", n);
        return { kind: "scalar", value, spark: sd.spark, delta: sd.delta ?? undefined };
      }
      case "tecnicos_activos":
        return {
          kind: "scalar",
          value: await prisma.user.count({
            where: { tenantId: ctx.tenantId, role: Role.TECHNICIAN, active: true },
          }),
        };

      // ---- Series por día ----
      case "casos_creados_series": {
        const rows = await prisma.case.findMany({
          where: { tenantId: ctx.tenantId, createdAt: { gte: startInstant(n) } },
          select: { createdAt: true },
        });
        return { kind: "series", label: "Casos", points: bucketByDay(rows.map((r) => r.createdAt), n) };
      }
      case "casos_actividad_series": {
        const start = startInstant(n);
        const [creados, resueltos] = await Promise.all([
          prisma.case.findMany({
            where: { tenantId: ctx.tenantId, createdAt: { gte: start } },
            select: { createdAt: true },
          }),
          prisma.case.findMany({
            where: {
              tenantId: ctx.tenantId,
              status: { in: [CaseStatus.RESUELTO, CaseStatus.CERRADO] },
              updatedAt: { gte: start },
            },
            select: { updatedAt: true },
          }),
        ]);
        const a = bucketByDay(creados.map((r) => r.createdAt), n);
        const b = bucketByDay(resueltos.map((r) => r.updatedAt), n);
        const points = a.map((p, i) => ({
          date: p.date,
          value: p.value,
          value2: b[i]?.value ?? 0,
        }));
        return {
          kind: "series",
          label: "Creados",
          label2: "Resueltos",
          accent2: "#16a34a",
          points,
        };
      }
      case "preventivos_mes": {
        const monthKey = cotKey(new Date()).slice(0, 7); // YYYY-MM (Colombia)
        const monthStart = new Date(`${monthKey}-01T05:00:00.000Z`);
        const value = await prisma.case.count({
          where: {
            tenantId: ctx.tenantId,
            type: CaseType.PREVENTIVO,
            createdAt: { gte: monthStart },
          },
        });
        const sd = await sparkAndDelta(
          "case",
          { tenantId: ctx.tenantId, type: CaseType.PREVENTIVO },
          "createdAt",
          n
        );
        return { kind: "scalar", value, spark: sd.spark, delta: sd.delta ?? undefined };
      }
      case "preventivos_series": {
        const rows = await prisma.case.findMany({
          where: {
            tenantId: ctx.tenantId,
            type: CaseType.PREVENTIVO,
            createdAt: { gte: startInstant(n) },
          },
          select: { createdAt: true },
        });
        return {
          kind: "series",
          label: "Preventivos",
          points: bucketByDay(rows.map((r) => r.createdAt), n),
        };
      }
      case "videos_creados_series": {
        const rows = await prisma.videoDownloadRequest.findMany({
          where: { case: videoCaseWhere(ctx), createdAt: { gte: startInstant(n) } },
          select: { createdAt: true },
        });
        return { kind: "series", label: "Videos", points: bucketByDay(rows.map((r) => r.createdAt), n) };
      }
      case "ots_creadas_series": {
        const rows = await prisma.workOrder.findMany({
          where: { ...woScope(ctx), createdAt: { gte: startInstant(n) } },
          select: { createdAt: true },
        });
        return { kind: "series", label: "OTs", points: bucketByDay(rows.map((r) => r.createdAt), n) };
      }
      case "sts_abiertos_series": {
        const rows = await prisma.stsTicket.findMany({
          where: { tenantId: ctx.tenantId, openedAt: { gte: startInstant(n) } },
          select: { openedAt: true },
        });
        return { kind: "series", label: "Tickets", points: bucketByDay(rows.map((r) => r.openedAt), n) };
      }
      case "telemetria_tramas_series": {
        const rows = await prisma.telemetryDailyRollup.groupBy({
          by: ["day"],
          where: {
            tenantId: ctx.tenantId,
            kind: StsTelemetryKind.TRAMAS,
            day: { gte: new Date(`${dayLabels(n)[0]}T00:00:00.000Z`) },
          },
          _sum: { count: true },
        });
        const map = new Map<string, number>();
        for (const r of rows) {
          map.set(r.day.toISOString().slice(0, 10), r._sum.count ?? 0);
        }
        const points = dayLabels(n).map((k) => ({ date: fmtLabel(k), value: map.get(k) ?? 0 }));
        return { kind: "series", label: "Tramas", points };
      }

      // ---- Distribuciones ----
      case "casos_por_estado":
        return breakdown(
          await groupCount("case", { tenantId: ctx.tenantId }, "status"),
          CASE_STATUS_LABEL,
          CASE_STATUS_COLOR
        );
      case "videos_por_estado":
        return breakdown(
          await groupCount("videoDownloadRequest", { case: videoCaseWhere(ctx) }, "status"),
          VIDEO_STATUS_LABEL,
          VIDEO_STATUS_COLOR
        );
      case "ots_por_estado":
        return breakdown(
          await groupCount("workOrder", woScope(ctx), "status"),
          WO_STATUS_LABEL,
          WO_STATUS_COLOR
        );
      case "sts_por_severidad":
        return breakdown(
          await groupCount("stsTicket", { tenantId: ctx.tenantId }, "severity"),
          STS_SEVERITY_LABEL,
          STS_SEVERITY_COLOR
        );

      // ---- Listas ----
      case "mis_pendientes":
        return await misPendientes(ctx);

      default:
        return { kind: "error", message: "Métrica no implementada" };
    }
  } catch (e) {
    console.error("[dashboard] resolveWidget error", metricKey, e);
    return { kind: "error", message: "Error al cargar datos" };
  }
}

export async function resolveMany(
  ctx: ResolveCtx,
  widgets: { i: string; metric: string }[]
): Promise<Record<string, WidgetResult>> {
  const out: Record<string, WidgetResult> = {};
  await Promise.all(
    widgets.map(async (w) => {
      out[w.i] = await resolveWidget(ctx, w.metric);
    })
  );
  return out;
}
