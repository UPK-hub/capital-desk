import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Role } from "@prisma/client";
import { CAPABILITIES } from "@/lib/capabilities";
import RvrDailyClient from "@/app/(backoffice)/rvr/ui/RvrDailyClient";

export default async function RvrPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="sts-card p-4">
          <p className="text-sm">Debes iniciar sesión.</p>
          <Link className="text-sm underline" href="/login">
            Ir a login
          </Link>
        </div>
      </div>
    );
  }

  const role = (session.user as any).role as Role;
  const caps = ((session.user as any).capabilities as string[] | undefined) ?? [];
  const videosOnly = role === Role.BACKOFFICE && caps.includes(CAPABILITIES.VIDEOS_ONLY);
  if (
    videosOnly ||
    (role !== Role.ADMIN && role !== Role.BACKOFFICE && role !== Role.SUPERVISOR)
  ) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="sts-card p-4">
          <p className="text-sm">No autorizado.</p>
        </div>
      </div>
    );
  }

  const userName = String((session.user as any).name ?? "Coordinador");
  return <RvrDailyClient userName={userName} />;
}
