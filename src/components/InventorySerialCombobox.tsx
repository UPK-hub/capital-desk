"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { sanitizeModelText, searchInventorySerialSuggestions } from "@/lib/inventory-autofill-client";

type Suggestion = { serial: string; model: string };

export function InventorySerialCombobox({
  value,
  onChange,
  onModelDetected,
  placeholder,
  className,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onModelDetected?: (model: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<Suggestion[]>([]);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = React.useState<React.CSSProperties | undefined>(undefined);

  function updateMenuPosition() {
    if (!inputRef.current || typeof window === "undefined") return;
    const rect = inputRef.current.getBoundingClientRect();
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

    let top = rect.bottom + 4;
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
    if (!open || disabled) return;

    const t = setTimeout(async () => {
      const query = String(value ?? "").trim();
      if (query.length < 2) {
        setItems([]);
        return;
      }

      setLoading(true);
      try {
        const found = await searchInventorySerialSuggestions(query, 8);
        setItems(found);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => clearTimeout(t);
  }, [value, open, disabled]);

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
      <input
        ref={inputRef}
        value={value}
        disabled={disabled}
        placeholder={placeholder ?? "Escribe serial..."}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setTimeout(() => setOpen(false), 140);
        }}
        className={className}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 opacity-70"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              style={menuStyle}
              className="dropdown-content overflow-hidden rounded-xl border border-border/70 bg-card shadow-[var(--shadow-lg)]"
            >
              <div className="border-b border-border/50 px-3 py-2 text-xs text-muted-foreground">
                {loading ? "Buscando serial..." : "Selecciona serial de inventario"}
              </div>
              <div className="max-h-64 overflow-auto p-1">
                {!loading && items.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</div>
                ) : null}
                {items.map((item) => (
                  <button
                    key={item.serial}
                    type="button"
                    className="w-full rounded-lg px-3 py-2 text-left hover:bg-muted/60"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange(item.serial);
                      const cleanModel = sanitizeModelText(item.model);
                      if (cleanModel) onModelDetected?.(cleanModel);
                      setOpen(false);
                    }}
                  >
                    <div className="font-medium">{item.serial}</div>
                    <div className="text-xs text-muted-foreground">
                      {sanitizeModelText(item.model) || "Sin modelo"}
                    </div>
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
