import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CaseStatus, CaseType, Role } from "@prisma/client";
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
  if (role !== Role.ADMIN && role !== Role.BACKOFFICE) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="sts-card p-4">
          <p className="text-sm">No autorizado.</p>
        </div>
      </div>
    );
  }

  const tenantId = (session.user as any).tenantId as string;

  const q = toStr(searchParams?.q);
  const status = toStr(searchParams?.status) as CaseStatus | null;
  const type = toStr(searchParams?.type) as CaseType | null;
  const priority = toStr(searchParams?.priority);
  const priorityInt = priority ? Number(priority) : null;

  const cases = await prisma.case.findMany({
    where: {
      tenantId,
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(priorityInt ? { priority: priorityInt } : {}),
      ...(q
        ? {
            OR: [
              { bus: { code: { contains: q, mode: "insensitive" } } },
              { bus: { plate: { contains: q, mode: "insensitive" } } },
              { title: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { bus: { select: { code: true, plate: true } } },
  });

  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Casos</h1>
          <p className="text-sm text-muted-foreground">Bandeja Backoffice</p>
        </div>
        <Link className="sts-btn-ghost text-sm" href="/cases/new">
          Crear caso
        </Link>
      </div>

      <div className="sts-card p-4 md:p-5">
        <form className="flex flex-wrap gap-2.5" method="get">
          <input
            name="q"
            placeholder="Buscar por busCode o placa"
            className="app-field-control h-10 w-[18rem] rounded-xl px-3 text-sm"
            defaultValue={searchParams?.q ?? ""}
          />
          <Select name="status" className="h-10 min-w-44" defaultValue={searchParams?.status ?? ""}>
            <option value="">Estado (todos)</option>
            <option value="NUEVO">{caseStatusLabels.NUEVO}</option>
            <option value="OT_ASIGNADA">{caseStatusLabels.OT_ASIGNADA}</option>
            <option value="EN_EJECUCION">{caseStatusLabels.EN_EJECUCION}</option>
            <option value="RESUELTO">{caseStatusLabels.RESUELTO}</option>
            <option value="CERRADO">{caseStatusLabels.CERRADO}</option>
          </Select>

          <Select name="type" className="h-10 min-w-44" defaultValue={searchParams?.type ?? ""}>
            <option value="">Tipo (todos)</option>
            <option value="NOVEDAD">{caseTypeLabels.NOVEDAD}</option>
            <option value="CORRECTIVO">{caseTypeLabels.CORRECTIVO}</option>
            <option value="PREVENTIVO">{caseTypeLabels.PREVENTIVO}</option>
            <option value="RENOVACION_TECNOLOGICA">{caseTypeLabels.RENOVACION_TECNOLOGICA}</option>
            <option value="MEJORA_PRODUCTO">{caseTypeLabels.MEJORA_PRODUCTO}</option>
            <option value="SOLICITUD_DESCARGA_VIDEO">{caseTypeLabels.SOLICITUD_DESCARGA_VIDEO}</option>
          </Select>

          <Select name="priority" className="h-10 min-w-36" defaultValue={searchParams?.priority ?? ""}>
            <option value="">Prioridad</option>
            <option value="1">1 (Alta)</option>
            <option value="2">2</option>
            <option value="3">3 (Normal)</option>
            <option value="4">4</option>
            <option value="5">5 (Baja)</option>
          </Select>

          <button className="sts-btn-primary text-sm">Filtrar</button>
        </form>
      </div>

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

      {cases.length === 0 ? <div className="sts-card p-6 text-sm text-muted-foreground">No hay casos.</div> : null}
    </div>
  );
}
