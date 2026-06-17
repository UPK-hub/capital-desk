"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  BarChart3,
  Briefcase,
  BusFront,
  CalendarDays,
  Clock3,
  Flag,
  Home,
  LayoutDashboard,
  LogOut,
  Satellite,
  Settings,
  TrendingUp,
  UserCircle,
  UserCog,
  Video,
  Wrench,
} from "lucide-react";
import { useSidebar } from "@/contexts/sidebar-context";
import { fadeInRight, listItem, staggerContainer } from "@/lib/animations";

export type SidebarIconKey =
  | "home"
  | "grid"
  | "case"
  | "novelty"
  | "bus"
  | "video"
  | "planner"
  | "work"
  | "clock"
  | "sts"
  | "tm"
  | "telemetry"
  | "settings"
  | "admin"
  | "user";

export type SidebarNavItem = {
  label: string;
  href: string;
  icon: SidebarIconKey;
  section?: "main" | "reports" | "admin";
  color?: string;
  subtitle?: string;
  badge?: number;
};

function iconFor(name: SidebarIconKey) {
  switch (name) {
    case "home":
      return Home;
    case "grid":
      return LayoutDashboard;
    case "case":
      return Briefcase;
    case "novelty":
      return Flag;
    case "bus":
      return BusFront;
    case "video":
      return Video;
    case "planner":
      return CalendarDays;
    case "work":
      return Wrench;
    case "clock":
      return Clock3;
    case "sts":
      return BarChart3;
    case "tm":
      return TrendingUp;
    case "telemetry":
      return Satellite;
    case "settings":
      return Settings;
    case "admin":
      return UserCog;
    case "user":
      return UserCircle;
    default:
      return LayoutDashboard;
  }
}

function initials(name: string) {
  const parts = String(name || "U")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "");
  return parts.join("") || "U";
}

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const SECTION_LABELS: Record<NonNullable<SidebarNavItem["section"]>, string | null> = {
  main: null,
  reports: "Reportes",
  admin: "Administración",
};

export function SidebarContent({
  navItems,
  userName,
  userRoleLabel,
  onNavigate,
  collapsed = false,
}: {
  navItems: SidebarNavItem[];
  userName: string;
  userRoleLabel?: string;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const roleLabel = userRoleLabel || "Backoffice";
  const sections = (["main", "reports", "admin"] as const)
    .map((section) => ({
      section,
      label: SECTION_LABELS[section],
      items: navItems.filter((item) => (item.section ?? "main") === section),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className={`flex min-h-full min-w-0 flex-col overflow-hidden ${collapsed ? "px-2 py-3" : "px-3 py-4"}`}>
      <motion.div
        variants={fadeInRight}
        initial="initial"
        animate="animate"
        className={`app-sidebar-profile min-w-0 ${collapsed ? "justify-center" : ""}`}
      >
        <div className="app-sidebar-profile__avatar">{initials(userName)}</div>
        {!collapsed ? (
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold leading-tight text-white">{userName}</p>
            <p className="truncate text-xs text-white/65">
              {roleLabel} - CapitalBus
            </p>
          </div>
        ) : null}
      </motion.div>

      <motion.nav
        className="app-sidebar-nav mt-4 min-w-0 flex-1 overflow-y-auto overflow-x-hidden pr-0.5"
        variants={staggerContainer(0.035, 0.01)}
        initial="initial"
        animate="animate"
      >
        {sections.map((group) => (
          <div key={group.section} className="mb-3">
            {group.label && !collapsed ? (
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/45">
                {group.label}
              </p>
            ) : null}

            <div className="space-y-1">
              {group.items.map((item) => {
                const active = isActivePath(pathname, item.href);
                const Icon = iconFor(item.icon);
                const iconColor = item.color || "var(--color-primary)";
                const isTmItem = item.icon === "tm" || item.label.toLowerCase() === "tm";
                return (
                  <motion.div
                    key={`${group.section}-${item.href}-${item.label}`}
                    variants={listItem}
                    whileHover={{ x: collapsed ? 0 : 3 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Link
                      href={item.href}
                      onClick={() => onNavigate?.()}
                      className={`app-nav-link ${active ? "app-nav-link--active" : ""} ${
                        collapsed
                          ? "mx-auto h-11 w-11 items-center justify-center gap-0 rounded-xl p-0"
                          : "h-auto min-w-0 gap-3 rounded-xl px-3 py-2.5"
                      }`}
                      title={collapsed ? item.label : undefined}
                    >
                      <span
                        className={`app-nav-link__icon ${active ? "app-nav-link__icon--active" : ""}`}
                        style={{
                          color: iconColor,
                          backgroundColor: `color-mix(in srgb, ${iconColor} 22%, transparent)`,
                        }}
                      >
                        {isTmItem ? (
                          <Image
                            src="/resources/TM_Logo.png"
                            alt="TM"
                            width={20}
                            height={20}
                            className="h-5 w-5 object-contain"
                          />
                        ) : (
                          <Icon className="h-4 w-4" />
                        )}
                      </span>

                      {!collapsed ? (
                        <span className="min-w-0 flex-1 overflow-hidden">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium">{item.label}</span>
                            {typeof item.badge === "number" && item.badge > 0 ? (
                              <span className="app-nav-link__badge">{item.badge}</span>
                            ) : null}
                          </span>
                          {item.subtitle ? (
                            <span className="mt-0.5 block truncate text-[11px] text-white/55">{item.subtitle}</span>
                          ) : null}
                        </span>
                      ) : null}
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </div>
        ))}
      </motion.nav>

      <div className="app-sidebar-footer mt-auto pt-2">
        <Link
          className={`app-nav-link ${collapsed ? "mx-auto h-11 w-11 items-center justify-center gap-0 rounded-xl p-0" : "h-11 gap-3 rounded-xl px-3 py-2.5"}`}
          href="/api/auth/signout?callbackUrl=/login"
          onClick={() => onNavigate?.()}
          title={collapsed ? "Salir" : undefined}
        >
          <span className="app-nav-link__icon" style={{ color: "#c7d2fe" }}>
            <LogOut className="h-4 w-4" />
          </span>
          {!collapsed ? <span className="text-sm font-medium">Salir</span> : null}
        </Link>
      </div>
    </div>
  );
}

export default function Sidebar({
  navItems,
  userName,
  userRoleLabel,
}: {
  navItems: SidebarNavItem[];
  userName: string;
  userRoleLabel?: string;
}) {
  const { isOpen } = useSidebar();

  return (
    <motion.aside
      className={`app-sidebar sidebar-scroll app-sidebar--desktop hidden h-screen flex-shrink-0 border-r transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] lg:flex lg:flex-col ${
        isOpen ? "w-[252px]" : "w-[84px]"
      }`}
      initial={{ x: -30, opacity: 0 }}
      animate={{ x: 0, opacity: 1, width: isOpen ? 252 : 84 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
    >
      <SidebarContent
        navItems={navItems}
        userName={userName}
        userRoleLabel={userRoleLabel}
        collapsed={!isOpen}
      />
    </motion.aside>
  );
}
