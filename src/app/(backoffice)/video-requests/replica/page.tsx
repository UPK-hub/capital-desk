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
import { leerDrive } from "@/lib/onedrive/graph";
import { onedriveConfigured } from "@/lib/onedrive/config";
import VideoModuleTabs from "../VideoModuleTabs";
import ReintentarBoton from "./ReintentarBoton";
import ReplicaCharts, { type EstadoDato, type PuntoDia, type PuntoMes } from "./ReplicaCharts";

export const dynamic = "force-dynamic";

type SearchParams = { estado?: string; q?: string; vista?: string };

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
  const vista = String(searchParams?.vista ?? "solicitudes") === "archivos" ? "archivos" : "solicitudes";

  // Espacio del OneDrive de destino. Si Graph falla, la pagina sigue viva.
  let almacenamiento: { usadoGB: number; libreGB: number; totalGB: number } | null = null;
  if (onedriveConfigured()) {
    try {
      const d = await leerDrive();
      almacenamiento = {
        usadoGB: d.quota.used / 1024 ** 3,
        libreGB: d.quota.remaining / 1024 ** 3,
        totalGB: d.quota.total / 1024 ** 3,
      };
    } catch (e: any) {
      // Que Graph no responda no debe tumbar la pagina: el resto se calcula
      // contra la base de datos y sigue siendo util.
      console.error("ONEDRIVE_CUOTA_NO_DISPONIBLE", String(e?.message ?? e).slice(0, 200));
    }
  } else {
    console.warn("ONEDRIVE_NO_CONFIGURADO en el servidor");
  }

  // Conteo por estado, del tenant.
  const base: Prisma.VideoAttachmentWhereInput = {
    request: { case: { tenantId } },
    odStatus: { not: null },
  };

  const conteos = await prisma.videoAttachment.groupBy({
    by: ["odStatus"],
    _count: { _all: true },
    _sum: { size: true },
    where: base,
  });
  const porEstado: Record<string, number> = {};
  const bytesPorEstado: Record<string, number> = {};
  for (const c of conteos) {
    porEstado[String(c.odStatus)] = c._count._all;
    bytesPorEstado[String(c.odStatus)] = Number(c._sum.size ?? 0);
  }
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

  // Vista por solicitud: cuantos videos de cada una ya estan en OneDrive.
  const solicitudes =
    vista === "solicitudes"
      ? await prisma.videoDownloadRequest.findMany({
          where: {
            case: { tenantId },
            attachments: { some: { odStatus: { not: null } } },
            ...(q
              ? {
                  OR: [
                    { case: { bus: { code: { contains: q, mode: "insensitive" } } } },
                    ...(Number.isFinite(Number(q)) ? [{ case: { caseNo: Number(q) } }] : []),
                  ],
                }
              : {}),
          },
          orderBy: { createdAt: "desc" },
          take: 200,
          select: {
            id: true,
            createdAt: true,
            case: { select: { caseNo: true, bus: { select: { code: true } } } },
            attachments: {
              where: { active: true, odStatus: { not: null } },
              select: { odStatus: true, odWebUrl: true },
            },
          },
        })
      : [];

  type ResumenSolicitud = {
    id: string;
    caseNo: number | null;
    bus: string;
    creado: Date;
    total: number;
    replicados: number;
    conError: number;
    enlace: string | null;
    estado: "Completa" | "Parcial" | "Con error" | "En proceso";
  };

  const resumenSolicitudes: ResumenSolicitud[] = solicitudes.map((r) => {
    const total = r.attachments.length;
    const replicados = r.attachments.filter((a) => a.odStatus === OneDriveSyncStatus.REPLICADO).length;
    const errores = r.attachments.filter((a) => a.odStatus === OneDriveSyncStatus.ERROR).length;
    const enlace = r.attachments.find((a) => a.odWebUrl)?.odWebUrl ?? null;
    const estado: ResumenSolicitud["estado"] =
      errores > 0 ? "Con error" : replicados === total && total > 0 ? "Completa" : replicados > 0 ? "Parcial" : "En proceso";
    return {
      id: r.id,
      caseNo: r.case?.caseNo ?? null,
      bus: r.case?.bus?.code ?? "-",
      creado: r.createdAt,
      total,
      replicados,
      conError: errores,
      enlace,
      estado,
    };
  });

  const solicitudesCompletas = resumenSolicitudes.filter((r) => r.estado === "Completa").length;

  // --- Series para los graficos ---------------------------------------------
  // Volumen copiado por dia en los ultimos 30 dias (hora Bogota).
  const filasDia = await prisma.$queryRaw<{ dia: Date; archivos: bigint; bytes: bigint }[]>`
    SELECT date_trunc('day', va."odSyncedAt" AT TIME ZONE 'America/Bogota')::date AS dia,
           COUNT(*)::bigint AS archivos,
           COALESCE(SUM(va."size"), 0)::bigint AS bytes
      FROM "VideoAttachment" va
      JOIN "VideoDownloadRequest" vr ON vr."id" = va."requestId"
      JOIN "Case" c ON c."id" = vr."caseId"
     WHERE c."tenantId" = ${tenantId}
       AND va."odStatus" = 'REPLICADO'
       AND va."odSyncedAt" >= now() - interval '30 days'
     GROUP BY 1
     ORDER BY 1
  `;

  const fmtDia = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "short" });
  const porDia: PuntoDia[] = filasDia.map((f) => ({
    dia: fmtDia.format(new Date(f.dia)),
    gb: Number((Number(f.bytes) / 1024 ** 3).toFixed(2)),
    archivos: Number(f.archivos),
  }));

  // Peso del historico por mes del caso, separando lo ya copiado de lo pendiente.
  const filasMes = await prisma.$queryRaw<
    { mes: string; bytes_replicado: bigint; bytes_pendiente: bigint }[]
  >`
    SELECT to_char(c."createdAt" AT TIME ZONE 'America/Bogota', 'YYYY-MM') AS mes,
           COALESCE(SUM(va."size") FILTER (WHERE va."odStatus" = 'REPLICADO'), 0)::bigint AS bytes_replicado,
           COALESCE(SUM(va."size") FILTER (WHERE va."odStatus" <> 'REPLICADO'), 0)::bigint AS bytes_pendiente
      FROM "VideoAttachment" va
      JOIN "VideoDownloadRequest" vr ON vr."id" = va."requestId"
      JOIN "Case" c ON c."id" = vr."caseId"
     WHERE c."tenantId" = ${tenantId}
       AND va."odStatus" IS NOT NULL
     GROUP BY 1
     ORDER BY 1
  `;

  const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const porMes: PuntoMes[] = filasMes.map((f) => {
    const [anio, mes] = f.mes.split("-");
    return {
      mes: `${MESES_CORTOS[Number(mes) - 1] ?? mes} ${anio.slice(2)}`,
      gbReplicado: Number((Number(f.bytes_replicado) / 1024 ** 3).toFixed(2)),
      gbPendiente: Number((Number(f.bytes_pendiente) / 1024 ** 3).toFixed(2)),
    };
  });

  const datosEstados: EstadoDato[] = [
    { clave: "REPLICADO", etiqueta: "En OneDrive", color: "#0ca30c" },
    { clave: "SUBIENDO", etiqueta: "Subiendo", color: "#2a78d6" },
    { clave: "PENDIENTE", etiqueta: "Pendientes", color: "#fab219" },
    { clave: "ERROR", etiqueta: "Con error", color: "#d03b3b" },
    { clave: "OMITIDO", etiqueta: "Omitidos", color: "#898781" },
  ].map((e) => ({
    ...e,
    n: porEstado[e.clave] ?? 0,
    bytes: bytesPorEstado[e.clave] ?? 0,
  }));

  const conError = porEstado[OneDriveSyncStatus.ERROR] ?? 0;
  const replicados = porEstado[OneDriveSyncStatus.REPLICADO] ?? 0;
  const porcentaje = total > 0 ? Math.round((replicados / total) * 100) : 0;

  function href(nuevoEstado: string | null, nuevaVista?: string) {
    const p = new URLSearchParams();
    if (nuevoEstado) p.set("estado", nuevoEstado);
    if (q) p.set("q", q);
    const v = nuevaVista ?? vista;
    if (v !== "solicitudes") p.set("vista", v);
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

      <ReplicaCharts
        estados={datosEstados}
        almacenamiento={almacenamiento}
        porDia={porDia}
        porMes={porMes}
      />

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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="inline-flex w-fit gap-1 rounded-lg border border-border/70 bg-muted/25 p-1">
          <Link
            href={href(estado, "solicitudes")}
            className={`inline-flex h-8 items-center rounded-md px-3 text-sm font-medium ${
              vista === "solicitudes"
                ? "bg-background text-foreground shadow-sm ring-1 ring-border/60"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
          >
            Por solicitud
          </Link>
          <Link
            href={href(estado, "archivos")}
            className={`inline-flex h-8 items-center rounded-md px-3 text-sm font-medium ${
              vista === "archivos"
                ? "bg-background text-foreground shadow-sm ring-1 ring-border/60"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
          >
            Por archivo
          </Link>
        </nav>
        {vista === "solicitudes" ? (
          <span className="text-xs text-muted-foreground">
            {solicitudesCompletas} de {resumenSolicitudes.length} solicitudes completas en OneDrive
          </span>
        ) : null}
      </div>

      <form method="get" className="flex flex-wrap items-center gap-2">
        {estado ? <input type="hidden" name="estado" value={estado} /> : null}
        {vista !== "solicitudes" ? <input type="hidden" name="vista" value={vista} /> : null}
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

      {vista === "archivos" ? (
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
      ) : (
      <div className="sts-card overflow-hidden">
        <DataTable>
          <DataTableHeader>
            <DataTableRow>
              <DataTableHead>Caso</DataTableHead>
              <DataTableHead>Bus</DataTableHead>
              <DataTableHead>Creada</DataTableHead>
              <DataTableHead>Videos</DataTableHead>
              <DataTableHead>En OneDrive</DataTableHead>
              <DataTableHead>Estado</DataTableHead>
              <DataTableHead>Acción</DataTableHead>
            </DataTableRow>
          </DataTableHeader>
          <DataTableBody>
            {resumenSolicitudes.length === 0 ? (
              <DataTableRow>
                <DataTableCell colSpan={7}>
                  <span className="text-sm text-muted-foreground">
                    Todavía no hay solicitudes con videos en la cola.
                  </span>
                </DataTableCell>
              </DataTableRow>
            ) : (
              resumenSolicitudes.map((r) => (
                <DataTableRow key={r.id}>
                  <DataTableCell>
                    <Link href={`/video-requests/${r.id}`} className="underline-offset-2 hover:underline">
                      {r.caseNo ?? "-"}
                    </Link>
                  </DataTableCell>
                  <DataTableCell>{r.bus}</DataTableCell>
                  <DataTableCell>{fmtFecha(r.creado)}</DataTableCell>
                  <DataTableCell>{r.total}</DataTableCell>
                  <DataTableCell>
                    <span className="font-medium">{r.replicados}</span>
                    <span className="text-muted-foreground"> / {r.total}</span>
                  </DataTableCell>
                  <DataTableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
                        r.estado === "Completa"
                          ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/30"
                          : r.estado === "Con error"
                          ? "bg-red-500/10 text-red-600 ring-red-500/30"
                          : r.estado === "Parcial"
                          ? "bg-amber-500/10 text-amber-600 ring-amber-500/30"
                          : "bg-sky-500/10 text-sky-600 ring-sky-500/30"
                      }`}
                    >
                      {r.estado}
                    </span>
                  </DataTableCell>
                  <DataTableCell>
                    {r.enlace ? (
                      <a
                        href={r.enlace}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="sts-btn-ghost text-xs"
                      >
                        Abrir en OneDrive
                      </a>
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
      )}

      <p className="text-xs text-muted-foreground">
        Se muestran los 300 más recientes. Los estados se actualizan solos: el proceso de réplica
        revisa la cola cada 30 segundos y reintenta los fallos con espera creciente.
      </p>
    </div>
  );
}
