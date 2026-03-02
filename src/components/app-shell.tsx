import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { CAPABILITIES } from "@/lib/capabilities";
import FloatingMessenger from "@/components/FloatingMessenger";
import RouteTransition from "@/components/RouteTransition";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import { ScrollToTop } from "@/components/ui/scroll-to-top";
import { SidebarProvider } from "@/contexts/sidebar-context";
import type { SidebarIconKey } from "@/components/layout/Sidebar";

type NavSection = "main" | "reports" | "admin";
type NavItem = {
  label: string;
  href: string;
  icon: SidebarIconKey;
  section: NavSection;
  color?: string;
  subtitle?: string;
  badge?: number;
  roles?: Role[];
  capabilities?: string[];
  hiddenForCapabilities?: string[];
};

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
  const roleLabelMap: Partial<Record<Role, string>> = {
    ADMIN: "Administración",
    BACKOFFICE: "Backoffice",
    TECHNICIAN: "Técnico",
    PLANNER: "Planner",
    SUPERVISOR: "Supervisor",
    HELPDESK: "Helpdesk",
  };
  const roleLabel = role ? roleLabelMap[role] ?? String(role) : "Usuario";

  const navItems: NavItem[] = [
    { label: "Inicio", href: "/", icon: "home", section: "main", color: "var(--color-primary)" },
    {
      label: "Casos",
      href: "/cases",
      icon: "case",
      section: "main",
      color: "var(--color-sts)",
      roles: [Role.ADMIN, Role.BACKOFFICE, Role.SUPERVISOR],
      hiddenForCapabilities: [CAPABILITIES.VIDEOS_ONLY],
    },
    {
      label: "Novedades",
      href: "/novedades",
      icon: "case",
      section: "main",
      color: "var(--color-backoffice)",
      roles: [Role.ADMIN, Role.BACKOFFICE, Role.SUPERVISOR, Role.PLANNER],
      hiddenForCapabilities: [CAPABILITIES.VIDEOS_ONLY],
    },
    {
      label: "Buses",
      href: "/buses",
      icon: "bus",
      section: "main",
      color: "var(--color-planner)",
      roles: [Role.ADMIN, Role.BACKOFFICE, Role.SUPERVISOR],
    },
    {
      label: "Videos",
      href: "/video-requests",
      icon: "video",
      section: "main",
      color: "var(--color-videos)",
      roles: [Role.ADMIN, Role.BACKOFFICE, Role.SUPERVISOR],
    },
    {
      label: "RVR",
      href: "/rvr",
      icon: "planner",
      section: "main",
      color: "var(--color-planner)",
      subtitle: "Revisión visual remota",
      roles: [Role.ADMIN, Role.BACKOFFICE, Role.SUPERVISOR],
      hiddenForCapabilities: [CAPABILITIES.VIDEOS_ONLY],
    },
    {
      label: "Planner",
      href: "/planner",
      icon: "planner",
      section: "main",
      color: "var(--color-planner)",
      subtitle: "Planeación semanal",
      capabilities: ["PLANNER"],
    },
    {
      label: "OTs",
      href: "/work-orders",
      icon: "work",
      section: "main",
      color: "var(--color-tecnico)",
      roles: [Role.TECHNICIAN],
    },
    {
      label: "Turnos",
      href: "/technicians/shifts",
      icon: "clock",
      section: "main",
      color: "var(--color-tm)",
      roles: [Role.ADMIN, Role.BACKOFFICE],
      hiddenForCapabilities: [CAPABILITIES.BACKOFFICE_RESTRICTED, CAPABILITIES.VIDEOS_ONLY],
    },
    {
      label: "STS",
      href: "/sts",
      icon: "sts",
      section: "reports",
      color: "var(--color-sts)",
      capabilities: ["STS_READ", "STS_ADMIN", "STS_WRITE"],
    },
    {
      label: "TM",
      href: "/tm",
      icon: "tm",
      section: "reports",
      color: "var(--color-tm)",
      capabilities: [CAPABILITIES.TM_READ],
    },
    {
      label: "Telemetría",
      href: "/telemetry",
      icon: "telemetry",
      section: "reports",
      color: "var(--color-tm)",
      roles: [Role.ADMIN],
    },
    {
      label: "Administración",
      href: "/admin",
      icon: "settings",
      section: "admin",
      color: "var(--color-admin)",
      roles: [Role.ADMIN],
    },
    {
      label: "Admin",
      href: "/admin/users",
      icon: "admin",
      section: "admin",
      color: "var(--color-admin)",
      roles: [Role.ADMIN],
    },
    { label: "Perfil", href: "/profile", icon: "user", section: "admin", color: "var(--color-admin)" },
  ];

  const filteredNav = navItems.filter((item) => {
    if (!session?.user) return false;
    if (role === Role.ADMIN) return true;
    if (item.hiddenForCapabilities?.some((cap) => capabilities.includes(cap))) return false;
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
          <div className="app-layout__body flex min-h-[100dvh] h-[100dvh] flex-col overflow-hidden lg:h-screen lg:flex-row">
            <Sidebar navItems={filteredNav} userName={userName} userRoleLabel={roleLabel} />

            <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
              <TopBar userName={userName} userRoleLabel={roleLabel} navItems={filteredNav} />

              <main className="main-scroll flex-1 overflow-x-hidden overflow-y-auto">
                <div className="app-main mx-auto max-w-[1600px] px-4 py-6 md:px-6 lg:px-8">
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
