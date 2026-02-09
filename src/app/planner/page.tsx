import PlannerCalendarClient from "./ui/PlannerCalendarClient";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Role } from "@prisma/client";
import { redirect } from "next/navigation";

export default async function PlannerPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const role = session.user.role as Role;
  const caps = (session.user as any).capabilities as string[] | undefined;
  const canPlanner = role === Role.ADMIN || (role === Role.BACKOFFICE && caps?.includes("PLANNER"));
  if (!canPlanner) redirect("/");

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Planner semanal</h1>
      <PlannerCalendarClient />
    </div>
  );
}
