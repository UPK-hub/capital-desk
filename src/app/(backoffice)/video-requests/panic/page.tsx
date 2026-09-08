import Link from "next/link";
import { getServerSession } from "next-auth";
import { PanicEventStatus, Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManagePanic, canViewPanic } from "@/lib/panic/access";
import { PANIC_EXPECTED_CLIPS, PANIC_RETENTION_YEARS } from "@/lib/panic/config";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/ui/data-table";
import VideoModuleTabs from "../VideoModuleTabs";
import { fmtBytes, fmtDateTime, STATUS_LABEL } from "./format";

type SearchParams = {
  q?: string;
  estado?: string;
  from?: string;
  to?: string;
  incompletos?: string;
};

function dateFromParam(value: string | undefined, endOfDay = false) {
  if (!value) return null;
  const suffix = endOfDay ? "T23:59:59.999-05:00" : "T00:00:00.000-05:00";
  const date = new Date(`${value}${suffix}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default async function PanicEventsPage({ searchParams }: { searchParams?: SearchParams }) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="sts-card p-6">
          <p className="text-sm">Debes iniciar sesión.</p>
          <Link className="sts-btn-ghost mt-3 text-sm" href="/login">
            Ir a login
          </Link>
        </div>
      </div>
    );
  }

  if (!canViewPanic(session.user as any)) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="sts-card p-6">
          <p className="text-sm">No autorizado. El módulo de botón de pánico requiere un permiso específico.</p>
        </div>
      </div>
    );
  }

  const tenantId = (session.user as any).tenantId as string;
  const q = String(searchParams?.q ?? "").trim();
  const estado = String(searchParams?.estado ?? "").trim().toUpperCase();
  const soloIncompletos = String(searchParams?.incompletos ?? "") === "1";
  const from = dateFromParam(searchParams?.from);
  const to = dateFromParam(searchParams?.to, true);

  const where: Prisma.PanicEventWhereInput = {
    tenantId,
    ...(estado && estado in PanicEventStatus ? { status: estado as PanicEventStatus } : {}),
    ...(soloIncompletos ? { complete: false } : {}),
    ...(from || to
      ? { receivedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
    ...(q
      ? {
          OR: [
            { busCode: { contains: q, mode: "insensitive" } },
            { plate: { contains: q, mode: "insensitive" } },
            { vehicleId: { contains: q, mode: "insensitive" } },
            { deviceId: { contains: q, mode: "insensitive" } },
            { externalEventId: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, pendientes, incompletos, total] = await Promise.all([
    prisma.panicEvent.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      take: 200,
      include: {
        assignedTo: { select: { id: true, name: true } },
        _count: { select: { clips: true } },
      },
    }),
    prisma.panicEvent.count({ where: { tenantId, status: PanicEventStatus.PENDIENTE } }),
    prisma.panicEvent.count({ where: { tenantId, complete: false } }),
    prisma.panicEvent.count({ where: { tenantId } }),
  ]);

  const puedeGestionar = canManagePanic(session.user as any);

  return (
    <div className="mobile-page-shell">
      <header className="mobile-page-header">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 lg:flex-row lg:items-start lg:justify-between lg:px-6 lg:py-0">
          <div className="space-y-1">
            <h1 className="break-words text-xl font-semibold tracking-tight lg:text-3xl">Botón de pánico</h1>
            <p className="text-sm text-muted-foreground">
              Videos enviados por los NVR ante una activación del botón. Cada evento agrupa los clips de las
              cámaras del bus (1 minuto antes y 4 después).
            </p>
            <VideoModuleTabs active="panic" showPanic />
          </div>
        </div>
      </header>

      <div className="mobile-page-content max-w-6xl lg:px-6">
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="sts-card p-4">
            <p className="text-xs text-muted-foreground">Pendientes de revisión</p>
            <p className="mt-1 text-2xl font-semibold">{pendientes}</p>
          </div>
          <div className="sts-card p-4">
            <p className="text-xs text-muted-foreground">Con cargue incompleto</p>
            <p className="mt-1 text-2xl font-semibold">{incompletos}</p>
          </div>
          <div className="sts-card p-4">
            <p className="text-xs text-muted-foreground">Eventos registrados</p>
            <p className="mt-1 text-2xl font-semibold">{total}</p>
          </div>
        </section>

        <form className="sts-card mt-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5" method="get">
          <label className="text-xs text-muted-foreground">
            Buscar
            <input
              className="mt-1 h-10 w-full rounded-md border px-3 text-sm"
              name="q"
              defaultValue={q}
              placeholder="Bus, placa, equipo o id de evento"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Estado
            <select className="mt-1 h-10 w-full rounded-md border px-3 text-sm" name="estado" defaultValue={estado}>
              <option value="">Todos</option>
              {Object.values(PanicEventStatus).map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABEL[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Desde
            <input className="mt-1 h-10 w-full rounded-md border px-3 text-sm" type="date" name="from" defaultValue={searchParams?.from ?? ""} />
          </label>
          <label className="text-xs text-muted-foreground">
            Hasta
            <input className="mt-1 h-10 w-full rounded-md border px-3 text-sm" type="date" name="to" defaultValue={searchParams?.to ?? ""} />
          </label>
          <div className="flex items-end gap-3">
            <label className="inline-flex items-center gap-2 text-xs">
              <input type="checkbox" name="incompletos" value="1" defaultChecked={soloIncompletos} />
              Solo incompletos
            </label>
            <button className="sts-btn-primary h-10 px-4 text-sm" type="submit">
              Filtrar
            </button>
          </div>
        </form>

        <section className="sts-card mt-4 overflow-hidden">
          <DataTable>
            <DataTableHeader>
              <DataTableRow>
                <DataTableHead>Evento</DataTableHead>
                <DataTableHead>Bus</DataTableHead>
                <DataTableHead>Cargue</DataTableHead>
                <DataTableHead>Estado</DataTableHead>
                <DataTableHead>Responsable</DataTableHead>
                <DataTableHead>Tamaño</DataTableHead>
                <DataTableHead />
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {items.length === 0 ? (
                <DataTableRow>
                  <DataTableCell colSpan={7}>
                    <span className="text-sm text-muted-foreground">Sin eventos para los filtros aplicados.</span>
                  </DataTableCell>
                </DataTableRow>
              ) : (
                items.map((item) => {
                  const esperado = item.expectedClips || PANIC_EXPECTED_CLIPS;
                  return (
                    <DataTableRow key={item.id}>
                      <DataTableCell>
                        <div className="font-medium">{fmtDateTime(item.eventAt ?? item.receivedAt)}</div>
                        <div className="text-xs text-muted-foreground break-all">{item.externalEventId}</div>
                      </DataTableCell>
                      <DataTableCell>
                        <div className="font-medium">{item.busCode ?? item.vehicleId ?? "-"}</div>
                        <div className="text-xs text-muted-foreground">{item.plate ?? ""}</div>
                      </DataTableCell>
                      <DataTableCell>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                            item.complete
                              ? "bg-emerald-500/15 text-emerald-600"
                              : "bg-amber-500/15 text-amber-600"
                          }`}
                        >
                          {item.receivedClips}/{esperado} cámaras
                        </span>
                      </DataTableCell>
                      <DataTableCell>{STATUS_LABEL[item.status]}</DataTableCell>
                      <DataTableCell>{item.assignedTo?.name ?? "-"}</DataTableCell>
                      <DataTableCell>{fmtBytes(item.totalBytes)}</DataTableCell>
                      <DataTableCell>
                        <Link className="text-sm underline" href={`/video-requests/panic/${item.id}`}>
                          {puedeGestionar ? "Revisar" : "Ver"}
                        </Link>
                      </DataTableCell>
                    </DataTableRow>
                  );
                })
              )}
            </DataTableBody>
          </DataTable>
        </section>

        <p className="mt-3 text-xs text-muted-foreground">
          El material se conserva {PANIC_RETENTION_YEARS} años en los servidores de almacenamiento y no puede
          eliminarse desde la mesa.
        </p>
      </div>
    </div>
  );
}
