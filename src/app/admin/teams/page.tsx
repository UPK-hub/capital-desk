import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getTeamAdminScope } from "@/lib/access-control";
import TeamsClient from "./ui/TeamsClient";

// El cliente Prisma se regenera en el build del servidor; aquí accedemos al
// modelo Team de forma laxa para no depender de la generación local.
const db = prisma as any;

function domainOf(email: string) {
  return String(email ?? "").split("@")[1]?.toLowerCase() ?? "";
}

export default async function AdminTeamsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const role = (session.user as any).role as Role;
  const tenantId = (session.user as any).tenantId as string;
  const userId = String((session.user as any).id ?? "");
  const isGlobalAdmin = role === Role.ADMIN;

  // Acceso: ADMIN global, o admin de algún equipo. Si no es ninguno, fuera.
  const scope = isGlobalAdmin ? null : await getTeamAdminScope({ tenantId, userId });
  if (!isGlobalAdmin && !scope) redirect("/");

  const allTeams = await db.team.findMany({ where: { tenantId }, orderBy: { name: "asc" } });
  const teams = isGlobalAdmin
    ? allTeams
    : (allTeams ?? []).filter(
        (t: any) => Array.isArray(t.adminUserIds) && t.adminUserIds.includes(userId)
      );

  const allUsers = await prisma.user.findMany({
    where: { tenantId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true, active: true },
  });

  // Para un admin de equipo, solo mostramos los usuarios de su(s) equipo(s).
  const visibleDomains = new Set<string>(
    (teams ?? []).flatMap((t: any) => (Array.isArray(t.domains) ? t.domains : []))
  );
  const users = isGlobalAdmin ? allUsers : allUsers.filter((u) => visibleDomains.has(domainOf(u.email)));

  // Usuarios a los que el que mira puede resetear la contraseña.
  const resettableUserIds = isGlobalAdmin
    ? allUsers.map((u) => u.id)
    : (scope?.manageMemberIds ?? []).filter((id) => {
        const u = allUsers.find((x) => x.id === id);
        return !!u && u.role !== Role.ADMIN;
      });

  return (
    <div className="mobile-page-shell">
      <header className="mobile-page-header">
        <div className="mx-auto w-full max-w-6xl px-4 py-4 lg:px-6 lg:py-0">
          <h1 className="text-xl font-semibold tracking-tight lg:text-3xl">Usuarios y equipos</h1>
          <p className="text-sm text-muted-foreground">
            {isGlobalAdmin
              ? "Agrupa usuarios por dominio de correo y define qué puede ver el administrador de cada equipo."
              : "Gestiona los usuarios de tu equipo."}
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
          viewerIsAdmin={isGlobalAdmin}
          resettableUserIds={resettableUserIds}
        />
      </div>
    </div>
  );
}
