import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, WorkOrderStatus } from "@prisma/client";
import { fmtWorkOrderNo, fmtCaseNo } from "@/lib/format-no";

function toStr(v: any) {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

type SearchParams = {
  q?: string;
  status?: string;
};

export default async function WorkOrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <div className="rounded-xl border bg-white p-6">
          <p className="text-sm">No autenticado.</p>
          <Link className="underline" href="/login">
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
        <div className="rounded-xl border bg-white p-6">
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
        <h1 className="text-2xl font-semibold">Ordenes de Trabajo</h1>
        <p className="text-sm text-muted-foreground">Bandeja Tecnico</p>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <form className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between" method="get">
          <input
            name="q"
            placeholder="Buscar por bus (codigo/placa) o caso."
            defaultValue={searchParams?.q ?? ""}
            className="h-10 w-full md:w-96 rounded-md border px-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
          />

          <div className="flex gap-2">
            <select name="status" defaultValue={searchParams?.status ?? ""} className="h-10 rounded-md border px-3 text-sm">
              <option value="">Estado (todos)</option>
              <option value="CREADA">CREADA</option>
              <option value="ASIGNADA">ASIGNADA</option>
              <option value="EN_CAMPO">EN_CAMPO</option>
              <option value="FINALIZADA">FINALIZADA</option>
            </select>

            <button className="rounded-md bg-black px-4 py-2 text-sm text-white" type="submit">
              Filtrar
            </button>
            <Link className="rounded-md border px-4 py-2 text-sm" href="/work-orders">
              Limpiar
            </Link>
          </div>
        </form>
      </div>

      <div className="rounded-xl border bg-white">
        <div className="grid grid-cols-12 border-b px-4 py-2 text-xs text-muted-foreground">
          <div className="col-span-3">Bus</div>
          <div className="col-span-3">Caso</div>
          <div className="col-span-2">Tipo</div>
          <div className="col-span-2">Estado OT</div>
          <div className="col-span-2"></div>
        </div>

        {workOrders.map((wo) => (
          <div key={wo.id} className="grid grid-cols-12 items-center px-4 py-3 text-sm border-b last:border-b-0">
            <div className="col-span-3">
              <div className="font-medium">{wo.case.bus.code}</div>
              <div className="text-xs text-muted-foreground">{wo.case.bus.plate ?? "-"}</div>
            </div>

            <div className="col-span-3">
              <div className="font-medium">{fmtCaseNo(wo.case.caseNo)}</div>
              <div className="text-xs text-muted-foreground">{wo.case.title}</div>
            </div>

            <div className="col-span-2">{wo.case.type}</div>
            <div className="col-span-2">{wo.status}</div>

            <div className="col-span-2 text-right">
              <div className="text-xs text-muted-foreground">{fmtWorkOrderNo(wo.workOrderNo)}</div>
              <Link className="underline" href={`/work-orders/${wo.id}`}>
                Abrir
              </Link>
            </div>
          </div>
        ))}

        {workOrders.length === 0 ? <div className="p-6 text-sm text-muted-foreground">No hay OTs.</div> : null}
      </div>
    </div>
  );
}
