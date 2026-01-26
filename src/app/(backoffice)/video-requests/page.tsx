import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function badge(base: string) {
  return `inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${base}`;
}

function statusBadge(v: string) {
  if (v === "EN_ESPERA") return badge("bg-amber-50 text-amber-800 border-amber-200");
  if (v === "EN_CURSO") return badge("bg-blue-50 text-blue-700 border-blue-200");
  if (v === "COMPLETADO") return badge("bg-green-50 text-green-700 border-green-200");
  return badge("bg-zinc-50 text-zinc-700 border-zinc-200");
}

function downloadBadge(v: string) {
  if (v === "DESCARGA_REALIZADA") return badge("bg-green-50 text-green-700 border-green-200");
  if (v === "DESCARGA_FALLIDA") return badge("bg-red-50 text-red-700 border-red-200");
  if (v === "BUS_NO_EN_PATIO") return badge("bg-amber-50 text-amber-800 border-amber-200");
  return badge("bg-zinc-50 text-zinc-700 border-zinc-200");
}

export default async function VideoRequestsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="sts-card p-6">
          <p className="text-sm">Debes iniciar sesión.</p>
          <Link className="underline text-sm" href="/login">
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
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Gestion de videos</h1>
          <p className="text-sm text-muted-foreground">Solicitudes y estado de descarga.</p>
        </div>
        <Link className="sts-btn-ghost text-sm" href="/cases/new">
          Crear solicitud
        </Link>
      </div>

      <section className="sts-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Solicitudes</h2>
          <p className="text-xs text-muted-foreground">{items.length} registros</p>
        </div>

        <div className="mt-4 overflow-auto">
          <table className="sts-table">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 text-left">Fecha</th>
                <th className="py-2 text-left">Caso</th>
                <th className="py-2 text-left">Bus</th>
                <th className="py-2 text-left">Estado</th>
                <th className="py-2 text-left">Descarga</th>
                <th className="py-2 text-left">Tecnico</th>
                <th className="py-2 text-left"></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-muted-foreground">
                    Sin solicitudes.
                  </td>
                </tr>
              ) : (
                items.map((it) => (
                  <tr key={it.id} className="border-b last:border-b-0">
                    <td className="py-2 whitespace-nowrap">{fmtDate(it.createdAt)}</td>
                    <td className="py-2">
                      <div className="font-medium">{it.case.caseNo ?? it.case.id}</div>
                      <div className="text-xs text-muted-foreground">{it.case.title}</div>
                    </td>
                    <td className="py-2">
                      {it.case.bus.code}
                      {it.case.bus.plate ? ` (${it.case.bus.plate})` : ""}
                    </td>
                    <td className="py-2">
                      <span className={statusBadge(it.status)}>{it.status}</span>
                    </td>
                    <td className="py-2">
                      <span className={downloadBadge(it.downloadStatus)}>{it.downloadStatus}</span>
                    </td>
                    <td className="py-2">{it.assignedTo?.name ?? "-"}</td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <Link className="underline" href={`/video-requests/${it.id}`}>
                        Ver detalle
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
