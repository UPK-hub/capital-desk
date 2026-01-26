import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return (
      <div className="mx-auto max-w-xl p-8 space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">Capital Desk</h1>
        <p className="text-sm text-muted-foreground">Debes iniciar sesion.</p>
        <Link className="underline" href="/login">Ir a login</Link>
      </div>
    );
  }

  const role = session.user.role;

  const canBackoffice = role === "ADMIN" || role === "BACKOFFICE";
  const canTech = role === "ADMIN" || role === "TECHNICIAN";
  const canVideo = role === "ADMIN" || role === "BACKOFFICE" || role === "TECHNICIAN";
  const caps = (session.user as any).capabilities as string[] | undefined;
  const canPlanner = role === "ADMIN" || role === "PLANNER" || caps?.includes("PLANNER");
  const canSts =
    role === "ADMIN" ||
    role === "SUPERVISOR" ||
    role === "HELPDESK" ||
    role === "AUDITOR" ||
    caps?.includes("STS_READ") ||
    caps?.includes("STS_WRITE") ||
    caps?.includes("STS_ADMIN");
  const isAdmin = role === "ADMIN";

  return (
    <div className="mx-auto max-w-3xl p-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Capital Desk</h1>
        <p className="text-sm text-muted-foreground">Selecciona tu area de trabajo.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="sts-card p-5 space-y-2 fade-up">
          <h2 className="text-lg font-semibold">Backoffice</h2>
          <p className="text-sm text-muted-foreground">
            Gestion de casos, asignacion de tecnicos, trazabilidad.
          </p>
          {canBackoffice ? (
            <Link className="sts-btn-soft" href="/cases">Entrar a Backoffice</Link>
          ) : (
            <p className="text-sm text-muted-foreground">Sin permisos.</p>
          )}
        </div>

        <div className="sts-card p-5 space-y-2 fade-up">
          <h2 className="text-lg font-semibold">Tecnico</h2>
          <p className="text-sm text-muted-foreground">
            Ordenes de trabajo asignadas, evidencia, formularios y cierre.
          </p>
          {canTech ? (
            <Link className="sts-btn-soft" href="/work-orders">Entrar a Tecnico</Link>
          ) : (
            <p className="text-sm text-muted-foreground">Sin permisos.</p>
          )}
        </div>

        <div className="sts-card p-5 space-y-2 fade-up">
          <h2 className="text-lg font-semibold">Videos</h2>
          <p className="text-sm text-muted-foreground">
            Gestion de solicitudes de videos, estados y adjuntos.
          </p>
          {canVideo ? (
            <Link className="sts-btn-soft" href="/video-requests">Ver solicitudes</Link>
          ) : (
            <p className="text-sm text-muted-foreground">Sin permisos.</p>
          )}
        </div>

        <div className="sts-card p-5 space-y-2 fade-up">
          <h2 className="text-lg font-semibold">Planner</h2>
          <p className="text-sm text-muted-foreground">Calendario semanal y disponibilidad de tecnicos.</p>
          {canPlanner ? (
            <Link className="sts-btn-soft" href="/planner">Abrir planner</Link>
          ) : (
            <p className="text-sm text-muted-foreground">Sin permisos.</p>
          )}
        </div>

        <div className="sts-card p-5 space-y-2 fade-up">
          <h2 className="text-lg font-semibold">STS</h2>
          <p className="text-sm text-muted-foreground">Tickets, SLA y KPIs del sistema STS.</p>
          {canSts ? (
            <Link className="sts-btn-soft" href="/sts">Abrir STS</Link>
          ) : (
            <p className="text-sm text-muted-foreground">Sin permisos.</p>
          )}
        </div>

        <div className="sts-card p-5 space-y-2 fade-up">
          <h2 className="text-lg font-semibold">Administracion</h2>
          <p className="text-sm text-muted-foreground">
            Usuarios, roles y configuracion.
          </p>
          {isAdmin ? (
            <Link className="sts-btn-soft" href="/admin">Ir a administracion</Link>
          ) : (
            <p className="text-sm text-muted-foreground">Solo admin.</p>
          )}
        </div>
      </div>
    </div>
  );
}
