"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import NotificationsBell from "@/components/NotificationsBell";
import AvatarMenu from "@/components/AvatarMenu";
import { SidebarContent, type SidebarNavItem } from "@/components/layout/Sidebar";
import { useSidebar } from "@/contexts/sidebar-context";

export default function TopBar({
  userName,
  navItems,
}: {
  userName: string;
  navItems: SidebarNavItem[];
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
    if (!mobileMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    const onResize = () => {
      if (window.innerWidth >= 1024) setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const handleSidebarToggle = () => {
    if (window.innerWidth >= 1024) {
      toggle();
      return;
    }
    setMobileMenuOpen(true);
  };

  return (
    <>
      <header className="app-topbar sticky top-0 z-30 flex h-16 flex-shrink-0 items-center border-b border-border/60 bg-background/95 px-3 backdrop-blur-sm sm:px-4 md:px-6">
        <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-2 sm:gap-3 md:gap-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="app-pill flex h-10 w-10 items-center justify-center p-0"
              onClick={handleSidebarToggle}
              aria-label={isOpen ? "Ocultar menú" : "Mostrar menú"}
              title={isOpen ? "Ocultar menú" : "Mostrar menú"}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <NotificationsBell />
            <AvatarMenu name={userName} />
          </div>
        </div>
      </header>

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
              className="app-sidebar sidebar-scroll fixed inset-y-0 left-0 z-[95] w-[85vw] max-w-[292px] border-r lg:hidden"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="flex items-center justify-end p-3">
                <button
                  type="button"
                  className="app-pill flex h-9 w-9 items-center justify-center p-0"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Cerrar menú"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
              <SidebarContent
                navItems={navItems}
                userName={userName}
                onNavigate={() => setMobileMenuOpen(false)}
              />
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
