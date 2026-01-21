"use client";

import * as React from "react";
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

  return (
    <div className="relative">
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

      {open ? (
        <div className="absolute z-20 mt-2 w-full rounded-md border bg-white shadow-lg">
          <div className="p-2 text-xs text-muted-foreground border-b">
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
        </div>
      ) : null}
    </div>
  );
}
