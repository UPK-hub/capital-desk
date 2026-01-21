"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/Field";

type BusRow = { id: string; code: string; plate: string | null };

export default function BusesPage() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<BusRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      const res = await fetch(`/api/buses?query=${encodeURIComponent(q)}`, { cache: "no-store" });
      const data = res.ok ? ((await res.json()) as BusRow[]) : [];
      setItems(data);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Buses</h1>
      </div>

      <div className="rounded-xl border p-4 space-y-3">
        <Input placeholder="Buscar por código o placa…" value={q} onChange={(e) => setQ(e.target.value)} />
        {loading ? <p className="text-sm text-muted-foreground">Buscando…</p> : null}
      </div>

      <div className="rounded-xl border">
        <div className="grid grid-cols-12 gap-2 border-b p-3 text-xs font-medium">
          <div className="col-span-3">Código</div>
          <div className="col-span-3">Placa</div>
          <div className="col-span-6">Acción</div>
        </div>

        {items.map((b) => (
          <div key={b.id} className="grid grid-cols-12 gap-2 p-3 text-sm border-b last:border-b-0">
            <div className="col-span-3 font-medium">{b.code}</div>
            <div className="col-span-3 text-muted-foreground">{b.plate ?? "—"}</div>
            <div className="col-span-6">
              <Link className="underline" href={`/buses/${b.id}`}>
                Ver hoja de vida
              </Link>
            </div>
          </div>
        ))}

        {items.length === 0 ? <div className="p-4 text-sm text-muted-foreground">Sin resultados.</div> : null}
      </div>
    </div>
  );
}
