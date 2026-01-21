import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return (
      <div className="mx-auto max-w-xl p-8 space-y-4">
        <h1 className="text-2xl font-semibold">Capital Desk</h1>
        <p className="text-sm text-muted-foreground">Debes iniciar sesión.</p>
        <Link className="underline" href="/login">Ir a login</Link>
      </div>
    );
  }

  const role = session.user.role;

  const canBackoffice = role === "ADMIN" || role === "BACKOFFICE";
  const canTech = role === "ADMIN" || role === "TECHNICIAN";

  return (
    <div className="mx-auto max-w-3xl p-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Capital Desk</h1>
        <p className="text-sm text-muted-foreground">
          Selecciona tu área de trabajo.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border p-5 space-y-2">
          <h2 className="text-lg font-semibold">Backoffice</h2>
          <p className="text-sm text-muted-foreground">
            Gestión de casos, asignación de técnicos, trazabilidad.
          </p>
          {canBackoffice ? (
            <Link className="underline" href="/cases">Entrar a Backoffice</Link>
          ) : (
            <p className="text-sm text-muted-foreground">Sin permisos.</p>
          )}
        </div>

        <div className="rounded-xl border p-5 space-y-2">
          <h2 className="text-lg font-semibold">Técnico</h2>
          <p className="text-sm text-muted-foreground">
            Órdenes de trabajo asignadas, evidencia, formularios y cierre.
          </p>
          {canTech ? (
            <Link className="underline" href="/work-orders">Entrar a Técnico</Link>
          ) : (
            <p className="text-sm text-muted-foreground">Sin permisos.</p>
          )}
        </div>
      </div>
    </div>
  );
}
