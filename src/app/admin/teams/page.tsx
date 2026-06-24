import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import TeamsClient from "./ui/TeamsClient";

// El cliente Prisma se regenera en el build del servidor; aquí accedemos al
// modelo Team de forma laxa para no depender de la generación local.
const db = prisma as any;

export default async function AdminTeamsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const role = (session.user as any).role as Role;
  const tenantId = (session.user as any).tenantId as string;
  if (role !== Role.ADMIN) redirect("/");

  const [teams, users] = await Promise.all([
    db.team.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true, active: true },
    }),
  ]);

  return (
    <div className="mobile-page-shell">
      <header className="mobile-page-header">
        <div className="mx-auto w-full max-w-6xl px-4 py-4 lg:px-6 lg:py-0">
          <h1 className="text-xl font-semibold tracking-tight lg:text-3xl">Usuarios y equipos</h1>
          <p className="text-sm text-muted-foreground">
            Agrupa usuarios por dominio de correo y define qué puede ver el administrador de cada equipo.
          </p>
        </div>
      </header>

      <div className="mobile-page-content max-w-6xl lg:px-6">
        <TeamsClient
          initialTeams={JSON.parse(JSON.stringify(teams ?? []))}
          users={(users ?? []).map((u: any) => ({
            id: u.id,
            name: u.name ?? "",
            email: u.email ?? "",
            role: String(u.role),
            active: Boolean(u.active),
          }))}
        />
      </div>
    </div>
  );
}
