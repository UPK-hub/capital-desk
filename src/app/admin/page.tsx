import Link from "next/link";

export default function AdminPage() {
  return (
    <div className="mx-auto max-w-4xl p-8 space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Administración</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="sts-card p-5">
          <h2 className="font-semibold">Usuarios</h2>
          <p className="text-sm text-muted-foreground">
            Crear usuarios, asignar roles y restablecer contraseñas.
          </p>
          <Link className="underline text-sm" href="/admin/users">
            Gestionar usuarios
          </Link>
        </div>
        <div className="sts-card p-5">
          <h2 className="font-semibold">Horarios tecnicos</h2>
          <p className="text-sm text-muted-foreground">Configurar turnos y dias de descanso.</p>
          <Link className="underline text-sm" href="/admin/technician-schedules">
            Configurar horarios
          </Link>
        </div>
        <div className="sts-card p-5">
          <h2 className="font-semibold">Tema visual</h2>
          <p className="text-sm text-muted-foreground">Colores, fondo, fuentes y botones.</p>
          <Link className="underline text-sm" href="/admin/theme">
            Configurar tema
          </Link>
        </div>
        <div className="sts-card p-5">
          <h2 className="font-semibold">Perfil</h2>
          <p className="text-sm text-muted-foreground">Actualiza correo y contraseña.</p>
          <Link className="underline text-sm" href="/profile">
            Ver perfil
          </Link>
        </div>
      </div>
    </div>
  );
}
