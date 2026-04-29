import Link from "next/link";
import { getServerSession } from "next-auth";
import { Prisma, Role } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/ui/data-table";
import VideoModuleTabs from "../VideoModuleTabs";

type SearchParams = {
  q?: string;
  from?: string;
  to?: string;
};

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function fmtBytes(value: number | null) {
  if (!value || value <= 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function dateFromParam(value: string | undefined, endOfDay = false) {
  if (!value) return null;
  const suffix = endOfDay ? "T23:59:59.999-05:00" : "T00:00:00.000-05:00";
  const date = new Date(`${value}${suffix}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default async function ReceivedVideosPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="sts-card p-6">
          <p className="text-sm">Debes iniciar sesion.</p>
          <Link className="sts-btn-ghost mt-3 text-sm" href="/login">
            Ir a login
          </Link>
        </div>
      </div>
    );
  }

  const role = (session.user as any).role as Role;
  if (role !== Role.ADMIN && role !== Role.BACKOFFICE && role !== Role.SUPERVISOR && role !== Role.TECHNICIAN) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="sts-card p-6">
          <p className="text-sm">No autorizado.</p>
        </div>
      </div>
    );
  }

  const tenantId = (session.user as any).tenantId as string;
  const q = String(searchParams?.q ?? "").trim();
  const from = dateFromParam(searchParams?.from);
  const to = dateFromParam(searchParams?.to, true);

  const where: Prisma.IntegrationVideoWhereInput = {
    tenantId,
    ...(from || to
      ? {
          receivedAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { busCode: { contains: q, mode: "insensitive" } },
            { vehicleId: { contains: q, mode: "insensitive" } },
            { deviceId: { contains: q, mode: "insensitive" } },
            { registerId: { contains: q, mode: "insensitive" } },
            { filename: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const items = await prisma.integrationVideo.findMany({
    where,
    orderBy: { receivedAt: "desc" },
    take: 200,
    include: { bus: { select: { id: true, code: true, plate: true } } },
  });

  return (
    <div className="mobile-page-shell">
      <header className="mobile-page-header">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 lg:flex-row lg:items-start lg:justify-between lg:px-6 lg:py-0">
          <div className="space-y-1">
            <h1 className="break-words text-xl font-semibold tracking-tight lg:text-3xl">Gestion de videos</h1>
            <p className="text-sm text-muted-foreground">Videos recibidos desde dispositivos.</p>
            <VideoModuleTabs active="received" />
          </div>
          <Link
            className="sts-btn-ghost inline-flex h-10 items-center justify-center px-4 text-sm"
            href="/video-requests"
          >
            Ver solicitudes
          </Link>
        </div>
      </header>

      <div className="mobile-page-content max-w-6xl lg:px-6">
        <section className="mobile-section-card mobile-section-card__body">
          <form className="grid gap-3 md:grid-cols-[1fr_160px_160px_auto]" action="/video-requests/received">
            <input
              className="h-10 rounded-md border px-3 text-sm"
              name="q"
              defaultValue={q}
              placeholder="Bus, dispositivo, registro o archivo"
            />
            <input
              className="h-10 rounded-md border px-3 text-sm"
              type="date"
              name="from"
              defaultValue={searchParams?.from ?? ""}
            />
            <input
              className="h-10 rounded-md border px-3 text-sm"
              type="date"
              name="to"
              defaultValue={searchParams?.to ?? ""}
            />
            <div className="flex gap-2">
              <button className="sts-btn-primary h-10 flex-1 px-4 text-sm md:flex-none">Filtrar</button>
              <Link
                className="sts-btn-ghost inline-flex h-10 flex-1 items-center justify-center px-4 text-sm md:flex-none"
                href="/video-requests/received"
              >
                Limpiar
              </Link>
            </div>
          </form>
        </section>

        <section className="mobile-section-card">
          <div className="mobile-section-card__header flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Recibidos</h2>
            <p className="text-xs text-muted-foreground">{items.length} registros</p>
          </div>

          <div className="mobile-section-card__body pt-4">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin videos recibidos.</p>
            ) : (
              <>
                <div className="mobile-list-stack lg:hidden">
                  {items.map((it) => (
                    <article key={it.id} className="rounded-xl border border-border/60 bg-card p-4">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">{fmtDate(it.receivedAt)}</p>
                        <p className="mt-1 text-sm font-semibold">{it.bus?.code ?? it.busCode ?? it.vehicleId ?? "Sin bus"}</p>
                        <p className="text-xs text-muted-foreground">{it.bus?.plate ?? "Sin placa"}</p>
                        <p className="mt-2 truncate text-xs font-medium">{it.filename ?? it.originalName ?? it.filePath}</p>
                        <p className="text-xs text-muted-foreground">
                          {it.deviceId ? `Dispositivo ${it.deviceId}` : "Sin dispositivo"} - {fmtBytes(it.sizeBytes)}
                        </p>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Link className="sts-btn-ghost inline-flex h-10 flex-1 items-center justify-center text-sm" href={`/video-requests/received/${it.id}`}>
                          Ver detalle
                        </Link>
                        <a className="sts-btn-ghost inline-flex h-10 flex-1 items-center justify-center text-sm" href={`/api/uploads/${it.filePath}`} target="_blank" rel="noreferrer">
                          Video
                        </a>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="hidden lg:block">
                  <DataTable>
                    <DataTableHeader>
                      <DataTableRow>
                        <DataTableHead>Recibido</DataTableHead>
                        <DataTableHead>Bus</DataTableHead>
                        <DataTableHead>Dispositivo</DataTableHead>
                        <DataTableHead>Archivo</DataTableHead>
                        <DataTableHead>Tamano</DataTableHead>
                        <DataTableHead className="text-right">Accion</DataTableHead>
                      </DataTableRow>
                    </DataTableHeader>
                    <DataTableBody>
                      {items.map((it) => (
                        <DataTableRow key={it.id}>
                          <DataTableCell className="whitespace-nowrap">{fmtDate(it.receivedAt)}</DataTableCell>
                          <DataTableCell>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-sm font-medium">{it.bus?.code ?? it.busCode ?? it.vehicleId ?? "-"}</span>
                              <span className="text-xs text-muted-foreground">{it.bus?.plate ?? "Sin placa"}</span>
                            </div>
                          </DataTableCell>
                          <DataTableCell>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-sm font-medium">{it.deviceId ?? "-"}</span>
                              <span className="text-xs text-muted-foreground">{it.registerId ?? "-"}</span>
                            </div>
                          </DataTableCell>
                          <DataTableCell className="max-w-[320px] truncate">{it.filename ?? it.originalName ?? it.filePath}</DataTableCell>
                          <DataTableCell className="whitespace-nowrap">{fmtBytes(it.sizeBytes)}</DataTableCell>
                          <DataTableCell className="text-right whitespace-nowrap">
                            <Link className="sts-btn-ghost h-8 px-3 text-xs data-table-row-action" href={`/video-requests/received/${it.id}`}>
                              Ver detalle
                            </Link>
                          </DataTableCell>
                        </DataTableRow>
                      ))}
                    </DataTableBody>
                  </DataTable>
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
