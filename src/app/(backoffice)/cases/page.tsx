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
import CasesFilterBar from "@/components/cases/CasesFilterBar";

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
  const ALLOWED_ROLES = [Role.ADMIN, Role.BACKOFFICE, Role.SUPERVISOR, Role.PLANNER, Role.TECHNICIAN];
  if (!ALLOWED_ROLES.includes(role) || isVideosOnly) {
    return (
      <div className="sts-card p-4">
        <p className="text-sm">No autorizado.</p>
      </div>
    );
  }
  const isTech = role === Role.TECHNICIAN;

  const ownOnly = role === Role.BACKOFFICE && !!caps?.includes(CAPABILITIES.OWN_CASES_ONLY);
  const ownWhere = ownOnly ? await restrictedCasesWhere({ tenantId, userId }) : {};
  const { baseWhere, statusWhere, params } = buildCasesWhere(searchParams, {
    tenantId,
    ownOnly,
    userId,
    ownWhere,
  });
  // Vistas por asignación. El técnico SIEMPRE ve solo lo asignado a él.
  const assignedParam = String(searchParams?.assigned ?? "").trim(); // "me" | "none" | ""
  if (isTech) Object.assign(baseWhere, { assignedToId: userId });
  else if (assignedParam === "me") Object.assign(baseWhere, { assignedToId: userId });
  else if (assignedParam === "none") Object.assign(baseWhere, { assignedToId: null });

  const months = recentMonths(6);
  const rmonth = (searchParams?.rmonth ? String(searchParams.rmonth) : "") || months[0].key;

  // Paginación server-side (antes se cargaban hasta 500 casos de una).
  const PAGE_SIZE = 100;
  const pageRaw = Number(searchParams?.page ?? "1");
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;

  const [cases, grouped, summary] = await Promise.all([
    prisma.case.findMany({
      where: { ...baseWhere, ...statusWhere },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: {
        bus: { select: { code: true, plate: true } },
        assignedTo: { select: { name: true } },
        workOrder: { select: { workOrderNo: true, assignedTo: { select: { name: true } } } },
      },
    }),
    prisma.case.groupBy({ by: ["status"], where: baseWhere, _count: { _all: true } }),
    getCasesSummary({ tenantId, extraWhere: { ...ownWhere, ...(isTech ? { assignedToId: userId } : {}) }, monthKey: rmonth }),
  ]);

  // Rendimiento: solo se consultan los eventos de creación de los casos que se
  // muestran en pantalla (antes se cargaban TODOS los eventos del tenant).
  const loadedCaseIds = cases.map((c) => c.id);
  const creatorEvents = loadedCaseIds.length
    ? await prisma.caseEvent.findMany({
        where: { type: CaseEventType.CREATED, caseId: { in: loadedCaseIds } },
        select: { caseId: true, meta: true },
      })
    : [];

  const creatorIds = new Set<string>();
  const creatorByCase = new Map<string, string>();
  for (const ev of creatorEvents) {
    const uid = (ev.meta as any)?.userId;
    if (typeof uid === "string" && uid.trim()) {
      creatorIds.add(uid.trim());
      if (ev.caseId) creatorByCase.set(ev.caseId, uid.trim());
    }
  }
  const creatorUsers = creatorIds.size
    ? await prisma.user.findMany({
        where: { tenantId, id: { in: Array.from(creatorIds) } },
        select: { id: true, name: true, active: true },
        orderBy: { name: "asc" },
      })
    : [];
  const creatorNameById = new Map(creatorUsers.map((u) => [u.id, u.name] as const));
  // Para el filtro "creador" se listan los usuarios activos del tenant
  // (antes se derivaba de un escaneo completo de eventos, muy costoso).
  const creators = await prisma.user.findMany({
    where: { tenantId, active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

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
    assignedToId: c.assignedToId ?? null,
    creator: creatorNameById.get(creatorByCase.get(c.id) ?? "") ?? null,
    workOrderNo: c.workOrder?.workOrderNo ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));

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

  const cur: Record<string, string | null | undefined> = {
    q: params.q,
    status: params.statusParam,
    type: params.type,
    priority: params.priority,
    creator: params.creator,
    assigned: assignedParam || undefined,
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
    { key: "RESUELTO", label: "Cerrados", count: cResuelto, dot: "#16a34a" },
  ];
  const statusActive = (key: string) => (params.statusParam ?? "") === key;
  const misActive = params.creator === userId;
  const asignadosActive = assignedParam === "me";
  const sinRespActive = assignedParam === "none";
  const anyPersonal = misActive || asignadosActive || sinRespActive;

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
        {!isTech ? (
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
        ) : null}
      </div>

      {/* Vistas (mobile: chips) */}
      <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
        {views.map((v) => (
          <Link
            key={v.key || "all"}
            href={hrefWith({ status: v.key || undefined, creator: undefined, assigned: undefined })}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
              statusActive(v.key) && !anyPersonal ? "bg-blue-600 text-white" : "border border-border/60 bg-white text-slate-600"
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
              const active = statusActive(v.key) && !anyPersonal;
              return (
                <Link
                  key={v.key || "all"}
                  href={hrefWith({ status: v.key || undefined, creator: undefined, assigned: undefined })}
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
            {!isTech ? (
              <>
                <p className="mt-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Personales</p>
                <Link
                  href={hrefWith({ creator: userId, assigned: undefined, status: undefined })}
                  className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-[13px] transition ${
                    misActive ? "bg-blue-50 font-semibold text-blue-700" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span>Mis casos</span>
                </Link>
                <Link
                  href={hrefWith({ assigned: "me", creator: undefined, status: undefined })}
                  className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-[13px] transition ${
                    asignadosActive ? "bg-blue-50 font-semibold text-blue-700" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span>Asignados a mí</span>
                </Link>
                <Link
                  href={hrefWith({ assigned: "none", creator: undefined, status: undefined })}
                  className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-[13px] transition ${
                    sinRespActive ? "bg-blue-50 font-semibold text-blue-700" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span>Sin responsable</span>
                </Link>
              </>
            ) : null}
          </div>
        </aside>

        {/* Contenido */}
        <main className="min-w-0 space-y-3">
          {/* Resumen */}
          <CasesResumen summary={summary} currentMonth={rmonth} months={months} />

          {/* Filtros */}
          <CasesFilterBar
            status={params.statusParam ?? ""}
            rmonth={rmonth}
            assigned={assignedParam}
            q={params.q ?? ""}
            type={params.type ?? ""}
            priority={params.priority ?? ""}
            creator={params.creator ?? ""}
            dateFrom={params.dateFromStr ?? ""}
            dateTo={params.dateToStr ?? ""}
            typeLabels={caseTypeLabels}
            creators={creators}
          />

          {/* Tabla interactiva */}
          {rows.length === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-white p-6 text-center text-sm text-muted-foreground shadow-sm">
              No hay casos con estos filtros.
            </div>
          ) : (
            <CasesTable rows={rows} users={isTech ? [] : assignableUsers} />
          )}

          {/* Paginación */}
          <div className="flex items-center justify-between px-1">
            <p className="text-xs text-muted-foreground">
              Mostrando {rows.length} de {filteredTotal} {filteredTotal === 1 ? "caso" : "casos"}
              {filteredTotal > PAGE_SIZE ? ` · Página ${page} de ${Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE))}` : ""}
            </p>
            {filteredTotal > PAGE_SIZE ? (
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <Link
                    href={hrefWith({ page: String(page - 1) })}
                    className="rounded-lg border border-border/60 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    ← Anterior
                  </Link>
                ) : null}
                {page * PAGE_SIZE < filteredTotal ? (
                  <Link
                    href={hrefWith({ page: String(page + 1) })}
                    className="rounded-lg border border-border/60 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Siguiente →
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
