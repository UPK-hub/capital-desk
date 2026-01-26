"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export default function AvatarMenu({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const initial = name?.[0]?.toUpperCase() ?? "U";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 app-pill"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-600">
          {initial}
        </span>
        <span className="hidden text-sm font-medium md:block">{name}</span>
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-zinc-500" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div className="absolute right-0 mt-2 w-48 sts-card p-2 text-sm shadow-lg z-50">
          <Link href="/profile" className="app-menu-item">
            Perfil
          </Link>
          <Link href="/admin" className="app-menu-item">
            Administración
          </Link>
          <div className="my-1 border-t" />
          <Link href="/api/auth/signout?callbackUrl=/login" className="app-menu-item">
            Salir
          </Link>
        </div>
      ) : null}
    </div>
  );
}
