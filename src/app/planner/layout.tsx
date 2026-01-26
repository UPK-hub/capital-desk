import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Role } from "@prisma/client";
import { CAPABILITIES } from "@/lib/capabilities";
import { redirect } from "next/navigation";

export default async function PlannerLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const caps = (session?.user as any)?.capabilities as string[] | undefined;
  const can =
    session?.user?.role === Role.ADMIN ||
    session?.user?.role === Role.PLANNER ||
    caps?.includes(CAPABILITIES.PLANNER);
  if (!session || !can) {
    redirect("/");
  }
  return <>{children}</>;
}
