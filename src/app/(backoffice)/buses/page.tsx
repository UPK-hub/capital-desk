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
  preventiveCount: number;
  correctiveCount: number;
  noveltyCount: number;
};

export default function BusesPage() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<BusRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const res = await fetch("/api/profile", { cache: "no-store" });
      const data = res.ok ? await res.json().catch(() => ({})) : {};
      if (!mounted) return;
      const role = String(data?.user?.role ?? "").toUpperCase();
      setIsAdmin(role === "ADMIN");
    })();
    return () => {
      mounted = false;
    };
  }, []);

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
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 lg:text-3xl">Buses</h1>
          <p className="text-sm text-slate-600">Consulta por código o placa y abre la hoja de vida con su contexto operativo.</p>
        </div>
        {isAdmin ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <a
              className="sts-btn-primary inline-flex h-10 items-center justify-center px-4 text-sm"
              href="/api/buses/qr-labels?mode=desmonte"
              target="_blank"
              rel="noreferrer"
            >
              QR desmonte (todos)
            </a>
            <a
              className="sts-btn-ghost inline-flex h-10 items-center justify-center px-4 text-sm"
              href="/api/buses/qr-labels?mode=instalacion"
              target="_blank"
              rel="noreferrer"
            >
              QR instalación (todos)
            </a>
          </div>
        ) : null}
      </header>

      <section className="rounded-2xl border border-border/60 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <Input
            placeholder="Buscar por código o placa..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-11 flex-1"
          />
          <button type="button" className="sts-btn-primary h-11 min-w-[130px] px-6 text-sm">
            Buscar
          </button>
        </div>
        {loading ? <p className="mt-2 text-xs text-muted-foreground">Buscando…</p> : null}
      </section>

      {items.length === 0 ? (
        <section className="rounded-2xl border border-border/60 bg-white p-6 text-sm text-muted-foreground shadow-sm">
          {loading ? "Buscando…" : "Sin resultados."}
        </section>
      ) : (
        <section className="space-y-4">
          {items.map((b) => {
            const stats = [
              { label: "Equipos", value: b.equipmentCount, color: "#2563eb", bg: "bg-blue-50", border: "border-blue-100" },
              { label: "Casos", value: b.caseCount, color: "#4f46e5", bg: "bg-indigo-50", border: "border-indigo-100" },
              { label: "OT", value: b.otCount, color: "#0891b2", bg: "bg-cyan-50", border: "border-cyan-100" },
              { label: "Preventivos", value: b.preventiveCount, color: "#059669", bg: "bg-emerald-50", border: "border-emerald-100" },
              { label: "Correctivos", value: b.correctiveCount, color: "#e11d48", bg: "bg-rose-50", border: "border-rose-100" },
            ];
            return (
              <article key={b.id} className="rounded-2xl border border-border/60 bg-white p-5 shadow-sm transition hover:shadow-md">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-3">
                      <p className="text-2xl font-bold leading-none text-slate-900">{b.code}</p>
                      <p className="text-sm text-slate-500">{b.plate ?? "Sin placa"}</p>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
                      {stats.map((s) => (
                        <div key={s.label} className={`rounded-xl border ${s.border} ${s.bg} px-3 py-2.5`}>
                          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: s.color }}>{s.label}</p>
                          <p className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900">{s.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex w-full flex-col gap-2 lg:w-auto lg:min-w-[210px]">
                    <Link
                      className="sts-btn-primary inline-flex h-10 w-full items-center justify-center px-4 text-sm"
                      href={`/buses/${b.id}`}
                    >
                      Ver hoja de vida
                    </Link>
                    {isAdmin ? (
                      <>
                        <a
                          className="sts-btn-ghost inline-flex h-9 w-full items-center justify-center px-4 text-xs"
                          href={`/api/buses/qr-labels?mode=desmonte&busId=${encodeURIComponent(b.id)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Descargar QR desmonte
                        </a>
                        <a
                          className="sts-btn-ghost inline-flex h-9 w-full items-center justify-center px-4 text-xs"
                          href={`/api/buses/qr-labels?mode=instalacion&busId=${encodeURIComponent(b.id)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Descargar QR instalación
                        </a>
                      </>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
