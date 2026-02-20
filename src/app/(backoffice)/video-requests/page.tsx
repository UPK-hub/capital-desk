import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
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

export default async function VideoRequestsPage() {
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
  if (role !== Role.ADMIN && role !== Role.BACKOFFICE && role !== Role.TECHNICIAN) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="sts-card p-6">
          <p className="text-sm">No autorizado.</p>
        </div>
      </div>
    );
  }

  const tenantId = (session.user as any).tenantId as string;

  const items = await prisma.videoDownloadRequest.findMany({
    where: { case: { tenantId } },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      case: { select: { id: true, caseNo: true, title: true, bus: { select: { code: true, plate: true } } } },
      assignedTo: { select: { id: true, name: true } },
    },
  });

  return (
    <div className="mobile-page-shell">
      <header className="mobile-page-header">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 lg:flex-row lg:items-start lg:justify-between lg:px-6 lg:py-0">
          <div className="space-y-1">
            <h1 className="break-words text-xl font-semibold tracking-tight lg:text-3xl">Gestión de videos</h1>
            <p className="text-sm text-muted-foreground">Solicitudes y estado de descarga.</p>
          </div>
          <Link
            className="sts-btn-ghost inline-flex h-10 items-center justify-center px-4 text-sm"
            href="/cases/new?type=SOLICITUD_DESCARGA_VIDEO"
          >
            Crear solicitud
          </Link>
        </div>
      </header>

      <div className="mobile-page-content max-w-6xl lg:px-6">
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
      </div>
    </div>
  );
}
