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

  return <div className="space-y-6">{children}</div>;
}
