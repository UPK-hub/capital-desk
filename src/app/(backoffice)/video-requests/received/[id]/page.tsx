import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { Role } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import VideoModuleTabs from "../../VideoModuleTabs";

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

function metadataText(value: unknown) {
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default async function ReceivedVideoDetailPage({ params }: { params: { id: string } }) {
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
  const item = await prisma.integrationVideo.findFirst({
    where: { id: params.id, tenantId },
    include: { bus: { select: { id: true, code: true, plate: true } } },
  });

  if (!item) return notFound();

  const meta = metadataText(item.metadata);

  return (
    <div className="mobile-page-shell">
      <header className="mobile-page-header">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 lg:flex-row lg:items-start lg:justify-between lg:px-6 lg:py-0">
          <div className="min-w-0 space-y-1">
            <h1 className="truncate text-lg font-semibold tracking-tight lg:text-3xl">
              {item.bus?.code ?? item.busCode ?? item.vehicleId ?? "Video recibido"}
            </h1>
            <p className="truncate text-xs text-muted-foreground lg:text-sm">
              {item.filename ?? item.originalName ?? item.filePath}
            </p>
            <VideoModuleTabs active="received" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link className="sts-btn-ghost text-sm" href="/video-requests/received">
              Volver
            </Link>
            <a className="sts-btn-primary text-sm" href={`/api/uploads/${item.filePath}`} target="_blank" rel="noreferrer">
              Abrir video
            </a>
          </div>
        </div>
      </header>

      <div className="mobile-page-content max-w-6xl lg:px-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <section className="sts-card overflow-hidden">
              <video className="aspect-video w-full bg-black" controls preload="metadata" src={`/api/uploads/${item.filePath}`} />
            </section>

            <section className="sts-card p-5">
              <h2 className="text-base font-semibold">Metadatos</h2>
              {meta ? (
                <pre className="mt-3 max-h-[520px] overflow-auto rounded-md border bg-muted/30 p-3 text-xs">
                  {meta}
                </pre>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">Sin metadatos.</p>
              )}
              {item.metadataPath ? (
                <a className="mt-3 inline-flex text-xs underline" href={`/api/uploads/${item.metadataPath}`} target="_blank" rel="noreferrer">
                  Abrir archivo JSON
                </a>
              ) : null}
            </section>
          </div>

          <div className="space-y-6">
            <section className="sts-card p-5">
              <h2 className="text-base font-semibold">Detalle</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Recibido</dt>
                  <dd>{fmtDate(item.receivedAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Bus</dt>
                  <dd>{item.bus?.code ?? item.busCode ?? item.vehicleId ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Placa</dt>
                  <dd>{item.bus?.plate ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Dispositivo</dt>
                  <dd>{item.deviceId ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Registro</dt>
                  <dd className="break-all">{item.registerId ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Archivo</dt>
                  <dd className="break-all">{item.filename ?? item.originalName ?? item.filePath}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Tamano</dt>
                  <dd>{fmtBytes(item.sizeBytes)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Origen</dt>
                  <dd>{item.source}</dd>
                </div>
              </dl>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
