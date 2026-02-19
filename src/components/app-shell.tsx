import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import FloatingMessenger from "@/components/FloatingMessenger";
import RouteTransition from "@/components/RouteTransition";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import { ScrollToTop } from "@/components/ui/scroll-to-top";
import { SidebarProvider } from "@/contexts/sidebar-context";
import type { SidebarIconKey } from "@/components/layout/Sidebar";

type NavItem = { label: string; href: string; icon: SidebarIconKey; roles?: Role[]; capabilities?: string[] };

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const tenantId = (session?.user as any)?.tenantId as string | undefined;
  const theme = tenantId
    ? await prisma.themeSettings.findFirst({ where: { tenantId } })
    : await prisma.themeSettings.findFirst();
  const mode = theme?.mode === "dark" ? "dark" : theme?.mode === "system" ? "system" : "light";
  const isDark = mode === "dark";
  const isSystem = mode === "system";

  const role = session?.user?.role as Role | undefined;
  const capabilities = ((session?.user as any)?.capabilities as string[]) ?? [];
  const userName = ((session?.user as any)?.name as string | undefined) ?? "Usuario";

  const navItems: NavItem[] = [
    { label: "Resumen", href: "/", icon: "grid" },
    { label: "Casos", href: "/cases", icon: "case", roles: [Role.ADMIN, Role.BACKOFFICE, Role.SUPERVISOR] },
    { label: "Buses", href: "/buses", icon: "bus", roles: [Role.ADMIN, Role.BACKOFFICE, Role.SUPERVISOR] },
    { label: "Videos", href: "/video-requests", icon: "video", roles: [Role.ADMIN, Role.BACKOFFICE, Role.SUPERVISOR] },
    { label: "Planner", href: "/planner", icon: "planner", capabilities: ["PLANNER"] },
    { label: "OTs", href: "/work-orders", icon: "work", roles: [Role.TECHNICIAN] },
    { label: "Turnos", href: "/technicians/shifts", icon: "clock", roles: [Role.ADMIN, Role.BACKOFFICE] },
    { label: "STS", href: "/sts", icon: "sts", capabilities: ["STS_READ", "STS_ADMIN", "STS_WRITE"] },
    { label: "TM", href: "/tm", icon: "tm", capabilities: ["TM_READ"] },
    { label: "Admin", href: "/admin", icon: "settings", roles: [Role.ADMIN] },
    { label: "Perfil", href: "/profile", icon: "user" },
  ];

  const filteredNav = navItems.filter((item) => {
    if (!session?.user) return false;
    if (role === Role.ADMIN) return true;
    const allowRole = item.roles ? (role ? item.roles.includes(role) : false) : true;
    const allowCap = item.capabilities
      ? role === Role.BACKOFFICE && item.capabilities.some((c) => capabilities.includes(c))
      : true;
    return allowRole && allowCap;
  });

  const themeStyle = theme
    ? ({
        "--background-light": theme.background,
        "--foreground-light": theme.foreground,
        "--card-light": theme.card,
        "--card-foreground-light": theme.cardForeground,
        "--primary-light": theme.primary,
        "--primary-foreground-light": theme.primaryForeground,
        "--border-light": theme.border,
        "--input-light": theme.muted,
        "--ring-light": theme.primary,
        "--muted-light": theme.muted,
        "--muted-foreground-light": theme.mutedForeground,
        "--background-dark": theme.backgroundDark,
        "--foreground-dark": theme.foregroundDark,
        "--card-dark": theme.cardDark,
        "--card-foreground-dark": theme.cardForegroundDark,
        "--primary-dark": theme.primaryDark,
        "--primary-foreground-dark": theme.primaryForegroundDark,
        "--border-dark": theme.borderDark,
        "--input-dark": theme.mutedDark,
        "--ring-dark": theme.primaryDark,
        "--muted-dark": theme.mutedDark,
        "--muted-foreground-dark": theme.mutedForegroundDark,
        "--radius": theme.radius,
        "--sts-bg-light": theme.stsBg,
        "--sts-accent-light": theme.stsAccent,
        "--sts-accent-2-light": theme.stsAccent2,
        "--sts-bg-dark": theme.stsBgDark,
        "--sts-accent-dark": theme.stsAccentDark,
        "--sts-accent-2-dark": theme.stsAccent2Dark,
        "--font-sans": theme.fontSans,
        "--font-display": theme.fontDisplay,
      } as React.CSSProperties)
    : undefined;

  return (
    <div
      className={`min-h-screen sts-shell app-layout ${theme ? "theme-shell" : ""} ${isDark ? "dark" : ""} ${
        isSystem ? "theme-system" : ""
      }`}
      style={themeStyle}
    >
      {!session?.user ? (
        <main className="mx-auto max-w-3xl px-4 py-10">{children}</main>
      ) : (
        <SidebarProvider>
          <div className="app-layout__body flex h-screen flex-col overflow-hidden lg:flex-row">
            <Sidebar navItems={filteredNav} userName={userName} />

            <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
              <TopBar userName={userName} navItems={filteredNav} />

              <main className="main-scroll flex-1 overflow-y-auto">
                <div className="mx-auto max-w-[1600px] px-4 py-5 md:px-6 md:py-6 app-main">
                  <RouteTransition>{children}</RouteTransition>
                </div>
              </main>
            </div>

            <ScrollToTop />

            <FloatingMessenger
              currentUserId={(session.user as any).id as string}
              currentUserName={userName}
            />
          </div>
        </SidebarProvider>
      )}
    </div>
  );
}
