"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/Field";

type BusRow = {
  id: string;
  code: string;
  plate: string | null;
  equipmentCount: number;
  caseCount: number;
  otCount: number;
};

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
    <div className="mobile-page-shell">
      <header className="mobile-page-header">
        <div className="mx-auto w-full max-w-6xl px-4 py-4 lg:px-6 lg:py-0">
          <h1 className="break-words text-xl font-semibold tracking-tight lg:text-3xl">Buses</h1>
          <p className="mt-1 text-xs text-muted-foreground lg:text-sm">
            Consulta por código/placa y abre la hoja de vida con su contexto operativo.
          </p>
        </div>
      </header>

      <div className="mobile-page-content max-w-6xl lg:px-6">
        <div className="mobile-section-card mobile-section-card__body space-y-3">
          <Input placeholder="Buscar por código o placa…" value={q} onChange={(e) => setQ(e.target.value)} />
          {loading ? <p className="text-sm text-muted-foreground">Buscando…</p> : null}
        </div>

        {items.length === 0 ? (
          <div className="mobile-section-card mobile-section-card__body text-sm text-muted-foreground">Sin resultados.</div>
        ) : (
          <div className="mobile-list-stack">
            {items.map((b) => (
              <article key={b.id} className="mobile-section-card mobile-section-card__body">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-semibold lg:text-lg">{b.code}</p>
                        <p className="text-xs text-muted-foreground lg:text-sm">{b.plate ?? "Sin placa"}</p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 lg:max-w-xl">
                      <div className="rounded-lg border border-border/60 bg-muted/25 px-2 py-2 text-center">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Equipos</p>
                        <p className="text-sm font-semibold">{b.equipmentCount}</p>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-muted/25 px-2 py-2 text-center">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Casos</p>
                        <p className="text-sm font-semibold">{b.caseCount}</p>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-muted/25 px-2 py-2 text-center">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">OT</p>
                        <p className="text-sm font-semibold">{b.otCount}</p>
                      </div>
                    </div>
                  </div>

                  <div className="w-full lg:w-auto">
                    <Link
                      className="sts-btn-ghost inline-flex h-10 w-full items-center justify-center px-4 text-sm lg:h-11 lg:min-w-[180px]"
                      href={`/buses/${b.id}`}
                    >
                      Ver hoja de vida
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
