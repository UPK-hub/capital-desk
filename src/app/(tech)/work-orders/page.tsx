import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, WorkOrderStatus } from "@prisma/client";
import { fmtWorkOrderNo, fmtCaseNo } from "@/lib/format-no";
import { caseTypeLabels, labelFromMap, workOrderStatusLabels } from "@/lib/labels";
import ShiftClockCard from "@/components/ShiftClockCard";
import { Input, Select } from "@/components/Field";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/ui/data-table";
import { StatusPill, StatusPillStatus } from "@/components/ui/status-pill";
import { TypeBadge } from "@/components/ui/TypeBadge";

function toStr(v: any) {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

type SearchParams = {
  q?: string;
  status?: string;
};

function mapWorkOrderStatus(status: WorkOrderStatus): StatusPillStatus {
  if (status === "CREADA") return "nuevo";
  if (status === "ASIGNADA" || status === "EN_CAMPO") return "en_ejecucion";
  if (status === "EN_VALIDACION") return "activo";
  return "completado";
}

export default async function WorkOrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <div className="sts-card p-6">
          <p className="text-sm">No autenticado.</p>
          <Link className="sts-btn-ghost mt-3 text-sm" href="/login">
            Ir a login
          </Link>
        </div>
      </div>
    );
  }

  const tenantId = (session.user as any).tenantId as string;
  const userId = (session.user as any).id as string;
  const role = (session.user as any).role as Role;

  if (role !== Role.TECHNICIAN && role !== Role.ADMIN) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <div className="sts-card p-6">
          <p className="text-sm">No autorizado.</p>
        </div>
      </div>
    );
  }

  const q = toStr(searchParams?.q);
  const status = toStr(searchParams?.status) as WorkOrderStatus | null;

  const workOrders = await prisma.workOrder.findMany({
    where: {
      tenantId,
      ...(role === Role.TECHNICIAN ? { assignedToId: userId } : {}),
      case: { type: { not: "SOLICITUD_DESCARGA_VIDEO" } },
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { case: { title: { contains: q, mode: "insensitive" } } },
              { case: { description: { contains: q, mode: "insensitive" } } },
              { case: { bus: { code: { contains: q, mode: "insensitive" } } } },
              { case: { bus: { plate: { contains: q, mode: "insensitive" } } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      workOrderNo: true,
      status: true,
      case: {
        select: {
          caseNo: true,
          title: true,
          type: true,
          bus: { select: { code: true, plate: true } },
        },
      },
    },
  });

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Ordenes de Trabajo</h1>
        <p className="text-sm text-muted-foreground">Bandeja Tecnico</p>
      </div>

      <ShiftClockCard />

      <div className="sts-card p-4">
        <form className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between" method="get">
          <Input
            name="q"
            placeholder="Buscar por bus (codigo/placa) o caso."
            defaultValue={searchParams?.q ?? ""}
            className="w-full md:w-96"
          />

          <div className="flex gap-2">
            <Select name="status" defaultValue={searchParams?.status ?? ""} className="h-10 min-w-52">
              <option value="">Estado (todos)</option>
              <option value="CREADA">{workOrderStatusLabels.CREADA}</option>
              <option value="ASIGNADA">{workOrderStatusLabels.ASIGNADA}</option>
              <option value="EN_CAMPO">{workOrderStatusLabels.EN_CAMPO}</option>
              <option value="EN_VALIDACION">{workOrderStatusLabels.EN_VALIDACION}</option>
              <option value="FINALIZADA">{workOrderStatusLabels.FINALIZADA}</option>
            </Select>

            <button className="sts-btn-primary text-sm" type="submit">
              Filtrar
            </button>
            <Link className="sts-btn-ghost text-sm" href="/work-orders">
              Limpiar
            </Link>
          </div>
        </form>
      </div>

      <DataTable>
        <DataTableHeader>
          <DataTableRow>
            <DataTableHead>Bus</DataTableHead>
            <DataTableHead>Caso</DataTableHead>
            <DataTableHead>Tipo</DataTableHead>
            <DataTableHead>Estado OT</DataTableHead>
            <DataTableHead className="text-right">Acción</DataTableHead>
          </DataTableRow>
        </DataTableHeader>
        <DataTableBody>
          {workOrders.map((wo) => (
            <DataTableRow key={wo.id}>
              <DataTableCell>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{wo.case.bus.code}</span>
                  <span className="text-xs text-muted-foreground">{wo.case.bus.plate ?? "Sin placa"}</span>
                </div>
              </DataTableCell>
              <DataTableCell>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{fmtCaseNo(wo.case.caseNo)}</span>
                  <span className="text-xs text-muted-foreground">{wo.case.title}</span>
                </div>
              </DataTableCell>
              <DataTableCell>
                <TypeBadge type={wo.case.type} label={labelFromMap(wo.case.type, caseTypeLabels)} />
              </DataTableCell>
              <DataTableCell>
                <StatusPill
                  status={mapWorkOrderStatus(wo.status)}
                  label={labelFromMap(wo.status, workOrderStatusLabels)}
                  pulse={wo.status === "ASIGNADA" || wo.status === "EN_CAMPO"}
                />
              </DataTableCell>
              <DataTableCell className="text-right">
                <div className="mb-1 text-xs text-muted-foreground">{fmtWorkOrderNo(wo.workOrderNo)}</div>
                <Link className="sts-btn-ghost h-8 px-3 text-xs data-table-row-action" href={`/work-orders/${wo.id}`}>
                  Abrir
                </Link>
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>

      {workOrders.length === 0 ? <div className="sts-card p-6 text-sm text-muted-foreground">No hay OTs.</div> : null}
    </div>
  );
}
