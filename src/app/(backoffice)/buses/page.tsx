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
    }, 280);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-5xl font-semibold tracking-tight text-slate-900">Buses</h1>
        <p className="text-lg text-slate-600">
          Consulta por código/placa y abre la hoja de vida con su contexto operativo.
        </p>
      </header>

      <section className="sts-card p-4">
        <div className="flex flex-col gap-3 lg:flex-row">
          <Input
            placeholder="Buscar por código o placa..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-12 flex-1"
          />
          <button type="button" className="sts-btn-primary h-12 min-w-[150px] px-6 text-lg">
            Buscar
          </button>
        </div>
        {loading ? <p className="mt-2 text-sm text-muted-foreground">Buscando...</p> : null}
      </section>

      {items.length === 0 ? (
        <section className="sts-card p-6 text-sm text-muted-foreground">Sin resultados.</section>
      ) : (
        <section className="space-y-4">
          {items.map((b) => (
            <article key={b.id} className="sts-card p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-3xl font-bold leading-none text-slate-900">{b.code}</p>
                  </div>
                  <p className="mt-1 text-base text-slate-600">{b.plate ?? "Sin placa registrada"}</p>

                  <div className="mt-4 grid max-w-2xl grid-cols-3 gap-3">
                    <div className="rounded-xl border border-blue-100 bg-blue-50/75 p-3 text-center">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Equipos</p>
                      <p className="mt-1 text-2xl font-bold text-slate-900">{b.equipmentCount}</p>
                    </div>
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-center">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Casos</p>
                      <p className="mt-1 text-2xl font-bold text-slate-900">{b.caseCount}</p>
                    </div>
                    <div className="rounded-xl border border-cyan-100 bg-cyan-50/70 p-3 text-center">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">OT</p>
                      <p className="mt-1 text-2xl font-bold text-slate-900">{b.otCount}</p>
                    </div>
                  </div>
                </div>

                <div className="w-full lg:w-auto">
                  <Link
                    className="sts-btn-ghost inline-flex h-12 w-full min-w-[200px] items-center justify-center px-6 text-base"
                    href={`/buses/${b.id}`}
                  >
                    Ver hoja de vida
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
