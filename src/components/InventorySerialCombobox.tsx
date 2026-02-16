"use client";

import * as React from "react";
import { searchInventorySerialSuggestions } from "@/lib/inventory-autofill-client";

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

  return (
    <div className="relative">
      <input
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

      {open ? (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-xl border border-border/70 bg-card shadow-[var(--shadow-lg)]">
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
                  if (item.model) onModelDetected?.(item.model);
                  setOpen(false);
                }}
              >
                <div className="font-medium">{item.serial}</div>
                <div className="text-xs text-muted-foreground">{item.model || "Sin modelo"}</div>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

