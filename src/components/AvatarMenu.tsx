"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

function initials(name: string) {
  const parts = String(name || "U")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "");
  return parts.join("") || "U";
}

export default function AvatarMenu({
  name,
  roleLabel,
}: {
  name: string;
  roleLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const userRole = roleLabel || "Backoffice";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="app-avatar-trigger max-w-full"
      >
        <span className="app-avatar-trigger__avatar">{initials(name)}</span>
        <span className="hidden min-w-0 text-left lg:block">
          <span className="block truncate text-base font-semibold leading-tight text-foreground">{name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {userRole} - CapitalBus
          </span>
        </span>
        <ChevronDown className="hidden h-4 w-4 text-muted-foreground sm:block" />
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-border/70 bg-card p-2 shadow-[var(--shadow-lg)]">
          <Link href="/profile" className="app-menu-item">
            Perfil
          </Link>
          <Link href="/admin" className="app-menu-item">
            Administración
          </Link>
          <div className="my-1 border-t border-border/70" />
          <Link href="/api/auth/signout?callbackUrl=/login" className="app-menu-item">
            Salir
          </Link>
        </div>
      ) : null}
    </div>
  );
}
