"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

// Filtro en vivo: aplica los filtros al cambiar (selects/fechas al instante,
// texto con un pequeño retardo) sin tener que dar "Filtrar". Usa navegación
// suave (router.push) para no recargar toda la página ni perder el foco.
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

  React.useEffect(() => {
    const form = ref.current;
    if (!form) return;
    let t: any;
    const onChange = (e: Event) => {
      const el = e.target as HTMLInputElement;
      const tag = (el?.tagName || "").toLowerCase();
      if (tag === "select" || el?.type === "date") apply();
    };
    const onInput = (e: Event) => {
      const el = e.target as HTMLInputElement;
      if ((el?.tagName || "").toLowerCase() === "input" && (el.type === "text" || el.type === "search")) {
        clearTimeout(t);
        t = setTimeout(apply, 400);
      }
    };
    form.addEventListener("change", onChange);
    form.addEventListener("input", onInput);
    return () => {
      form.removeEventListener("change", onChange);
      form.removeEventListener("input", onInput);
      clearTimeout(t);
    };
  }, [apply]);

  return (
    <form
      ref={ref}
      method="get"
      action={basePath}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      {children}
    </form>
  );
}
