import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import NotificationsBell from "@/components/NotificationsBell";
import AvatarMenu from "@/components/AvatarMenu";
import FloatingMessenger from "@/components/FloatingMessenger";
import GlobalSearchBar from "@/components/GlobalSearchBar";

type NavItem = { label: string; href: string; icon: React.ReactNode; roles?: Role[]; capabilities?: string[] };

const icons = {
  grid: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
    </svg>
  ),
  case: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7h16M4 12h16M4 17h10" />
    </svg>
  ),
  bus: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 16h14V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v9Z" />
      <path d="M7 16v2m10-2v2M7 11h10" />
    </svg>
  ),
  video: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="M16 10l5-3v10l-5-3z" />
    </svg>
  ),
  planner: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </svg>
  ),
  work: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <path d="M9 7V5a3 3 0 0 1 6 0v2" />
    </svg>
  ),
  sts: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3v6l4 2" />
      <circle cx="12" cy="12" r="8" />
    </svg>
  ),
  tm: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 3h18v6H3z" />
      <path d="M6 21V9m6 12V9m6 12V9" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06-1.65 2.87-1.1-.32a1.65 1.65 0 0 0-1.8.4l-.82.82-2.87-1.65.06-.06A1.65 1.65 0 0 0 9 19.4l-.32 1.1H5.32l-.32-1.1a1.65 1.65 0 0 0-1.82-.33l-.06.06L1.47 16.3l.06-.06a1.65 1.65 0 0 0 .4-1.8l-.82-.82L2.76 10l1.1.32a1.65 1.65 0 0 0 1.8-.4l.82-.82L9.35 5.5l-.06.06A1.65 1.65 0 0 0 10.6 3.6l.32-1.1h3.36l.32 1.1a1.65 1.65 0 0 0 1.82.33l.06-.06L18.53 7l-.06.06a1.65 1.65 0 0 0-.4 1.8l.82.82L21.24 14l-1.1-.32a1.65 1.65 0 0 0-1.8.4l-.82.82Z" />
    </svg>
  ),
  user: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c1.8-3.5 13.2-3.5 16 0" />
    </svg>
  ),
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

  const navItems: NavItem[] = [
    { label: "Resumen", href: "/", icon: icons.grid },
    { label: "Casos", href: "/cases", icon: icons.case, roles: [Role.ADMIN, Role.BACKOFFICE, Role.SUPERVISOR] },
    { label: "Buses", href: "/buses", icon: icons.bus, roles: [Role.ADMIN, Role.BACKOFFICE, Role.SUPERVISOR] },
    { label: "Videos", href: "/video-requests", icon: icons.video, roles: [Role.ADMIN, Role.BACKOFFICE, Role.SUPERVISOR] },
    { label: "Planner", href: "/planner", icon: icons.planner, capabilities: ["PLANNER"] },
    { label: "OTs", href: "/work-orders", icon: icons.work, roles: [Role.TECHNICIAN] },
    { label: "STS", href: "/sts", icon: icons.sts, capabilities: ["STS_READ", "STS_ADMIN", "STS_WRITE"] },
    { label: "TM", href: "/tm", icon: icons.tm, capabilities: ["TM_READ"] },
    { label: "Admin", href: "/admin", icon: icons.settings, roles: [Role.ADMIN] },
    { label: "Perfil", href: "/profile", icon: icons.user },
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
        "--muted-light": theme.muted,
        "--muted-foreground-light": theme.mutedForeground,
        "--background-dark": theme.backgroundDark,
        "--foreground-dark": theme.foregroundDark,
        "--card-dark": theme.cardDark,
        "--card-foreground-dark": theme.cardForegroundDark,
        "--primary-dark": theme.primaryDark,
        "--primary-foreground-dark": theme.primaryForegroundDark,
        "--border-dark": theme.borderDark,
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
      className={`min-h-screen sts-shell ${theme ? "theme-shell" : ""} ${isDark ? "dark" : ""} ${
        isSystem ? "theme-system" : ""
      }`}
      style={themeStyle}
    >
      {!session?.user ? (
        <main className="mx-auto max-w-3xl px-4 py-10">{children}</main>
      ) : (
        <div className="flex min-h-screen flex-col lg:flex-row">
          <aside className="w-full border-b lg:w-[240px] lg:border-b-0 lg:border-r app-sidebar relative z-40 overflow-visible">
            <div className="flex h-full flex-col px-4 py-5 lg:px-6 lg:py-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-lg font-semibold">
                  @
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-white/60">Capital Desk</p>
                  <p className="text-sm font-semibold">{session.user.name}</p>
                </div>
              </div>

              <div className="mt-6 space-y-2 lg:mt-8 app-sidebar-nav">
                {filteredNav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10">
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </Link>
                ))}
                <div className="pt-4">
                  <NotificationsBell />
                </div>
              </div>

              <div className="mt-auto space-y-2 pt-6 text-sm text-white/60 app-sidebar-footer">
                <Link className="flex items-center gap-3 rounded-2xl px-3 py-2 hover:bg-white/10 hover:text-white" href="/profile">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10">
                    {icons.user}
                  </span>
                  Perfil
                </Link>
                <Link
                  className="flex items-center gap-3 rounded-2xl px-3 py-2 hover:bg-white/10 hover:text-white"
                  href="/api/auth/signout?callbackUrl=/login"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M10 17l5-5-5-5" />
                      <path d="M15 12H3" />
                      <path d="M21 19V5a2 2 0 0 0-2-2h-6" />
                    </svg>
                  </span>
                  Salir
                </Link>
              </div>
            </div>
          </aside>

          <div className="flex-1 relative z-10">
            <header className="app-topbar relative z-30 overflow-visible">
              <div className="mx-auto flex max-w-6xl items-center justify-end gap-3 px-4 py-4 md:gap-4 md:px-6">
                <div className="w-full max-w-md">
                  <GlobalSearchBar />
                </div>
                <AvatarMenu name={session.user.name ?? "Usuario"} />
              </div>
            </header>

            <main className="mx-auto max-w-6xl px-4 py-5 md:px-6 md:py-6">{children}</main>

            <FloatingMessenger
              currentUserId={(session.user as any).id as string}
              currentUserName={session.user.name ?? "Usuario"}
            />
          </div>
        </div>
      )}
    </div>
  );
}
