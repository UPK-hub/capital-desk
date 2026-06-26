import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CaseEventType, CaseStatus, CaseType, Role } from "@prisma/client";
import { CAPABILITIES } from "@/lib/capabilities";
import { restrictedCasesWhere } from "@/lib/access-control";
import { buildCasesWhere } from "@/lib/cases/filters";
import { getCasesSummary, recentMonths } from "@/lib/cases/summary";
import { resolveDuplicateGroupId } from "@/lib/novedades/duplicates";
import { Select } from "@/components/Field";
import { FileSpreadsheet, Plus } from "lucide-react";
import CasesResumen from "@/components/cases/CasesResumen";
import NovedadesTable, { NovedadRow } from "@/components/novedades/NovedadesTable";
import PorEquipoChart from "@/components/novedades/PorEquipoChart";

type EventLike = { createdAt: Date; meta: unknown };

const EQUIPO_LABEL: Record<string, string> = {
  NVR: "NVR / Grabador",
  CAMARAS: "Cámaras",
  ROUTER_SIM: "Router / SIM",
  SWITCH_POE: "Switch PoE",
  GPS: "GPS",
  CMS: "Centro de Gestión (CMS)",
  IO_SENSORES: "Botón de pánico / Sensores",
  FIRMWARE: "Firmware",
  SOFTWARE: "Software",
  PARAMETRIZACION: "Parametrización",
};
function equipoLabel(v?: string | null): string | null {
  const k = String(v ?? "").trim();
  if (!k) return null;
  return EQUIPO_LABEL[k.toUpperCase()] ?? k;
}

function extractLatestNovedadState(events: EventLike[]): any | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const meta = (events[i].meta ?? {}) as any;
    const state = meta?.noveltyState;
    if (state && typeof state === "object") return state;
  }
  return null;
}
function extractSourceCaseId(events: EventLike[]): string | null {
  for (const event of events) {
    const meta = (event.meta ?? {}) as any;
    if (meta?.sourceCaseId) return String(meta.sourceCaseId);
  }
  return null;
}
function extractBatchRefFromEvents(events: EventLike[]): string | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const meta = (events[i].meta ?? {}) as any;
    if (meta?.noveltyState?.batchRef) return String(meta.noveltyState.batchRef);
    if (meta?.batchRef) return String(meta.batchRef);
  }
  return null;
}
function extractCreatedById(events: Array<{ type?: any; meta: unknown }>): string | null {
  for (const ev of events) {
    if (ev.type !== "CREATED") continue;
    const meta = (ev.meta ?? {}) as any;
    const id = meta?.userId ?? meta?.by ?? meta?.actorUserId;
    if (id && String(id).trim()) return String(id).trim();
  }
  return null;
}
// Fecha real en que la novedad pasó a resuelta/cerrada = createdAt del último
// evento STATUS_CHANGE (no usamos updatedAt porque cambia con cualquier edición).
function extractStatusChangeAt(events: Array<{ type?: any; createdAt: Date }>): string | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i].type === "STATUS_CHANGE") return events[i].createdAt.toISOString();
  }
  return null;
}

export default async function NovedadesPage({ searchParams }: { searchParams: any }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return (
      <div className="sts-card p-4">
        <p className="text-sm">Debes iniciar sesión.</p>
        <Link className="text-sm underline" href="/login">
          Ir a login
        </Link>
      </div>
    );
  }

  const role = (session.user as any).role as Role;
  const caps = (session.user as any).capabilities as string[] | undefined;
  const userId = String((session.user as any).id ?? "");
  const tenantId = (session.user as any).tenantId as string;
  const isVideosOnly = role === Role.BACKOFFICE && caps?.includes(CAPABILITIES.VIDEOS_ONLY);
  if (
    isVideosOnly ||
    (role !== Role.ADMIN && role !== Role.BACKOFFICE && role !== Role.SUPERVISOR && role !== Role.PLANNER)
  ) {
    return (
      <div className="sts-card p-4">
        <p className="text-sm">No autorizado.</p>
      </div>
    );
  }

  const ownOnly = role === Role.BACKOFFICE && !!caps?.includes(CAPABILITIES.OWN_CASES_ONLY);
  const ownWhere = ownOnly ? await restrictedCasesWhere({ tenantId, userId }) : {};
  const { baseWhere, statusWhere, params } = buildCasesWhere(searchParams, { tenantId, ownOnly, userId, ownWhere });
  // Forzamos tipo NOVEDAD (esta bandeja es solo de novedades).
  const novBase: any = { ...baseWhere, type: CaseType.NOVEDAD };

  const months = recentMonths(6);
  const rmonth = (searchParams?.rmonth ? String(searchParams.rmonth) : "") || months[0].key;

  const [noveltyCases, grouped, summary] = await Promise.all([
    prisma.case.findMany({
      where: { ...novBase, ...statusWhere },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        bus: { select: { code: true, plate: true } },
        assignedTo: { select: { name: true } },
        events: { orderBy: { createdAt: "asc" }, select: { type: true, createdAt: true, meta: true } },
      },
    }),
    prisma.case.groupBy({ by: ["status"], where: novBase, _count: { _all: true } }),
    getCasesSummary({ tenantId, extraWhere: { type: CaseType.NOVEDAD, ...ownWhere }, monthKey: rmonth }),
  ]);

  // Correctivos / preventivos enlazados a una novedad (por sourceCaseId o batchRef)
  const since = noveltyCases.length
    ? noveltyCases[noveltyCases.length - 1].createdAt
    : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const correctiveCases = await prisma.case.findMany({
    where: { tenantId, type: { in: [CaseType.CORRECTIVO, CaseType.PREVENTIVO] }, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 800,
    include: {
      workOrder: { select: { id: true, workOrderNo: true, finishedAt: true } },
      events: { orderBy: { createdAt: "asc" }, select: { createdAt: true, meta: true } },
    },
  });
  const corrBySource = new Map<string, (typeof correctiveCases)[number]>();
  const corrByBatch = new Map<string, (typeof correctiveCases)[number]>();
  for (const corr of correctiveCases) {
    const src = extractSourceCaseId(corr.events);
    const batch = extractBatchRefFromEvents(corr.events);
    if (src && !corrBySource.has(src)) corrBySource.set(src, corr);
    if (batch && !corrByBatch.has(batch)) corrByBatch.set(batch, corr);
  }

  // Creador de cada novedad (evento CREATED) + resolución de nombres para la tabla y el filtro
  const creatorByCaseId = new Map<string, string>();
  const creatorIds = new Set<string>();
  for (const c of noveltyCases) {
    const cid = extractCreatedById(c.events);
    if (cid) {
      creatorByCaseId.set(c.id, cid);
      creatorIds.add(cid);
    }
  }
  const creatorUsers = creatorIds.size
    ? await prisma.user.findMany({
        where: { tenantId, id: { in: Array.from(creatorIds) } },
        select: { id: true, name: true },
      })
    : [];
  const userNameById = new Map(creatorUsers.map((u) => [u.id, u.name] as const));
  const creators = [...creatorUsers].sort((a, b) => a.name.localeCompare(b.name));

  // Grupos de "mismo caso" (novedades duplicadas) dentro del conjunto cargado.
  type DupMember = { id: string; caseNo: number | null; createdAt: Date };
  const dupGroupByCase = new Map<string, string | null>();
  const dupGroupMembers = new Map<string, DupMember[]>();
  for (const c of noveltyCases) {
    const gid = resolveDuplicateGroupId(c.events);
    dupGroupByCase.set(c.id, gid);
    if (gid) {
      const arr = dupGroupMembers.get(gid) ?? [];
      arr.push({ id: c.id, caseNo: c.caseNo ?? null, createdAt: c.createdAt });
      dupGroupMembers.set(gid, arr);
    }
  }
  // Principal de cada grupo = la más antigua.
  const dupPrincipalByGroup = new Map<string, DupMember>();
  for (const [gid, arr] of dupGroupMembers) {
    const principal = [...arr].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
    if (principal) dupPrincipalByGroup.set(gid, principal);
  }

  const rows: NovedadRow[] = noveltyCases.map((c) => {
    const dupGroupId = dupGroupByCase.get(c.id) ?? null;
    const dupMembers = dupGroupId ? dupGroupMembers.get(dupGroupId) ?? [] : [];
    const dupCount = dupMembers.length || 1;
    const dupPrincipal = dupGroupId ? dupPrincipalByGroup.get(dupGroupId) ?? null : null;
    const inDupGroup = !!dupGroupId && dupCount > 1;
    const isPrincipal = inDupGroup && dupPrincipal?.id === c.id;
    const dupRole: "principal" | "dependiente" | null = inDupGroup ? (isPrincipal ? "principal" : "dependiente") : null;
    const dupPrincipalId = inDupGroup && !isPrincipal ? dupPrincipal?.id ?? null : null;
    const dupPrincipalCaseNo = inDupGroup && !isPrincipal ? dupPrincipal?.caseNo ?? null : null;
    const dupRelated =
      isPrincipal && dupGroupId
        ? dupMembers
            .filter((m) => m.id !== c.id)
            .sort((a, b) => (a.caseNo ?? 0) - (b.caseNo ?? 0))
            .map((m) => ({ id: m.id, caseNo: m.caseNo }))
        : [];
    const state = extractLatestNovedadState(c.events);
    const batchRef = state?.batchRef?.trim() || `NVD-${String(c.caseNo ?? 0).padStart(4, "0")}`;
    const linked = corrBySource.get(c.id) || corrByBatch.get(batchRef) || null;
    const corrFinishedAt = linked?.workOrder?.finishedAt ?? null;
    const reported =
      String(state?.reportedNovelty ?? "").trim() ||
      c.title.replace(/^Novedad\s+[^\-]+-\s*/i, "").trim() ||
      c.title;
    return {
      id: c.id,
      caseNo: c.caseNo ?? null,
      title: reported,
      busCode: c.bus.code,
      busPlate: c.bus.plate ?? null,
      status: c.status,
      priority: c.priority,
      equipo: equipoLabel(state?.affectedEquipment),
      creator: userNameById.get(creatorByCaseId.get(c.id) ?? "") ?? null,
      assignee: c.assignedTo?.name ?? null,
      assignedToId: c.assignedToId ?? null,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      // Fecha de resolución = día en que se finalizó el correctivo (OT). Si no hay
      // correctivo finalizado, se usa la fecha del cierre/resolución real (evento
      // STATUS_CHANGE), no updatedAt (que cambia con cualquier edición).
      resolvedAt: corrFinishedAt
        ? corrFinishedAt.toISOString()
        : c.status === CaseStatus.RESUELTO || c.status === CaseStatus.CERRADO
        ? extractStatusChangeAt(c.events)
        : null,
      corrId: linked?.id ?? null,
      corrCaseNo: linked?.caseNo ?? null,
      corrStatus: linked?.status ?? null,
      corrWorkOrderNo: linked?.workOrder?.workOrderNo ?? null,
      dupGroupId,
      dupCount,
      dupRole,
      dupPrincipalId,
      dupPrincipalCaseNo,
      dupRelated,
    };
  });

  // Personal de UPK (para asignar responsable con un clic desde la lista).
  const assignableUsers = await prisma.user.findMany({
    where: {
      tenantId,
      active: true,
      OR: [{ email: { endsWith: "@upk.local" } }, { email: { endsWith: "@upklatam.com" } }],
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // Conteo por equipo afectado (para el gráfico de barras)
  const equipoCount = new Map<string, number>();
  for (const r of rows) {
    if (!r.equipo) continue;
    equipoCount.set(r.equipo, (equipoCount.get(r.equipo) ?? 0) + 1);
  }
  const porEquipo = Array.from(equipoCount.entries()).map(([label, value]) => ({ label, value }));

  const cnt: Record<string, number> = {};
  for (const g of grouped) cnt[g.status] = g._count._all;
  const cNuevo = cnt["NUEVO"] ?? 0;
  const cProceso = (cnt["OT_ASIGNADA"] ?? 0) + (cnt["EN_EJECUCION"] ?? 0);
  const cResuelto = (cnt["RESUELTO"] ?? 0) + (cnt["CERRADO"] ?? 0);
  const cAll = grouped.reduce((s, g) => s + g._count._all, 0);
  const filteredTotal =
    params.statusParam === "NUEVO"
      ? cNuevo
      : params.statusParam === "PROCESO"
      ? cProceso
      : params.statusParam === "RESUELTO"
      ? cResuelto
      : cAll;

  const cur: Record<string, string | null | undefined> = {
    q: params.q,
    status: params.statusParam,
    priority: params.priority,
    creator: params.creator,
    dateFrom: params.dateFromStr,
    dateTo: params.dateToStr,
    rmonth,
  };
  const qs = (obj: Record<string, string | null | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(obj)) if (v) p.set(k, String(v));
    return p.toString();
  };
  const hrefWith = (ov: Record<string, string | null | undefined>) => {
    const s = qs({ ...cur, ...ov });
    return `/novedades${s ? `?${s}` : ""}`;
  };
  const exportHref = (() => {
    const s = qs({ ...cur, type: "NOVEDAD", rmonth: undefined });
    return `/api/cases/export${s ? `?${s}` : ""}`;
  })();

  const views = [
    { key: "", label: "Todas", count: cAll, dot: "" },
    { key: "NUEVO", label: "Nuevas", count: cNuevo, dot: "#2563eb" },
    { key: "PROCESO", label: "En proceso", count: cProceso, dot: "#f59e0b" },
    { key: "RESUELTO", label: "Resueltas", count: cResuelto, dot: "#16a34a" },
  ];
  const statusActive = (key: string) => (params.statusParam ?? "") === key;
  const misActive = params.creator === userId;

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-white px-4 py-3.5 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">Novedades</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {filteredTotal} {filteredTotal === 1 ? "novedad" : "novedades"} · Reportes del cliente
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={exportHref}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border/70 bg-white px-3 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
          >
            <FileSpreadsheet className="h-4 w-4" /> Exportar
          </a>
          <Link
            href="/cases/new?type=NOVEDAD"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white shadow-sm transition hover:brightness-95"
          >
            <Plus className="h-4 w-4" /> Reportar novedad
          </Link>
        </div>
      </div>

      {/* Vistas (mobile: chips) */}
      <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
        {views.map((v) => (
          <Link
            key={v.key || "all"}
            href={hrefWith({ status: v.key || undefined, creator: undefined })}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
              statusActive(v.key) && !misActive ? "bg-blue-600 text-white" : "border border-border/60 bg-white text-slate-600"
            }`}
          >
            {v.dot ? <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: v.dot }} /> : null}
            {v.label}
            <span className="rounded-full bg-black/10 px-1.5 text-[11px] tabular-nums">{v.count}</span>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[176px_1fr]">
        {/* Vistas (desktop) */}
        <aside className="hidden lg:block">
          <div className="rounded-2xl border border-border/60 bg-white p-2 shadow-sm">
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Vistas</p>
            {views.map((v) => {
              const active = statusActive(v.key) && !misActive;
              return (
                <Link
                  key={v.key || "all"}
                  href={hrefWith({ status: v.key || undefined, creator: undefined })}
                  className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-[13px] transition ${
                    active ? "bg-blue-50 font-semibold text-blue-700" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {v.dot ? (
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: v.dot }} />
                    ) : (
                      <span className="h-1.5 w-1.5" />
                    )}
                    {v.label}
                  </span>
                  <span className="text-[11px] tabular-nums text-slate-400">{v.count}</span>
                </Link>
              );
            })}
            <p className="mt-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Personales</p>
            <Link
              href={hrefWith({ creator: userId })}
              className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-[13px] transition ${
                misActive ? "bg-blue-50 font-semibold text-blue-700" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span>Mis novedades</span>
            </Link>
          </div>
        </aside>

        {/* Contenido */}
        <main className="min-w-0 space-y-3">
          {/* Resumen */}
          <CasesResumen summary={summary} currentMonth={rmonth} months={months} basePath="/novedades" />

          {/* Por equipo afectado */}
          {porEquipo.length ? <PorEquipoChart data={porEquipo} /> : null}

          {/* Filtros */}
          <form method="get" className="space-y-3 rounded-2xl border border-border/60 bg-white p-3 shadow-sm">
            <input type="hidden" name="status" value={params.statusParam ?? ""} />
            <input type="hidden" name="rmonth" value={rmonth} />
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-6">
              <div className="sm:col-span-2 lg:col-span-2">
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Buscar</label>
                <input
                  name="q"
                  placeholder="Bus, placa, novedad, # caso"
                  className="app-field-control h-9 w-full rounded-lg px-3 text-sm"
                  defaultValue={searchParams?.q ?? ""}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Prioridad</label>
                <Select name="priority" className="h-9 w-full" defaultValue={searchParams?.priority ?? ""}>
                  <option value="">Todas</option>
                  <option value="1">1 (Alta)</option>
                  <option value="2">2</option>
                  <option value="3">3 (Normal)</option>
                  <option value="4">4</option>
                  <option value="5">5 (Baja)</option>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Creador</label>
                <Select name="creator" className="h-9 w-full" defaultValue={searchParams?.creator ?? ""}>
                  <option value="">Todos</option>
                  {creators.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Desde</label>
                <input
                  type="date"
                  name="dateFrom"
                  aria-label="Fecha desde"
                  className="app-field-control h-9 w-full rounded-lg px-2 text-sm"
                  defaultValue={searchParams?.dateFrom ?? ""}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Hasta</label>
                <input
                  type="date"
                  name="dateTo"
                  aria-label="Fecha hasta"
                  className="app-field-control h-9 w-full rounded-lg px-2 text-sm"
                  defaultValue={searchParams?.dateTo ?? ""}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Link className="sts-btn-ghost inline-flex h-9 items-center justify-center px-4 text-sm" href="/novedades">
                Limpiar
              </Link>
              <button className="inline-flex h-9 items-center rounded-lg bg-blue-600 px-5 text-sm font-medium text-white shadow-sm transition hover:brightness-95">
                Filtrar
              </button>
            </div>
          </form>

          {/* Tabla interactiva */}
          {rows.length === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-white p-6 text-center text-sm text-muted-foreground shadow-sm">
              No hay novedades con estos filtros.
            </div>
          ) : (
            <NovedadesTable rows={rows} users={assignableUsers} />
          )}

          <p className="px-1 text-xs text-muted-foreground">
            Mostrando {rows.length} de {filteredTotal} {filteredTotal === 1 ? "novedad" : "novedades"}
          </p>
        </main>
      </div>
    </div>
  );
}
