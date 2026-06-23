import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { canManageVideoGroups } from "@/lib/video-groups";
import VideoGroupsClient from "./ui/VideoGroupsClient";

export default async function VideoGroupsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const role = (session.user as any).role as Role;
  const capabilities = (session.user as any).capabilities as string[] | undefined;
  if (!canManageVideoGroups(role, capabilities)) redirect("/");

  return (
    <div className="mobile-page-shell">
      <header className="mobile-page-header">
        <div className="mx-auto w-full max-w-5xl px-4 py-4 lg:px-6 lg:py-0">
          <h1 className="text-xl font-semibold tracking-tight lg:text-3xl">Grupos de video</h1>
          <p className="text-sm text-muted-foreground">
            Crea grupos y asigna usuarios. Los miembros de un grupo ven las gestiones y respuestas de su mismo grupo.
          </p>
        </div>
      </header>

      <div className="mobile-page-content max-w-5xl lg:px-6">
        <VideoGroupsClient />
      </div>
    </div>
  );
}
