import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Role } from "@prisma/client";
import { redirect } from "next/navigation";

const modules = [
  {
    title: "Usuarios",
    description: "Crear usuarios, asignar roles y restablecer contraseñas.",
    href: "/admin/users",
    cta: "Gestionar usuarios",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="8" cy="8" r="3" />
        <circle cx="16.5" cy="9.5" r="2.5" />
        <path d="M3.5 19a4.5 4.5 0 0 1 9 0M13 19a3.5 3.5 0 0 1 7 0" />
      </svg>
    ),
  },
  {
    title: "Horarios técnicos",
    description: "Configurar turnos, descansos y control de jornada.",
    href: "/admin/technician-schedules",
    cta: "Configurar horarios",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
  {
    title: "Tema visual",
    description: "Paleta, tipografías, sombras y modo dark/light.",
    href: "/admin/theme",
    cta: "Configurar tema",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9Z" />
      </svg>
    ),
  },
  {
    title: "Perfil",
    description: "Actualizar correo, contraseña y preferencias.",
    href: "/profile",
    cta: "Ir a perfil",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c1.8-3.5 13.2-3.5 16 0" />
      </svg>
    ),
  },
] as const;

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (session.user.role !== Role.ADMIN) redirect("/");

  return (
    <div className="mx-auto max-w-5xl p-6 md:p-8 space-y-6">
      <section className="sts-card p-6 md:p-7 admin-hero">
        <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Panel de control</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Administración</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Gestiona seguridad, operación y apariencia de la plataforma desde un solo lugar.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {modules.map((m) => (
          <section key={m.href} className="sts-card p-5 admin-module-card">
            <div className="flex items-start gap-3">
              <span className="admin-module-card__icon">{m.icon}</span>
              <div className="space-y-1">
                <h2 className="font-semibold text-lg leading-tight">{m.title}</h2>
                <p className="text-sm text-muted-foreground">{m.description}</p>
              </div>
            </div>
            <div className="pt-4">
              <Link className="sts-btn-soft text-sm" href={m.href}>
                {m.cta}
              </Link>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
