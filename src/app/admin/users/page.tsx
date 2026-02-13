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
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Usuarios</h1>
        <p className="text-sm text-muted-foreground">Crear usuarios, asignar roles y restablecer contraseña.</p>
      </div>

      <UsersAdminClient />
    </div>
  );
}
