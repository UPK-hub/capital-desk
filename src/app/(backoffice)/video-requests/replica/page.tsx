import Link from "next/link";
import { getServerSession } from "next-auth";
import { OneDriveSyncStatus, Prisma, Role } from "@prisma/client";
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
import ReintentarBoton from "./ReintentarBoton";

export const dynamic = "force-dynamic";

type SearchParams = { estado?: string; q?: string };

const ESTADOS: { clave: OneDriveSyncStatus; etiqueta: string; clase: string }[] = [
  { clave: OneDriveSyncStatus.REPLICADO, etiqueta: "En OneDrive", clase: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/30" },
  { clave: OneDriveSyncStatus.PENDIENTE, etiqueta: "Pendientes", clase: "bg-amber-500/10 text-amber-600 ring-amber-500/30" },
  { clave: OneDriveSyncStatus.SUBIENDO, etiqueta: "Subiendo", clase: "bg-sky-500/10 text-sky-600 ring-sky-500/30" },
  { clave: OneDriveSyncStatus.ERROR, etiqueta: "Con error", clase: "bg-red-500/10 text-red-600 ring-red-500/30" },
  { clave: OneDriveSyncStatus.OMITIDO, etiqueta: "Omitidos", clase: "bg-muted text-muted-foreground ring-border" },
];

function claseEstado(estado: OneDriveSyncStatus | null) {
  return ESTADOS.find((e) => e.clave === estado)?.clase ?? "bg-muted text-muted-foreground ring-border";
}

function etiquetaEstado(estado: OneDriveSyncStatus | null) {
  return ESTADOS.find((e) => e.clave === estado)?.etiqueta ?? "Sin encolar";
}

function fmtBytes(n: number | null | undefined) {
  if (!n) return "-";
  const u = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

function fmtFecha(d: Date | null | undefined) {
  if (!d) return "-";
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

export default async function ReplicaOneDrivePage({ searchParams }: { searchParams?: SearchParams }) {
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
  if (![Role.ADMIN, Role.BACKOFFICE].includes(role)) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="sts-card p-6">
          <p className="text-sm">No autorizado.</p>
        </div>
      </div>
    );
  }

  const tenantId = (session.user as any).tenantId as string;
  const estadoParam = String(searchParams?.estado ?? "").toUpperCase();
  const estado = ESTADOS.find((e) => e.clave === estadoParam)?.clave ?? null;
  const q = String(searchParams?.q ?? "").trim();

  // Conteo por estado, del tenant.
  const base: Prisma.VideoAttachmentWhereInput = {
    request: { case: { tenantId } },
    odStatus: { not: null },
  };

  const conteos = await prisma.videoAttachment.groupBy({
    by: ["odStatus"],
    _count: { _all: true },
    where: base,
  });
  const porEstado: Record<string, number> = {};
  for (const c of conteos) porEstado[String(c.odStatus)] = c._count._all;
  const total = Object.values(porEstado).reduce((a, b) => a + b, 0);

  const where: Prisma.VideoAttachmentWhereInput = {
    ...base,
    ...(estado ? { odStatus: estado } : {}),
    ...(q
      ? {
          OR: [
            { originalName: { contains: q, mode: "insensitive" } },
            { camera: { contains: q, mode: "insensitive" } },
            { request: { case: { bus: { code: { contains: q, mode: "insensitive" } } } } },
            ...(Number.isFinite(Number(q)) ? [{ request: { case: { caseNo: Number(q) } } }] : []),
          ],
        }
      : {}),
  };

  const filas = await prisma.videoAttachment.findMany({
    where,
    orderBy: [{ odSyncedAt: "desc" }, { createdAt: "desc" }],
    take: 300,
    select: {
      id: true,
      requestId: true,
      originalName: true,
      camera: true,
      size: true,
      createdAt: true,
      odStatus: true,
      odWebUrl: true,
      odPath: true,
      odSyncedAt: true,
      odAttempts: true,
      odError: true,
      request: {
        select: { case: { select: { caseNo: true, bus: { select: { code: true } } } } },
      },
    },
  });

  const conError = porEstado[OneDriveSyncStatus.ERROR] ?? 0;
  const replicados = porEstado[OneDriveSyncStatus.REPLICADO] ?? 0;
  const porcentaje = total > 0 ? Math.round((replicados / total) * 100) : 0;

  function href(nuevoEstado: string | null) {
    const p = new URLSearchParams();
    if (nuevoEstado) p.set("estado", nuevoEstado);
    if (q) p.set("q", q);
    const s = p.toString();
    return s ? `/video-requests/replica?${s}` : "/video-requests/replica";
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <VideoModuleTabs active="replica" showPanic />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Réplica en OneDrive</h1>
          <p className="text-sm text-muted-foreground">
            Videos de solicitudes de descarga copiados al OneDrive de CapitalBus.{" "}
            {total > 0 ? `${porcentaje}% replicado.` : "Todavía no hay videos en la cola."}
          </p>
        </div>
        {conError > 0 ? (
          <ReintentarBoton todos etiqueta={`Reintentar los ${conError} con error`} />
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {ESTADOS.map((e) => (
          <Link
            key={e.clave}
            href={href(estado === e.clave ? null : e.clave)}
            className={`sts-card p-4 transition hover:ring-2 ${
              estado === e.clave ? "ring-2 ring-primary/40" : ""
            }`}
          >
            <div className="text-xs text-muted-foreground">{e.etiqueta}</div>
            <div className="mt-1 text-2xl font-semibold">{porEstado[e.clave] ?? 0}</div>
          </Link>
        ))}
      </div>

      <form method="get" className="flex flex-wrap items-center gap-2">
        {estado ? <input type="hidden" name="estado" value={estado} /> : null}
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Buscar por bus, número de caso, cámara o archivo"
          className="h-9 w-80 rounded-md border px-3 text-sm"
        />
        <button type="submit" className="sts-btn-primary h-9 px-4 text-sm">
          Buscar
        </button>
        {q || estado ? (
          <Link href="/video-requests/replica" className="sts-btn-ghost h-9 px-4 text-sm">
            Limpiar
          </Link>
        ) : null}
      </form>

      <div className="sts-card overflow-hidden">
        <DataTable>
          <DataTableHeader>
            <DataTableRow>
              <DataTableHead>Caso</DataTableHead>
              <DataTableHead>Bus</DataTableHead>
              <DataTableHead>Cámara</DataTableHead>
              <DataTableHead>Archivo</DataTableHead>
              <DataTableHead>Tamaño</DataTableHead>
              <DataTableHead>Estado</DataTableHead>
              <DataTableHead>Replicado</DataTableHead>
              <DataTableHead>Acción</DataTableHead>
            </DataTableRow>
          </DataTableHeader>
          <DataTableBody>
            {filas.length === 0 ? (
              <DataTableRow>
                <DataTableCell colSpan={8}>
                  <span className="text-sm text-muted-foreground">
                    No hay adjuntos con esos filtros.
                  </span>
                </DataTableCell>
              </DataTableRow>
            ) : (
              filas.map((f) => (
                <DataTableRow key={f.id}>
                  <DataTableCell>
                    <Link href={`/video-requests/${f.requestId}`} className="underline-offset-2 hover:underline">
                      {f.request?.case?.caseNo ?? "-"}
                    </Link>
                  </DataTableCell>
                  <DataTableCell>{f.request?.case?.bus?.code ?? "-"}</DataTableCell>
                  <DataTableCell>{f.camera ?? "-"}</DataTableCell>
                  <DataTableCell>
                    <span className="block max-w-[22rem] truncate" title={f.odPath ?? f.originalName ?? ""}>
                      {f.originalName ?? "-"}
                    </span>
                  </DataTableCell>
                  <DataTableCell>{fmtBytes(f.size)}</DataTableCell>
                  <DataTableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${claseEstado(
                        f.odStatus
                      )}`}
                      title={f.odError ?? undefined}
                    >
                      {etiquetaEstado(f.odStatus)}
                      {f.odStatus === OneDriveSyncStatus.ERROR && f.odAttempts
                        ? ` (${f.odAttempts})`
                        : ""}
                    </span>
                    {f.odStatus === OneDriveSyncStatus.ERROR && f.odError ? (
                      <span className="mt-1 block max-w-[22rem] truncate text-xs text-muted-foreground">
                        {f.odError}
                      </span>
                    ) : null}
                  </DataTableCell>
                  <DataTableCell>{fmtFecha(f.odSyncedAt)}</DataTableCell>
                  <DataTableCell>
                    {f.odStatus === OneDriveSyncStatus.REPLICADO && f.odWebUrl ? (
                      <a
                        href={f.odWebUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="sts-btn-ghost text-xs"
                      >
                        Abrir en OneDrive
                      </a>
                    ) : f.odStatus === OneDriveSyncStatus.ERROR ||
                      f.odStatus === OneDriveSyncStatus.OMITIDO ? (
                      <ReintentarBoton attachmentId={f.id} etiqueta="Reintentar" />
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </DataTableCell>
                </DataTableRow>
              ))
            )}
          </DataTableBody>
        </DataTable>
      </div>

      <p className="text-xs text-muted-foreground">
        Se muestran los 300 más recientes. Los estados se actualizan solos: el proceso de réplica
        revisa la cola cada 30 segundos y reintenta los fallos con espera creciente.
      </p>
    </div>
  );
}
