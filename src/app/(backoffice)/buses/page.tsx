"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/Field";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/ui/data-table";

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
    <div className="mobile-page-shell">
      <header className="mobile-page-header">
        <div className="mx-auto w-full max-w-6xl px-4 py-4 lg:px-6 lg:py-0">
          <h1 className="break-words text-xl font-semibold tracking-tight lg:text-3xl">Buses</h1>
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
          <>
            <div className="mobile-list-stack lg:hidden">
              {items.map((b) => (
                <article key={b.id} className="mobile-section-card mobile-section-card__body">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{b.code}</p>
                      <p className="text-xs text-muted-foreground">{b.plate ?? "Sin placa"}</p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <Link className="sts-btn-ghost inline-flex h-10 w-full items-center justify-center text-sm" href={`/buses/${b.id}`}>
                      Ver hoja de vida
                    </Link>
                  </div>
                </article>
              ))}
            </div>

            <div className="hidden lg:block">
              <DataTable>
                <DataTableHeader>
                  <DataTableRow>
                    <DataTableHead>Código</DataTableHead>
                    <DataTableHead>Placa</DataTableHead>
                    <DataTableHead className="text-right">Acción</DataTableHead>
                  </DataTableRow>
                </DataTableHeader>
                <DataTableBody>
                  {items.map((b) => (
                    <DataTableRow key={b.id}>
                      <DataTableCell>
                        <div className="font-medium">{b.code}</div>
                      </DataTableCell>
                      <DataTableCell>
                        <span className="text-muted-foreground">{b.plate ?? "—"}</span>
                      </DataTableCell>
                      <DataTableCell className="text-right">
                        <Link className="sts-btn-ghost h-8 px-3 text-xs data-table-row-action" href={`/buses/${b.id}`}>
                          Ver hoja de vida
                        </Link>
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
