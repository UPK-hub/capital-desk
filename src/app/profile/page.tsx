import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import ProfileClient from "./ui/ProfileClient";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams?: { forcePasswordChange?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="sts-card p-6">
          <p className="text-sm">Debes iniciar sesión.</p>
          <Link className="text-sm underline" href="/login">
            Ir a login
          </Link>
        </div>
      </div>
    );
  }

  const userId = (session.user as any).id as string;
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, role: true, phone: true, jobTitle: true, document: true },
  });

  const user = {
    name: dbUser?.name ?? session.user.name ?? "Usuario",
    email: dbUser?.email ?? ((session.user as any).email as string),
    role: dbUser?.role ?? session.user.role,
    phone: dbUser?.phone ?? "",
    jobTitle: dbUser?.jobTitle ?? "",
    document: dbUser?.document ?? "",
    forcePasswordChange: Boolean((session.user as any).forcePasswordChange),
  };

  const forcePasswordChange =
    searchParams?.forcePasswordChange === "1" || user.forcePasswordChange;

  return <ProfileClient user={user} forcePasswordChange={forcePasswordChange} />;
}
