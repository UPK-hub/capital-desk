"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { Bell, Menu } from "lucide-react";
import AvatarMenu from "@/components/AvatarMenu";
import { SidebarContent, type SidebarNavItem } from "@/components/layout/Sidebar";
import { NotificationsPanel } from "@/components/layout/NotificationsPanel";
import { useSidebar } from "@/contexts/sidebar-context";
import { bounce, scaleIn } from "@/lib/animations";

type OpenPanel = "notifications" | null;

export default function TopBar({
  userName,
  userRoleLabel,
  navItems,
}: {
  userName: string;
  userRoleLabel?: string;
  navItems: SidebarNavItem[];
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const pathname = usePathname();
  const { isOpen, toggle } = useSidebar();

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!openPanel) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenPanel(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openPanel]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onResize = () => {
      if (window.innerWidth >= 1024) setMobileMenuOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    setMobileMenuOpen(false);
    setOpenPanel(null);
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;

    async function loadBadges() {
      try {
        const notificationsRes = await fetch("/api/notifications?take=1", { cache: "no-store" });

        if (!cancelled && notificationsRes.ok) {
          const payload = await notificationsRes.json().catch(() => ({}));
          setUnreadNotifications(Number(payload?.unreadCount ?? 0));
        }
      } catch {
        // Ignore badge polling errors.
      }
    }

    void loadBadges();
    const timer = window.setInterval(() => {
      void loadBadges();
    }, 20000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const handleSidebarToggle = () => {
    if (window.innerWidth >= 1024) {
      toggle();
      return;
    }
    setMobileMenuOpen(true);
  };

  const panelOpen = openPanel !== null;

  return (
    <>
      <header className="app-topbar sticky top-0 z-[80] flex h-14 flex-shrink-0 items-center border-b px-2.5 backdrop-blur-sm sm:h-16 sm:px-4 md:px-6">
        <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-2 sm:gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2 md:gap-3">
            <button
              type="button"
              className="app-pill flex h-9 w-9 flex-shrink-0 items-center justify-center p-0 transition-transform duration-200 active:scale-95 sm:h-10 sm:w-10"
              onClick={handleSidebarToggle}
              aria-label={isOpen ? "Ocultar menú" : "Mostrar menú"}
              title={isOpen ? "Ocultar menú" : "Mostrar menú"}
            >
              <Menu className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>

            <nav className="hidden items-center text-sm sm:flex">
              <span className="font-semibold text-foreground/95">Inicio</span>
            </nav>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <div className="relative">
              <button
                type="button"
                className="app-pill relative flex h-9 w-9 flex-shrink-0 items-center justify-center p-0 transition-transform duration-200 active:scale-95 sm:h-10 sm:w-10"
                aria-label="Notificaciones"
                title="Notificaciones"
                onClick={() => setOpenPanel((prev) => (prev === "notifications" ? null : "notifications"))}
              >
                <Bell className="h-4 w-4 text-foreground/85 sm:h-5 sm:w-5" />
                {unreadNotifications > 0 ? (
                  <motion.span
                    variants={bounce}
                    initial="initial"
                    animate="animate"
                    className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-red-500"
                  />
                ) : null}
              </button>

              <AnimatePresence>
                {openPanel === "notifications" ? (
                  <motion.div
                    variants={scaleIn}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="notification-panel dropdown-panel fixed left-1/2 top-[3.75rem] z-[100] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 sm:left-auto sm:right-4 sm:top-[4.25rem] sm:w-[24rem] sm:max-w-[calc(100vw-1.5rem)] sm:translate-x-0"
                  >
                    <NotificationsPanel
                      onClose={() => setOpenPanel(null)}
                      onUnreadChange={setUnreadNotifications}
                    />
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            <div className="mx-1 hidden h-8 w-px bg-border/80 md:block" />
            <AvatarMenu name={userName} roleLabel={userRoleLabel} />
          </div>
        </div>
      </header>

      {panelOpen ? (
        <button
          type="button"
          aria-label="Cerrar paneles"
          className="dropdown-overlay fixed inset-0 z-[70]"
          onClick={() => setOpenPanel(null)}
        />
      ) : null}

      <AnimatePresence>
        {mobileMenuOpen ? (
          <>
            <motion.button
              type="button"
              className="fixed inset-0 z-[90] bg-black/45 backdrop-blur-[1px] lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Cerrar menú"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            />

            <motion.aside
              className="app-sidebar sidebar-scroll fixed inset-y-0 left-0 z-[95] w-[84vw] max-w-[292px] border-r lg:hidden"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              <SidebarContent
                navItems={navItems}
                userName={userName}
                userRoleLabel={userRoleLabel}
                onNavigate={() => setMobileMenuOpen(false)}
              />
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
