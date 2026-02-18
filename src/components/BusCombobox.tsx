"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Input } from "@/components/Field";

type BusOption = { id: string; code: string; plate: string | null };

export function BusCombobox({
  value,
  onChange,
}: {
  value: BusOption | null;
  onChange: (bus: BusOption | null) => void;
}) {
  const [q, setQ] = React.useState(value ? `${value.code}${value.plate ? ` - ${value.plate}` : ""}` : "");
  const [items, setItems] = React.useState<BusOption[]>([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLDivElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = React.useState<React.CSSProperties | undefined>(undefined);

  function updateMenuPosition() {
    if (!triggerRef.current || typeof window === "undefined") return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const estimatedHeight = 320;
    const margin = 8;
    const spaceBelow = viewportH - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;

    const width = Math.min(rect.width, viewportW - margin * 2);
    let left = rect.left;
    if (left + width > viewportW - margin) left = viewportW - width - margin;
    if (left < margin) left = margin;

    let top = rect.bottom + 8;
    if (openUp) top = Math.max(margin, rect.top - Math.min(estimatedHeight, spaceAbove) - 4);

    setMenuStyle({
      position: "fixed",
      top,
      left,
      width,
      zIndex: 9999,
    });
  }

  React.useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      const query = q.trim();
      if (query.length < 1) {
        setItems([]);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/buses?query=${encodeURIComponent(query)}`, { cache: "no-store" });
        if (!res.ok) throw new Error("No se pudo buscar buses");
        const data = (await res.json()) as BusOption[];
        setItems(Array.isArray(data) ? data : []);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(t);
  }, [q, open]);

  React.useEffect(() => {
    // si cambia value desde afuera, sincroniza el texto
    if (!value) return;
    setQ(`${value.code}${value.plate ? ` - ${value.plate}` : ""}`);
  }, [value?.id]);

  React.useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    function handleScrollOrResize() {
      updateMenuPosition();
    }
    window.addEventListener("resize", handleScrollOrResize);
    window.addEventListener("scroll", handleScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", handleScrollOrResize);
      window.removeEventListener("scroll", handleScrollOrResize, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, items.length, loading]);

  return (
    <div className="relative" ref={wrapRef}>
      <div ref={triggerRef}>
        <Input
          value={q}
          placeholder="Ej: K1401 o placa..."
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // pequeño delay para permitir click en item
            setTimeout(() => setOpen(false), 150);
          }}
        />
      </div>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              style={menuStyle}
              className="dropdown-content overflow-hidden rounded-md border bg-white shadow-lg"
            >
              <div className="border-b p-2 text-xs text-muted-foreground">
                {loading ? "Buscando…" : "Selecciona un bus"}
              </div>

              <div className="max-h-64 overflow-auto">
                {items.length === 0 && !loading ? (
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onChange(null)}
                  >
                    Sin resultados
                  </button>
                ) : null}

                {items.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange(b);
                      setQ(`${b.code}${b.plate ? ` - ${b.plate}` : ""}`);
                      setOpen(false);
                    }}
                  >
                    <div className="font-medium">{b.code}</div>
                    <div className="text-xs text-muted-foreground">{b.plate ?? "Sin placa"}</div>
                  </button>
                ))}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
