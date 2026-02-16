"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, LogOut } from "lucide-react";
import { useSidebar } from "@/contexts/sidebar-context";

export type SidebarIconKey =
  | "grid"
  | "case"
  | "bus"
  | "video"
  | "planner"
  | "work"
  | "clock"
  | "sts"
  | "tm"
  | "settings"
  | "user";

export type SidebarNavItem = {
  label: string;
  href: string;
  icon: SidebarIconKey;
};

function Icon({ name, className = "h-5 w-5" }: { name: SidebarIconKey; className?: string }) {
  switch (name) {
    case "grid":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
        </svg>
      );
    case "case":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 7h16M4 12h16M4 17h10" />
        </svg>
      );
    case "bus":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M5 16h14V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v9Z" />
          <path d="M7 16v2m10-2v2M7 11h10" />
        </svg>
      );
    case "video":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="6" width="13" height="12" rx="2" />
          <path d="M16 10l5-3v10l-5-3z" />
        </svg>
      );
    case "planner":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4M16 3v4M4 10h16" />
        </svg>
      );
    case "work":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 7h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
          <path d="M9 7V5a3 3 0 0 1 6 0v2" />
        </svg>
      );
    case "clock":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="8" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "sts":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 3v6l4 2" />
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
    case "tm":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 3h18v6H3z" />
          <path d="M6 21V9m6 12V9m6 12V9" />
        </svg>
      );
    case "settings":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06-1.65 2.87-1.1-.32a1.65 1.65 0 0 0-1.8.4l-.82.82-2.87-1.65.06-.06A1.65 1.65 0 0 0 9 19.4l-.32 1.1H5.32l-.32-1.1a1.65 1.65 0 0 0-1.82-.33l-.06.06L1.47 16.3l.06-.06a1.65 1.65 0 0 0 .4-1.8l-.82-.82L2.76 10l1.1.32a1.65 1.65 0 0 0 1.8-.4l.82-.82L9.35 5.5l-.06.06A1.65 1.65 0 0 0 10.6 3.6l.32-1.1h3.36l.32 1.1a1.65 1.65 0 0 0 1.82.33l.06-.06L18.53 7l-.06.06a1.65 1.65 0 0 0-.4 1.8l.82.82L21.24 14l-1.1-.32a1.65 1.65 0 0 0-1.8.4l-.82.82Z" />
        </svg>
      );
    case "user":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c1.8-3.5 13.2-3.5 16 0" />
        </svg>
      );
    default:
      return null;
  }
}

export function SidebarContent({
  navItems,
  userName,
  onNavigate,
  collapsed = false,
}: {
  navItems: SidebarNavItem[];
  userName: string;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();

  return (
    <div className={`flex min-h-full flex-col py-5 ${collapsed ? "px-2" : "px-4 lg:px-6 lg:py-6"}`}>
      <div
        className={`app-sidebar-brand flex items-center transition-all duration-300 ${
          collapsed ? "justify-center px-0" : "gap-3 px-1"
        }`}
      >
        <div
          className={`app-sidebar-brand__badge flex items-center justify-center text-lg font-semibold ${
            collapsed ? "h-12 w-12 rounded-xl p-0" : "h-11 w-11 rounded-2xl"
          }`}
        >
          <Building2 className="h-5 w-5 flex-shrink-0" />
        </div>
        <div
          className={`overflow-hidden transition-[max-width,opacity] duration-200 ${
            collapsed ? "max-w-0 opacity-0" : "max-w-[14rem] opacity-100"
          }`}
        >
          <p className="app-sidebar-brand__meta whitespace-nowrap text-xs uppercase tracking-wide">Capital Desk</p>
          <p className="whitespace-nowrap text-sm font-semibold">{userName}</p>
        </div>
      </div>

      <nav className="app-sidebar-nav mt-6 flex-1 space-y-2 lg:mt-8">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => onNavigate?.()}
              className={`app-nav-link ${active ? "app-nav-link--active" : ""} ${
                collapsed
                  ? "mx-auto h-12 w-12 items-center justify-center gap-0 rounded-xl p-0"
                  : "h-10 gap-3 px-3 py-2.5 justify-start"
              }`}
              title={collapsed ? item.label : undefined}
            >
              {collapsed ? (
                <Icon name={item.icon} className="h-5 w-5 flex-shrink-0" />
              ) : (
                <span className="app-nav-link__icon h-9 w-9">
                  <Icon name={item.icon} className="h-5 w-5" />
                </span>
              )}
              {!collapsed ? (
                <span className="ml-0.5 max-w-[12rem] overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-200 opacity-100">
                  {item.label}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="app-sidebar-footer mt-auto space-y-2 pt-6 text-sm">
        <Link
          className={`app-nav-link ${
            collapsed
              ? "mx-auto h-12 w-12 items-center justify-center gap-0 rounded-xl p-0"
              : "h-10 gap-3 px-3 py-2.5 justify-start"
          }`}
          href="/api/auth/signout?callbackUrl=/login"
          onClick={() => onNavigate?.()}
          title={collapsed ? "Salir" : undefined}
        >
          {collapsed ? (
            <LogOut className="h-5 w-5 flex-shrink-0" />
          ) : (
            <span className="app-nav-link__icon h-9 w-9">
              <LogOut className="h-5 w-5 flex-shrink-0" />
            </span>
          )}
          {!collapsed ? (
            <span className="ml-0.5 max-w-[12rem] overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-200 opacity-100">
              Salir
            </span>
          ) : null}
        </Link>
      </div>
    </div>
  );
}

export default function Sidebar({
  navItems,
  userName,
}: {
  navItems: SidebarNavItem[];
  userName: string;
}) {
  const { isOpen } = useSidebar();

  return (
    <aside
      className={`app-sidebar sidebar-scroll app-sidebar--desktop hidden h-screen flex-shrink-0 border-r transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] lg:flex lg:flex-col ${
        isOpen ? "w-[262px]" : "w-[78px] app-sidebar--collapsed"
      }`}
    >
      <SidebarContent navItems={navItems} userName={userName} collapsed={!isOpen} />
    </aside>
  );
}
