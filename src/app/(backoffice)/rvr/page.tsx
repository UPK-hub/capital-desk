import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { CAPABILITIES } from "@/lib/capabilities";
import { asDateInput, formatRvrNo } from "@/lib/rvr";
import GenerarHoyButton from "./ui/GenerarHoyButton";

// Listado de revisiones visuales remotas (una por día), estilo módulo de casos.
export default async function RvrListPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return (
      <div className="rounded-2xl border border-border/60 bg-white p-4 shadow-sm">
        <p className="text-sm">Debes iniciar sesión.</p>
        <Link className="text-sm underline" href="/login">
          Ir a login
        </Link>
      </div>
    );
  }

  const role = (session.user as any).role as Role;
  const caps = ((session.user as any).capabilities as string[] | undefined) ?? [];
  const videosOnly = role === Role.BACKOFFICE && caps.includes(CAPABILITIES.VIDEOS_ONLY);
  if (videosOnly || (role !== Role.ADMIN && role !== Role.BACKOFFICE && role !== Role.SUPERVISOR)) {
    return (
      <div className="rounded-2xl border border-border/60 bg-white p-4 shadow-sm">
        <p className="text-sm">No autorizado.</p>
      </div>
    );
  }

  const tenantId = (session.user as any).tenantId as string;

  const reviews = await prisma.remoteVisualReview.findMany({
    where: { tenantId },
    orderBy: { reviewDate: "desc" },
    take: 90,
    select: {
      id: true,
      reviewNo: true,
      reviewDate: true,
      status: true,
      busCount: true,
      responsible: { select: { name: true } },
      buses: { select: { reviewedAt: true, requiresCorrective: true } },
    },
  });

  // Día de hoy en Colombia (YYYY-MM-DD)
  const hoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const hasToday = reviews.some((r) => asDateInput(r.reviewDate) === hoy);

  const fmtFecha = (d: Date) =>
    new Intl.DateTimeFormat("es-CO", { dateStyle: "full", timeZone: "UTC" }).format(d);

  const thClass = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400";

  return (
    <div className="space-y-4">
      {/* Encabezado (estilo módulo de casos) */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-white px-4 py-3.5 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">Revisión visual remota</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {reviews.length} {reviews.length === 1 ? "revisión" : "revisiones"} · Una por día, con los buses priorizados
          </p>
        </div>
        <GenerarHoyButton hasToday={hasToday} />
      </div>

      {/* Tabla de revisiones */}
      <section className="overflow-hidden rounded-2xl border border-border/60 bg-white shadow-sm">
        {reviews.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            Aún no hay revisiones. Usa &quot;Generar la de hoy&quot; para crear la primera con los buses priorizados.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className={thClass}>N.º</th>
                  <th className={thClass}>Fecha</th>
                  <th className={thClass}>Estado</th>
                  <th className={thClass}>Buses</th>
                  <th className={thClass}>Revisados</th>
                  <th className={thClass}>Con correctivo</th>
                  <th className={thClass}>Responsable</th>
                  <th className={`${thClass} text-right`}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((r) => {
                  const fecha = asDateInput(r.reviewDate);
                  const revisados = r.buses.filter((b) => b.reviewedAt != null).length;
                  const conCorrectivo = r.buses.filter((b) => b.requiresCorrective).length;
                  const esHoy = fecha === hoy;
                  return (
                    <tr key={r.id} className={`border-t border-border/40 ${esHoy ? "bg-blue-50/40" : ""}`}>
                      <td className="px-3 py-2 font-semibold text-slate-900">
                        {formatRvrNo(r.reviewNo)}
                        {esHoy ? (
                          <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">HOY</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{fmtFecha(r.reviewDate)}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                            r.status === "COMPLETED" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {r.status === "COMPLETED" ? "Completada" : "En gestión"}
                        </span>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{r.busCount || r.buses.length}</td>
                      <td className="px-3 py-2 tabular-nums">{revisados}</td>
                      <td className="px-3 py-2 tabular-nums">{conCorrectivo || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.responsible?.name ?? "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          href={`/rvr/${fecha}`}
                          className="inline-flex h-8 items-center rounded-lg border border-border/70 bg-white px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                        >
                          Abrir
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
