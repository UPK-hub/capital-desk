import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CaseEventType, Role } from "@prisma/client";
import { CAPABILITIES } from "@/lib/capabilities";
import { restrictedCasesWhere } from "@/lib/access-control";
import { buildCasesWhere } from "@/lib/cases/filters";
import { getCasesSummary, recentMonths } from "@/lib/cases/summary";
import { caseTypeLabels } from "@/lib/labels";
import { Select } from "@/components/Field";
import { FileSpreadsheet, Plus } from "lucide-react";
import CasesResumen from "@/components/cases/CasesResumen";
import CasesTable, { CaseRow } from "@/components/cases/CasesTable";

export default async function CasesPage({ searchParams }: { searchParams: any }) {
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
  if ((role !== Role.ADMIN && role !== Role.BACKOFFICE) || isVideosOnly) {
    return (
      <div className="sts-card p-4">
        <p className="text-sm">No autorizado.</p>
      </div>
    );
  }

  const ownOnly = role === Role.BACKOFFICE && !!caps?.includes(CAPABILITIES.OWN_CASES_ONLY);
  const ownWhere = ownOnly ? await restrictedCasesWhere({ tenantId, userId }) : {};
  const { baseWhere, statusWhere, params } = buildCasesWhere(searchParams, {
    tenantId,
    ownOnly,
    userId,
    ownWhere,
  });

  const months = recentMonths(6);
  const rmonth = (searchParams?.rmonth ? String(searchParams.rmonth) : "") || months[0].key;

  const [cases, grouped, creatorEvents, summary] = await Promise.all([
    prisma.case.findMany({
      where: { ...baseWhere, ...statusWhere },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        bus: { select: { code: true, plate: true } },
        assignedTo: { select: { name: true } },
        workOrder: { select: { workOrderNo: true, assignedTo: { select: { name: true } } } },
      },
    }),
    prisma.case.groupBy({ by: ["status"], where: baseWhere, _count: { _all: true } }),
    prisma.caseEvent.findMany({
      where: { type: CaseEventType.CREATED, case: { tenantId } },
      select: { meta: true },
    }),
    getCasesSummary({ tenantId, extraWhere: ownWhere, monthKey: rmonth }),
  ]);

  const creatorIds = new Set<string>();
  for (const ev of creatorEvents) {
    const uid = (ev.meta as any)?.userId;
    if (typeof uid === "string" && uid.trim()) creatorIds.add(uid.trim());
  }
  const creators = creatorIds.size
    ? await prisma.user.findMany({
        where: { tenantId, active: true, id: { in: Array.from(creatorIds) } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

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

  const rows: CaseRow[] = cases.map((c) => ({
    id: c.id,
    caseNo: c.caseNo ?? null,
    title: c.title,
    busCode: c.bus.code,
    busPlate: c.bus.plate ?? null,
    type: c.type,
    status: c.status,
    priority: c.priority,
    assignee: c.assignedTo?.name ?? c.workOrder?.assignedTo?.name ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));

  const cur: Record<string, string | null | undefined> = {
    q: params.q,
    status: params.statusParam,
    type: params.type,
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
    return `/cases${s ? `?${s}` : ""}`;
  };
  const exportHref = (() => {
    const s = qs({ ...cur, rmonth: undefined });
    return `/api/cases/export${s ? `?${s}` : ""}`;
  })();

  const views = [
    { key: "", label: "Todos", count: cAll, dot: "" },
    { key: "NUEVO", label: "Nuevos", count: cNuevo, dot: "#2563eb" },
    { key: "PROCESO", label: "En proceso", count: cProceso, dot: "#f59e0b" },
    { key: "RESUELTO", label: "Resueltos", count: cResuelto, dot: "#16a34a" },
  ];
  const statusActive = (key: string) => (params.statusParam ?? "") === key;
  const misActive = params.creator === userId;

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-white px-4 py-3.5 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">Casos</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {filteredTotal} {filteredTotal === 1 ? "caso" : "casos"} · Bandeja Backoffice
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
            href="/cases/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white shadow-sm transition hover:brightness-95"
          >
            <Plus className="h-4 w-4" /> Nuevo caso
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
              <span>Mis casos</span>
            </Link>
          </div>
        </aside>

        {/* Contenido */}
        <main className="min-w-0 space-y-3">
          {/* Resumen */}
          <CasesResumen summary={summary} currentMonth={rmonth} months={months} />

          {/* Filtros */}
          <form method="get" className="space-y-3 rounded-2xl border border-border/60 bg-white p-3 shadow-sm">
            <input type="hidden" name="status" value={params.statusParam ?? ""} />
            <input type="hidden" name="rmonth" value={rmonth} />
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-6">
              <div className="sm:col-span-2 lg:col-span-2">
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Buscar</label>
                <input
                  name="q"
                  placeholder="Bus, placa, título, # caso/OT"
                  className="app-field-control h-9 w-full rounded-lg px-3 text-sm"
                  defaultValue={searchParams?.q ?? ""}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Tipo</label>
                <Select name="type" className="h-9 w-full" defaultValue={searchParams?.type ?? ""}>
                  <option value="">Todos</option>
                  <option value="CORRECTIVO">{caseTypeLabels.CORRECTIVO}</option>
                  <option value="PREVENTIVO">{caseTypeLabels.PREVENTIVO}</option>
                  <option value="RENOVACION_TECNOLOGICA">{caseTypeLabels.RENOVACION_TECNOLOGICA}</option>
                  <option value="SOLICITUD_DESCARGA_VIDEO">{caseTypeLabels.SOLICITUD_DESCARGA_VIDEO}</option>
                </Select>
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
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="w-40">
                <input
                  type="date"
                  name="dateTo"
                  aria-label="Fecha hasta"
                  title="Fecha hasta"
                  className="app-field-control h-9 w-full rounded-lg px-2 text-sm"
                  defaultValue={searchParams?.dateTo ?? ""}
                />
              </div>
              <div className="flex items-center gap-2">
                <Link className="sts-btn-ghost inline-flex h-9 items-center justify-center px-4 text-sm" href="/cases">
                  Limpiar
                </Link>
                <button className="inline-flex h-9 items-center rounded-lg bg-blue-600 px-5 text-sm font-medium text-white shadow-sm transition hover:brightness-95">
                  Filtrar
                </button>
              </div>
            </div>
          </form>

          {/* Tabla interactiva */}
          {rows.length === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-white p-6 text-center text-sm text-muted-foreground shadow-sm">
              No hay casos con estos filtros.
            </div>
          ) : (
            <CasesTable rows={rows} />
          )}

          <p className="px-1 text-xs text-muted-foreground">
            Mostrando {rows.length} de {filteredTotal} {filteredTotal === 1 ? "caso" : "casos"}
          </p>
        </main>
      </div>
    </div>
  );
}
