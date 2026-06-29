"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

// Filtro en vivo: aplica los filtros al cambiar (desplegables/fechas al instante,
// texto con un pequeño retardo) sin tener que dar "Filtrar". Navegación suave.
export default function AutoFilterForm({
  className,
  basePath = "/cases",
  children,
}: {
  className?: string;
  basePath?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const ref = React.useRef<HTMLFormElement>(null);
  const timer = React.useRef<any>(null);

  const apply = React.useCallback(() => {
    const form = ref.current;
    if (!form) return;
    const fd = new FormData(form);
    const p = new URLSearchParams();
    for (const [k, v] of fd.entries()) {
      const s = String(v).trim();
      if (s) p.set(k, s);
    }
    const qs = p.toString();
    router.push(`${basePath}${qs ? `?${qs}` : ""}`);
  }, [router, basePath]);

  const onChange = (e: React.ChangeEvent<HTMLFormElement>) => {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    const tag = (el?.tagName || "").toLowerCase();
    const type = (el as HTMLInputElement)?.type;
    if (tag === "select" || type === "date" || type === "checkbox") {
      if (timer.current) clearTimeout(timer.current);
      apply();
    } else {
      // texto: aplica con un pequeño retardo mientras se escribe
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(apply, 400);
    }
  };

  React.useEffect(() => () => timer.current && clearTimeout(timer.current), []);

  return (
    <form
      ref={ref}
      method="get"
      action={basePath}
      className={className}
      onChange={onChange}
      onSubmit={(e) => {
        e.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        apply();
      }}
    >
      {children}
    </form>
  );
}
