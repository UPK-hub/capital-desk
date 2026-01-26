import Link from "next/link";

export default function AdminPage() {
  return (
    <div className="mx-auto max-w-4xl p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Administración</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border p-5">
          <h2 className="font-semibold">Usuarios</h2>
          <p className="text-sm text-muted-foreground">
            Crear usuarios, asignar roles y restablecer contraseñas.
          </p>
          <Link className="underline text-sm" href="/admin/users">
            Gestionar usuarios
          </Link>
        </div>
        <div className="rounded-xl border p-5">
          <h2 className="font-semibold">Horarios tecnicos</h2>
          <p className="text-sm text-muted-foreground">Configurar turnos y dias de descanso.</p>
          <Link className="underline text-sm" href="/admin/technician-schedules">
            Configurar horarios
          </Link>
        </div>
      </div>
    </div>
  );
}
