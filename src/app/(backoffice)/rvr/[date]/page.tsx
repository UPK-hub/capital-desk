import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Role } from "@prisma/client";
import { CAPABILITIES } from "@/lib/capabilities";
import RvrDailyClient from "@/app/(backoffice)/rvr/ui/RvrDailyClient";

// Detalle de UNA revisión visual remota (la del día indicado en la URL).
export default async function RvrDetailPage({ params }: { params: { date: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return (
      <div className="rounded-2xl border border-border/60 bg-white p-4 shadow-sm">
        <p className="text-sm">Debes iniciar sesión.</p>
        <Link className="text-sm underline" href="/login">
          Ir a login
        </Link>
      </div>
    );
  }

  const role = (session.user as any).role as Role;
  const caps = ((session.user as any).capabilities as string[] | undefined) ?? [];
  const videosOnly = role === Role.BACKOFFICE && caps.includes(CAPABILITIES.VIDEOS_ONLY);
  if (videosOnly || (role !== Role.ADMIN && role !== Role.BACKOFFICE && role !== Role.SUPERVISOR)) {
    return (
      <div className="rounded-2xl border border-border/60 bg-white p-4 shadow-sm">
        <p className="text-sm">No autorizado.</p>
      </div>
    );
  }

  const date = String(params.date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return (
      <div className="rounded-2xl border border-border/60 bg-white p-4 shadow-sm">
        <p className="text-sm">Fecha inválida.</p>
        <Link className="text-sm underline" href="/rvr">
          Volver al listado
        </Link>
      </div>
    );
  }

  const userName = String((session.user as any).name ?? "Coordinador");
  return <RvrDailyClient userName={userName} initialDate={date} />;
}
