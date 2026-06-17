import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CaseStatus, CaseType, Role } from "@prisma/client";
import { CAPABILITIES } from "@/lib/capabilities";
import { ownCasesWhere } from "@/lib/access-control";
import { caseStatusLabels, caseTypeLabels, labelFromMap } from "@/lib/labels";
import { Select } from "@/components/Field";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/ui/data-table";
import { StatusPill, StatusPillStatus } from "@/components/ui/status-pill";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { TypeBadge } from "@/components/ui/TypeBadge";
import { ChevronRight } from "lucide-react";
import { ScrollReveal } from "@/components/animations/ScrollReveal";

function toStr(v: any) {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function mapCaseStatus(status: CaseStatus): StatusPillStatus {
  if (status === "NUEVO") return "nuevo";
  if (status === "OT_ASIGNADA" || status === "EN_EJECUCION") return "en_ejecucion";
  if (status === "RESUELTO" || status === "CERRADO") return "completado";
  return "nuevo";
}

export default async function CasesPage({ searchParams }: { searchParams: any }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="sts-card p-4">
          <p className="text-sm">Debes iniciar sesión.</p>
          <Link className="text-sm underline" href="/login">
            Ir a login
          </Link>
        </div>
      </div>
    );
  }

  const role = (session.user as any).role as Role;
  const caps = (session.user as any).capabilities as string[] | undefined;
  const userId = String((session.user as any).id ?? "");
  const isVideosOnly = role === Role.BACKOFFICE && caps?.includes(CAPABILITIES.VIDEOS_ONLY);
  if ((role !== Role.ADMIN && role !== Role.BACKOFFICE) || isVideosOnly) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="sts-card p-4">
          <p className="text-sm">No autorizado.</p>
        </div>
      </div>
    );
  }

  const tenantId = (session.user as any).tenantId as string;
  const ownOnly = role === Role.BACKOFFICE && caps?.includes(CAPABILITIES.OWN_CASES_ONLY);

  const q = toStr(searchParams?.q);
  const statusParam = toStr(searchParams?.status); // "", "NUEVO", "PROCESO", "RESUELTO"
  const type = toStr(searchParams?.type) as CaseType | null;
  const priority = toStr(searchParams?.priority);
  const priorityInt = priority ? Number(priority) : null;

  // Acepta "1", "001" y también prefijos cosméticos como "OT-12" o "CASO-12"
  // extrayendo solo los dígitos para buscar por # de caso / # de OT.
  const qOnlyDigits = q ? q.replace(/\D/g, "") : "";
  const qDigits = qOnlyDigits ? Number(qOnlyDigits) : null;
  const searchWhere = q
    ? {
        OR: [
          { bus: { code: { contains: q, mode: "insensitive" as const } } },
          { bus: { plate: { contains: q, mode: "insensitive" as const } } },
          { title: { contains: q, mode: "insensitive" as const } },
          { description: { contains: q, mode: "insensitive" as const } },
          ...(qDigits !== null
            ? [{ caseNo: qDigits }, { workOrder: { workOrderNo: qDigits } }]
            : []),
        ],
      }
    : {};

  const baseWhere = {
    tenantId,
    ...(ownOnly ? ownCasesWhere(userId) : {}),
    ...(type ? { type } : {}),
    ...(priorityInt ? { priority: priorityInt } : {}),
    ...searchWhere,
  };

  const statusWhere =
    statusParam === "NUEVO"
      ? { status: CaseStatus.NUEVO }
      : statusParam === "PROCESO"
      ? { status: { in: [CaseStatus.OT_ASIGNADA, CaseStatus.EN_EJECUCION] } }
      : statusParam === "RESUELTO"
      ? { status: { in: [CaseStatus.RESUELTO, CaseStatus.CERRADO] } }
      : {};

  const [cases, grouped] = await Promise.all([
    prisma.case.findMany({
      where: { ...baseWhere, ...statusWhere },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { bus: { select: { code: true, plate: true } } },
    }),
    prisma.case.groupBy({ by: ["status"], where: baseWhere, _count: { _all: true } }),
  ]);

  const cnt: Record<string, number> = {};
  for (const g of grouped) cnt[g.status] = g._count._all;
  const cNuevo = cnt["NUEVO"] ?? 0;
  const cProceso = (cnt["OT_ASIGNADA"] ?? 0) + (cnt["EN_EJECUCION"] ?? 0);
  const cResuelto = (cnt["RESUELTO"] ?? 0) + (cnt["CERRADO"] ?? 0);
  const cAll = grouped.reduce((s, g) => s + g._count._all, 0);
  const filteredTotal =
    statusParam === "NUEVO" ? cNuevo : statusParam === "PROCESO" ? cProceso : statusParam === "RESUELTO" ? cResuelto : cAll;

  const chipHref = (st?: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (type) p.set("type", type);
    if (priority) p.set("priority", priority);
    if (st) p.set("status", st);
    const s = p.toString();
    return `/cases${s ? `?${s}` : ""}`;
  };

  const chips = [
    { key: "", label: "Todos", count: cAll, dot: "" },
    { key: "NUEVO", label: "Nuevos", count: cNuevo, dot: "#3b82f6" },
    { key: "PROCESO", label: "En proceso", count: cProceso, dot: "#f59e0b" },
    { key: "RESUELTO", label: "Resueltos", count: cResuelto, dot: "#22c55e" },
  ];

  return (
    <div className="mobile-page-shell">
      <header className="mobile-page-header">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col items-start gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-6 lg:py-0">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 lg:text-4xl">Casos</h1>
            <p className="text-base text-slate-600">Bandeja Backoffice</p>
          </div>
          <Link
            className="sts-btn-ghost inline-flex h-10 items-center justify-center self-start px-4 text-sm"
            href="/cases/new"
          >
            Crear caso
          </Link>
        </div>
      </header>

      <div className="mobile-page-content max-w-[1600px] lg:px-6">
        <ScrollReveal>
          <div className="mobile-section-card mobile-section-card__body space-y-3">
            <div className="flex flex-wrap gap-2">
              {chips.map((c) => {
                const active = (statusParam ?? "") === c.key;
                return (
                  <Link
                    key={c.key || "all"}
                    href={chipHref(c.key || undefined)}
                    className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                      active ? "bg-slate-900 text-white" : "border border-border/60 bg-white text-slate-600 hover:bg-muted/40"
                    }`}
                  >
                    {c.dot ? <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.dot }} /> : null}
                    {c.label}
                    <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${active ? "bg-white/20" : "bg-muted text-slate-600"}`}>
                      {c.count}
                    </span>
                  </Link>
                );
              })}
            </div>
            <form className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap" method="get">
              <input type="hidden" name="status" value={statusParam ?? ""} />
              <input
                name="q"
                placeholder="Buscar por bus, placa, título, # de caso o # OT"
                className="app-field-control h-10 w-full rounded-xl px-3 text-sm sm:w-[20rem]"
                defaultValue={searchParams?.q ?? ""}
              />

              <Select name="type" className="h-10 w-full sm:min-w-44 sm:w-auto" defaultValue={searchParams?.type ?? ""}>
                <option value="">Tipo (todos)</option>
                <option value="CORRECTIVO">{caseTypeLabels.CORRECTIVO}</option>
                <option value="PREVENTIVO">{caseTypeLabels.PREVENTIVO}</option>
                <option value="RENOVACION_TECNOLOGICA">{caseTypeLabels.RENOVACION_TECNOLOGICA}</option>
                <option value="SOLICITUD_DESCARGA_VIDEO">{caseTypeLabels.SOLICITUD_DESCARGA_VIDEO}</option>
              </Select>

              <Select name="priority" className="h-10 w-full sm:min-w-36 sm:w-auto" defaultValue={searchParams?.priority ?? ""}>
                <option value="">Prioridad</option>
                <option value="1">1 (Alta)</option>
                <option value="2">2</option>
                <option value="3">3 (Normal)</option>
                <option value="4">4</option>
                <option value="5">5 (Baja)</option>
              </Select>

              <div className="flex w-full items-center gap-2 sm:w-auto">
                <button className="sts-btn-primary h-10 flex-1 px-4 text-sm sm:flex-none">Filtrar</button>
                <Link
                  className="sts-btn-ghost inline-flex h-10 flex-1 items-center justify-center px-4 text-sm sm:flex-none"
                  href="/cases"
                >
                  Limpiar
                </Link>
              </div>
            </form>
          </div>
        </ScrollReveal>

        <p className="px-1 pb-1 text-xs text-muted-foreground">
          Mostrando {cases.length} de {filteredTotal} {filteredTotal === 1 ? "caso" : "casos"}
        </p>

        {cases.length === 0 ? (
          <div className="mobile-section-card mobile-section-card__body text-sm text-muted-foreground">No hay casos.</div>
        ) : (
          <>
            <ScrollReveal className="lg:hidden">
              <div className="mobile-list-stack">
                {cases.map((c) => (
                  <article key={c.id} className="mobile-section-card">
                    <div className="mobile-section-card__header">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold">{c.bus.code}</span>
                            <span className="text-xs text-muted-foreground">{c.bus.plate ?? "Sin placa"}</span>
                          </div>
                          <p className="mt-1 text-sm font-medium break-words">{c.title}</p>
                          <p className="text-xs text-muted-foreground">Caso #{c.caseNo}</p>
                        </div>
                        <StatusPill
                          status={mapCaseStatus(c.status)}
                          label={labelFromMap(c.status, caseStatusLabels)}
                          pulse={c.status === "EN_EJECUCION" || c.status === "OT_ASIGNADA"}
                        />
                      </div>
                    </div>
                    <div className="mobile-section-card__body space-y-3">
                      <div className="flex items-center gap-2">
                        <TypeBadge type={c.type} label={labelFromMap(c.type, caseTypeLabels)} />
                        <PriorityBadge priority={c.priority} />
                      </div>
                      <Link className="sts-btn-ghost inline-flex h-10 w-full items-center justify-center text-sm" href={`/cases/${c.id}`}>
                        Abrir
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </ScrollReveal>

            <ScrollReveal className="hidden lg:block" delay={0.05}>
              <DataTable>
                <DataTableHeader>
                  <DataTableRow>
                    <DataTableHead>Bus</DataTableHead>
                    <DataTableHead>Título</DataTableHead>
                    <DataTableHead>Tipo</DataTableHead>
                    <DataTableHead>Estado</DataTableHead>
                    <DataTableHead>Prioridad</DataTableHead>
                    <DataTableHead className="text-right">Acción</DataTableHead>
                  </DataTableRow>
                </DataTableHeader>
                <DataTableBody>
                  {cases.map((c) => (
                    <DataTableRow key={c.id} clickable>
                      <DataTableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-medium">{c.bus.code}</span>
                          <span className="text-xs text-muted-foreground">{c.bus.plate ?? "Sin placa"}</span>
                        </div>
                      </DataTableCell>
                      <DataTableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-medium">{c.title}</span>
                          <span className="text-xs text-muted-foreground">Caso #{c.caseNo}</span>
                        </div>
                      </DataTableCell>
                      <DataTableCell>
                        <TypeBadge type={c.type} label={labelFromMap(c.type, caseTypeLabels)} />
                      </DataTableCell>
                      <DataTableCell>
                        <StatusPill
                          status={mapCaseStatus(c.status)}
                          label={labelFromMap(c.status, caseStatusLabels)}
                          pulse={c.status === "EN_EJECUCION" || c.status === "OT_ASIGNADA"}
                        />
                      </DataTableCell>
                      <DataTableCell>
                        <PriorityBadge priority={c.priority} />
                      </DataTableCell>
                      <DataTableCell className="text-right">
                        <Link className="sts-btn-ghost h-8 px-3 text-xs data-table-row-action" href={`/cases/${c.id}`}>
                          Abrir
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
            </ScrollReveal>
          </>
        )}
      </div>
    </div>
  );
}
