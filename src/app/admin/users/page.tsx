import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import UsersAdminClient from "./ui/UsersAdminClient";

export default async function AdminUsersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const role = (session.user as any).role as Role;
  if (role !== Role.ADMIN) redirect("/");

  return (
    <div className="mobile-page-shell">
      <header className="mobile-page-header">
        <div className="mx-auto w-full max-w-6xl px-4 py-4 lg:px-6 lg:py-0">
          <h1 className="text-xl font-semibold tracking-tight lg:text-3xl">Usuarios</h1>
          <p className="text-sm text-muted-foreground">Crear usuarios, asignar roles y restablecer contraseña.</p>
        </div>
      </header>

      <div className="mobile-page-content max-w-6xl lg:px-6">
        <UsersAdminClient />
      </div>
    </div>
  );
}
