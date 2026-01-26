import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Role } from "@prisma/client";
import { CAPABILITIES } from "@/lib/capabilities";
import { redirect } from "next/navigation";

function canAccess(role: Role, capabilities: string[] | undefined) {
  return (
    role === Role.ADMIN ||
    role === Role.SUPERVISOR ||
    role === Role.HELPDESK ||
    role === Role.AUDITOR ||
    capabilities?.includes(CAPABILITIES.STS_READ) ||
    capabilities?.includes(CAPABILITIES.STS_WRITE) ||
    capabilities?.includes(CAPABILITIES.STS_ADMIN)
  );
}

export default async function StsLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const caps = (session?.user as any)?.capabilities as string[] | undefined;
  if (!session?.user || !canAccess(session.user.role, caps)) {
    redirect("/");
  }

  const isAdmin =
    session.user.role === Role.ADMIN ||
    session.user.role === Role.SUPERVISOR ||
    caps?.includes(CAPABILITIES.STS_ADMIN);

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between">
          <Link href="/" className="font-semibold">
            Capital Desk
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link className="underline" href="/sts">Dashboard</Link>
            <Link className="underline" href="/sts/tickets">Tickets</Link>
            <Link className="underline" href="/sts/reports">Reportes</Link>
            {isAdmin ? <Link className="underline" href="/sts/admin">Configuracion</Link> : null}
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
