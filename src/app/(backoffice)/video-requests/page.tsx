import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, VideoCaseStatus, VideoDownloadStatus } from "@prisma/client";
import { buildVideoRequestCaseScope } from "@/lib/access-control";
import { labelFromMap, videoCaseStatusLabels, videoDownloadStatusLabels } from "@/lib/labels";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/ui/data-table";
import { StatusPill, StatusPillStatus } from "@/components/ui/status-pill";
import VideoTabs from "./VideoTabs";

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function mapCaseStatus(v: string): StatusPillStatus {
  if (v === "EN_CURSO") return "en_ejecucion";
  if (v === "COMPLETADO") return "completado";
  if (v === "CANCELADO") return "cancelado";
  return "nuevo";
}

function mapDownloadStatus(v: string): StatusPillStatus {
  if (v === "DESCARGA_REALIZADA") return "completado";
  if (v === "DESCARGA_FALLIDA") return "cancelado";
  if (v === "BUS_NO_EN_PATIO") return "activo";
  return "en_ejecucion";
}

export default async function VideoRequestsPage({
  searchParams,
}: {
  searchParams?: { q?: string; estado?: string; descarga?: string; solicitante?: string };
}) {
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

  const role = (session.user as any).role as Role;
  if (role !== Role.ADMIN && role !== Role.BACKOFFICE && role !== Role.TECHNICIAN && role !== Role.SUPERVISOR) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="sts-card p-6">
          <p className="text-sm">No autorizado.</p>
        </div>
      </div>
    );
  }

  const tenantId = (session.user as any).tenantId as string;
  const capabilities = (session.user as any).capabilities as string[] | undefined;
  const userId = String((session.user as any).id ?? "");
  const caseScope = buildVideoRequestCaseScope({ role, capabilities, userId });
  const canCreateRequest = role === Role.ADMIN || role === Role.BACKOFFICE;

  // Filtros: búsqueda (móvil/teléfono/bus/placa), estado del caso y estado de descarga.
  const q = (searchParams?.q ?? "").trim();
  const estadoRaw = searchParams?.estado ?? "";
  const descargaRaw = searchParams?.descarga ?? "";
  const estado = (Object.values(VideoCaseStatus) as string[]).includes(estadoRaw)
    ? (estadoRaw as VideoCaseStatus)
    : undefined;
  const descarga = (Object.values(VideoDownloadStatus) as string[]).includes(descargaRaw)
    ? (descargaRaw as VideoDownloadStatus)
    : undefined;
  const solicitante = (searchParams?.solicitante ?? "").trim();

  const items = await prisma.videoDownloadRequest.findMany({
    where: {
      case: { tenantId, ...caseScope },
      ...(estado ? { status: estado } : {}),
      ...(descarga ? { downloadStatus: descarga } : {}),
      ...(solicitante ? { requesterName: solicitante } : {}),
      ...(q
        ? {
            OR: [
              { requesterPhone: { contains: q, mode: "insensitive" } },
              { vehicleId: { contains: q, mode: "insensitive" } },
              { case: { bus: { code: { contains: q, mode: "insensitive" } } } },
              { case: { bus: { plate: { contains: q, mode: "insensitive" } } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      case: { select: { id: true, caseNo: true, title: true, bus: { select: { code: true, plate: true } } } },
      assignedTo: { select: { id: true, name: true } },
    },
  });

  // Lista de solicitantes (para el filtro), dentro del alcance del usuario.
  const solicitanteRows = await prisma.videoDownloadRequest.findMany({
    where: { case: { tenantId, ...caseScope }, requesterName: { not: null } },
    select: { requesterName: true },
    distinct: ["requesterName"],
    orderBy: { requesterName: "asc" },
    take: 500,
  });
  const solicitantes = solicitanteRows
    .map((r) => (r.requesterName ?? "").trim())
    .filter((name) => name.length > 0);

  // Datos para el tablero (toda la operación dentro del alcance, sin los filtros de la lista).
  const dashRows = await prisma.videoDownloadRequest.findMany({
    where: { case: { tenantId, ...caseScope } },
    select: {
      id: true,
      status: true,
      downloadStatus: true,
      origin: true,
      createdAt: true,
      assignedTo: { select: { name: true } },
      case: { select: { id: true, caseNo: true, title: true, bus: { select: { code: true } } } },
    },
  });

  const dashData = dashRows.map((r) => ({
    id: r.id,
    status: r.status,
    downloadStatus: r.downloadStatus,
    origin: r.origin,
    createdAt: r.createdAt.toISOString(),
    tech: r.assignedTo?.name ?? null,
    busCode: r.case.bus.code,
    caseNo: r.case.caseNo,
    caseId: r.case.id,
    title: r.case.title,
  }));
  const hasFilters = Boolean(q || estado || descarga || solicitante);

  const exportParams = new URLSearchParams();
  if (q) exportParams.set("q", q);
  if (estado) exportParams.set("estado", estado);
  if (descarga) exportParams.set("descarga", descarga);
  if (solicitante) exportParams.set("solicitante", solicitante);
  const exportHref = `/api/video-requests/export${exportParams.toString() ? `?${exportParams.toString()}` : ""}`;

  return (
    <div className="mobile-page-shell">
      <header className="mobile-page-header">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 lg:flex-row lg:items-start lg:justify-between lg:px-6 lg:py-0">
          <div className="space-y-1">
            <h1 className="break-words text-xl font-semibold tracking-tight lg:text-3xl">Gestión de videos</h1>
            <p className="text-sm text-muted-foreground">Solicitudes y estado de descarga.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              className="sts-btn-ghost inline-flex h-10 items-center justify-center px-4 text-sm"
              href={exportHref}
            >
              Exportar Excel
            </a>
            {canCreateRequest ? (
              <Link
                className="sts-btn-primary inline-flex h-10 items-center justify-center px-4 text-sm"
                href="/cases/new?type=SOLICITUD_DESCARGA_VIDEO"
              >
                Crear solicitud
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mobile-page-content max-w-6xl lg:px-6">
        <VideoTabs rows={dashData} initialTab={hasFilters ? "solicitudes" : "tablero"}>

        <section className="mobile-section-card mobile-section-card__body">
          <form className="grid gap-3 md:grid-cols-[1fr_160px_180px_200px_auto]" action="/video-requests">
            <input
              className="h-10 rounded-md border px-3 text-sm"
              name="q"
              defaultValue={q}
              placeholder="Móvil, teléfono, bus o placa"
            />
            <select className="h-10 rounded-md border px-3 text-sm" name="estado" defaultValue={estadoRaw}>
              <option value="">Estado: todos</option>
              <option value="EN_ESPERA">{videoCaseStatusLabels.EN_ESPERA}</option>
              <option value="EN_CURSO">{videoCaseStatusLabels.EN_CURSO}</option>
              <option value="COMPLETADO">{videoCaseStatusLabels.COMPLETADO}</option>
            </select>
            <select className="h-10 rounded-md border px-3 text-sm" name="descarga" defaultValue={descargaRaw}>
              <option value="">Descarga: todas</option>
              <option value="PENDIENTE">{videoDownloadStatusLabels.PENDIENTE}</option>
              <option value="DESCARGA_REALIZADA">{videoDownloadStatusLabels.DESCARGA_REALIZADA}</option>
              <option value="DESCARGA_FALLIDA">{videoDownloadStatusLabels.DESCARGA_FALLIDA}</option>
              <option value="BUS_NO_EN_PATIO">{videoDownloadStatusLabels.BUS_NO_EN_PATIO}</option>
            </select>
            <select className="h-10 rounded-md border px-3 text-sm" name="solicitante" defaultValue={solicitante}>
              <option value="">Solicitante: todos</option>
              {solicitantes.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button className="sts-btn-primary h-10 flex-1 px-4 text-sm md:flex-none">Filtrar</button>
              <Link
                className="sts-btn-ghost inline-flex h-10 flex-1 items-center justify-center px-4 text-sm md:flex-none"
                href="/video-requests"
              >
                Limpiar
              </Link>
            </div>
          </form>
        </section>

        <section className="mobile-section-card">
          <div className="mobile-section-card__header flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Solicitudes</h2>
            <p className="text-xs text-muted-foreground">{items.length} registros</p>
          </div>

          <div className="mobile-section-card__body pt-4">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin solicitudes.</p>
            ) : (
              <>
                <div className="mobile-list-stack lg:hidden">
                  {items.map((it) => (
                    <article key={it.id} className="rounded-xl border border-border/60 bg-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-muted-foreground">{fmtDate(it.createdAt)}</p>
                          <p className="mt-1 text-sm font-semibold">{it.case.bus.code}</p>
                          <p className="text-xs text-muted-foreground">{it.case.bus.plate ?? "Sin placa"}</p>
                          <p className="mt-2 text-xs font-medium">{it.case.caseNo ?? it.case.id}</p>
                          <p className="text-xs text-muted-foreground break-words">{it.case.title}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <StatusPill status={mapCaseStatus(it.status)} label={labelFromMap(it.status, videoCaseStatusLabels)} />
                        <StatusPill
                          status={mapDownloadStatus(it.downloadStatus)}
                          label={labelFromMap(it.downloadStatus, videoDownloadStatusLabels)}
                        />
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">Técnico: {it.assignedTo?.name ?? "Sin asignar"}</p>
                      <div className="mt-3">
                        <Link className="sts-btn-ghost inline-flex h-10 w-full items-center justify-center text-sm" href={`/video-requests/${it.id}`}>
                          Ver detalle
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="hidden lg:block">
                  <DataTable>
                    <DataTableHeader>
                      <DataTableRow>
                        <DataTableHead>Fecha</DataTableHead>
                        <DataTableHead>Caso</DataTableHead>
                        <DataTableHead>Bus</DataTableHead>
                        <DataTableHead>Estado</DataTableHead>
                        <DataTableHead>Descarga</DataTableHead>
                        <DataTableHead>Técnico</DataTableHead>
                        <DataTableHead className="text-right">Acción</DataTableHead>
                      </DataTableRow>
                    </DataTableHeader>
                    <DataTableBody>
                      {items.map((it) => (
                        <DataTableRow key={it.id}>
                          <DataTableCell className="whitespace-nowrap">{fmtDate(it.createdAt)}</DataTableCell>
                          <DataTableCell>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-sm font-medium">{it.case.caseNo ?? it.case.id}</span>
                              <span className="text-xs text-muted-foreground">{it.case.title}</span>
                            </div>
                          </DataTableCell>
                          <DataTableCell>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-sm font-medium">{it.case.bus.code}</span>
                              <span className="text-xs text-muted-foreground">{it.case.bus.plate ?? "Sin placa"}</span>
                            </div>
                          </DataTableCell>
                          <DataTableCell>
                            <StatusPill status={mapCaseStatus(it.status)} label={labelFromMap(it.status, videoCaseStatusLabels)} />
                          </DataTableCell>
                          <DataTableCell>
                            <StatusPill
                              status={mapDownloadStatus(it.downloadStatus)}
                              label={labelFromMap(it.downloadStatus, videoDownloadStatusLabels)}
                            />
                          </DataTableCell>
                          <DataTableCell>{it.assignedTo?.name ?? "Sin asignar"}</DataTableCell>
                          <DataTableCell className="text-right whitespace-nowrap">
                            <Link className="sts-btn-ghost h-8 px-3 text-xs data-table-row-action" href={`/video-requests/${it.id}`}>
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
        </VideoTabs>
      </div>
    </div>
  );
}
