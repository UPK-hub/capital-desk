import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CaseStatus, CaseType, Role } from "@prisma/client";

function toStr(v: any) {
  const s = String(v ?? "").trim();
  return s ? s : null;
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
    include: { bus: { select: { code: true, plate: true } }, workOrder: true },
  });

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Casos</h1>
          <p className="text-sm text-muted-foreground">Bandeja Backoffice</p>
        </div>
        <Link className="sts-btn-ghost text-sm" href="/cases/new">
          Crear caso
        </Link>
      </div>

      <div className="sts-card p-4">
        <form className="flex flex-wrap gap-2" method="get">
          <input
            name="q"
            placeholder="Buscar por busCode o placa"
            className="w-72 rounded-md border px-3 py-2 text-sm"
            defaultValue={searchParams?.q ?? ""}
          />
          <select name="status" className="rounded-md border px-3 py-2 text-sm" defaultValue={searchParams?.status ?? ""}>
            <option value="">Estado (todos)</option>
            <option value="NUEVO">NUEVO</option>
            <option value="OT_ASIGNADA">OT_ASIGNADA</option>
            <option value="EN_EJECUCION">EN_EJECUCION</option>
            <option value="RESUELTO">RESUELTO</option>
            <option value="CERRADO">CERRADO</option>
          </select>

          <select name="type" className="rounded-md border px-3 py-2 text-sm" defaultValue={searchParams?.type ?? ""}>
            <option value="">Tipo (todos)</option>
            <option value="NOVEDAD">NOVEDAD</option>
            <option value="CORRECTIVO">CORRECTIVO</option>
            <option value="PREVENTIVO">PREVENTIVO</option>
            <option value="MEJORA_PRODUCTO">MEJORA_PRODUCTO</option>
            <option value="SOLICITUD_DESCARGA_VIDEO">SOLICITUD_DESCARGA_VIDEO</option>
          </select>

          <select name="priority" className="rounded-md border px-3 py-2 text-sm" defaultValue={searchParams?.priority ?? ""}>
            <option value="">Prioridad</option>
            <option value="1">1 (Alta)</option>
            <option value="2">2</option>
            <option value="3">3 (Normal)</option>
            <option value="4">4</option>
            <option value="5">5 (Baja)</option>
          </select>

          <button className="sts-btn-primary text-sm">Filtrar</button>
        </form>
      </div>

      <div className="sts-card overflow-hidden">
        <table className="sts-table">
          <thead>
            <tr>
              <th>Bus</th>
              <th>Título</th>
              <th>Tipo</th>
              <th>Estado</th>
              <th>Prio</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <tr key={c.id}>
                <td>
                  <div className="font-medium">{c.bus.code}</div>
                  <div className="text-xs text-muted-foreground">{c.bus.plate ?? "-"}</div>
                </td>
                <td>{c.title}</td>
                <td>{c.type}</td>
                <td>
                  <span className="sts-chip">{c.status}</span>
                </td>
                <td>{c.priority}</td>
                <td className="text-right">
                  <Link className="text-sm underline" href={`/cases/${c.id}`}>
                    Abrir
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {cases.length === 0 ? <div className="p-6 text-sm text-muted-foreground">No hay casos.</div> : null}
      </div>
    </div>
  );
}
