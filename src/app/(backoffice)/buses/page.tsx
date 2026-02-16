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
    <div className="mx-auto max-w-6xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Buses</h1>
      </div>

      <div className="sts-card p-4 space-y-3">
        <Input placeholder="Buscar por código o placa…" value={q} onChange={(e) => setQ(e.target.value)} />
        {loading ? <p className="text-sm text-muted-foreground">Buscando…</p> : null}
      </div>

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

      {items.length === 0 ? <div className="sts-card p-4 text-sm text-muted-foreground">Sin resultados.</div> : null}
    </div>
  );
}
