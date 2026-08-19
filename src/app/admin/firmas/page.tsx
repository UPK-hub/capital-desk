import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { Role } from "@prisma/client";
import FirmasClient from "./ui/FirmasClient";

export default async function FirmasAdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const role = (session.user as any).role as Role;
  if (role !== Role.ADMIN && role !== Role.SUPERVISOR) redirect("/");

  return (
    <div className="mx-auto max-w-3xl p-6 md:p-8 space-y-6">
      <section className="sts-card p-6 md:p-7">
        <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Documentos</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Firmas de documentos</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Estos nombres salen en las firmas del certificado de mantenimiento preventivo y del acta de
          causa raíz de descarga de video. La primera firma siempre es la del técnico que ejecutó el
          trabajo y se toma automáticamente del caso.
        </p>
      </section>
      <FirmasClient />
    </div>
  );
}
