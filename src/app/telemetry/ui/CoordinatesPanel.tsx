"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Crosshair,
  Download,
  MapPin,
  RefreshCw,
  Search,
} from "lucide-react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/ui/data-table";

type CoordRow = {
  busCode: string;
  plate: string | null;
  total: number;
  distintas: number;
  maxRep: number;
  topLat: string | null;
  topLon: string | null;
  ceroCount: number;
};

type SortKey = "bus" | "rep" | "distintas";
type StatusFilter = "todos" | "cero" | "repetida" | "ok";

const REP_THRESHOLD = 50;

function nfmt(n: number) {
  return new Intl.NumberFormat("es-CO").format(n ?? 0);
}

function statusOf(r: CoordRow): "cero" | "repetida" | "ok" {
  if (r.ceroCount > 0) return "cero";
  if (r.maxRep >= REP_THRESHOLD) return "repetida";
  return "ok";
}

function coordText(lat: string | null, lon: string | null) {
  if (!lat || !lon) return "—";
  return `${lat}, ${lon}`;
}

function Kpi({
  label,
  value,
  color,
  Icon,
  sub,
}: {
  label: string;
  value: string;
  color: string;
  Icon: React.ComponentType<{ className?: string }>;
  sub?: string;
}) {
  return (
    <div className="sts-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${color}1f`, color }}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums" style={{ color }}>
        {value}
      </p>
      {sub ? <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export default function CoordinatesPanel() {
  const [rows, setRows] = React.useState<CoordRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("todos");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "rep", dir: "desc" });

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/telemetry/coordinates`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = (await res.json()) as { rows: CoordRow[] };
      setRows(json.rows ?? []);
    } catch (e: any) {
      setError(e?.message || "No se pudo cargar la información");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const stats = React.useMemo(() => {
    let cero = 0;
    let repetida = 0;
    let ok = 0;
    for (const r of rows) {
      const s = statusOf(r);
      if (s === "cero") cero++;
      else if (s === "repetida") repetida++;
      else ok++;
    }
    return { total: rows.length, cero, repetida, ok };
  }, [rows]);

  const ceroBuses = React.useMemo(() => rows.filter((r) => r.ceroCount > 0), [rows]);
  const repetidaBuses = React.useMemo(() => rows.filter((r) => statusOf(r) === "repetida"), [rows]);

  const donutData = React.useMemo(
    () =>
      [
        { key: "ok" as const, name: "OK (moviéndose)", value: stats.ok, color: "#15803d" },
        { key: "repetida" as const, name: "Coordenada repetida", value: stats.repetida, color: "#b45309" },
        { key: "cero" as const, name: "En 0", value: stats.cero, color: "#b91c1c" },
      ].filter((d) => d.value > 0),
    [stats]
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "todos" && statusOf(r) !== statusFilter) return false;
      if (q && !(r.busCode.toLowerCase().includes(q) || (r.plate ?? "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, query, statusFilter]);

  const sorted = React.useMemo(() => {
    const arr = [...filtered];
    const dir = sort.dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (sort.key === "bus") return a.busCode.localeCompare(b.busCode) * dir;
      if (sort.key === "rep") return (a.maxRep - b.maxRep) * dir;
      return (a.distintas - b.distintas) * dir;
    });
    return arr;
  }, [filtered, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));

  const SortIcon = ({ k }: { k: SortKey }) =>
    sort.key !== k ? (
      <ChevronsUpDown className="h-3 w-3 opacity-40" />
    ) : sort.dir === "asc" ? (
      <ArrowUp className="h-3 w-3" />
    ) : (
      <ArrowDown className="h-3 w-3" />
    );

  const chips: Array<{ key: StatusFilter; label: string; count: number; color: string }> = [
    { key: "todos", label: "Todos", count: stats.total, color: "#2563eb" },
    { key: "ok", label: "OK", count: stats.ok, color: "#15803d" },
    { key: "repetida", label: "Coord. repetida", count: stats.repetida, color: "#b45309" },
    { key: "cero", label: "En 0", count: stats.cero, color: "#b91c1c" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Coordenadas (GPS)</h2>
          <p className="text-xs text-muted-foreground">
            Calidad de GPS de hoy · detecta coordenada en 0 y coordenada repetida (GPS atascado)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            className="sts-btn-primary text-sm inline-flex items-center gap-1"
            href="/api/telemetry/coordinates/export"
          >
            <Download className="h-4 w-4" /> Exportar a Excel
          </a>
          <button className="sts-btn-ghost text-sm inline-flex items-center gap-1" onClick={load}>
            <RefreshCw className="h-4 w-4" /> Actualizar
          </button>
        </div>
      </div>

      {error ? (
        <div className="sts-card p-4 text-sm text-red-700">No se pudo cargar: {error}</div>
      ) : null}

      {loading ? (
        <div className="sts-card p-6 text-sm text-muted-foreground">Cargando coordenadas…</div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Buses con GPS hoy" value={nfmt(stats.total)} color="#2563eb" Icon={MapPin} />
            <Kpi label="OK (moviéndose)" value={nfmt(stats.ok)} color="#15803d" Icon={MapPin} />
            <Kpi
              label="Coordenada repetida"
              value={nfmt(stats.repetida)}
              color="#b45309"
              Icon={Crosshair}
              sub={`${REP_THRESHOLD}+ veces la misma`}
            />
            <Kpi label="En 0 (0,0)" value={nfmt(stats.cero)} color="#b91c1c" Icon={AlertTriangle} sub="GPS sin señal" />
          </div>

          {ceroBuses.length > 0 || repetidaBuses.length > 0 ? (
            <div className="sts-card space-y-1 border border-amber-300 bg-amber-50 p-4">
              {ceroBuses.length > 0 ? (
                <p className="text-sm text-red-700">
                  <AlertTriangle className="mr-1 inline h-4 w-4" />
                  <strong>{ceroBuses.length}</strong> en 0,0: {ceroBuses.map((b) => b.busCode).join(", ")}
                </p>
              ) : null}
              {repetidaBuses.length > 0 ? (
                <p className="text-sm text-amber-800">
                  <Crosshair className="mr-1 inline h-4 w-4" />
                  <strong>{repetidaBuses.length}</strong> con coordenada repetida ({REP_THRESHOLD}+ veces la misma
                  hoy): {repetidaBuses.map((b) => b.busCode).join(", ")}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_1fr]">
            <div className="sts-card p-5">
              <h3 className="text-sm font-semibold">Estado del GPS de la flota (hoy)</h3>
              <p className="text-[11px] text-muted-foreground">Clic en una porción para filtrar la tabla</p>
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={62}
                      outerRadius={100}
                      paddingAngle={2}
                    >
                      {donutData.map((d) => (
                        <Cell
                          key={d.key}
                          fill={statusFilter === "todos" || statusFilter === d.key ? d.color : "#e2e8f0"}
                          cursor="pointer"
                          onClick={() => setStatusFilter((p) => (p === d.key ? "todos" : d.key))}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number, n: any) => [`${nfmt(v)} buses`, n]}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                    />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="sts-card p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {chips.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setStatusFilter(c.key)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        statusFilter === c.key
                          ? "border-transparent text-white"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                      style={statusFilter === c.key ? { backgroundColor: c.color } : undefined}
                    >
                      {c.label} ({nfmt(c.count)})
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar bus o placa…"
                    className="h-8 w-52 rounded-md border border-border bg-transparent pl-8 pr-2 text-sm outline-none focus:border-foreground"
                  />
                </div>
              </div>

              <div className="max-h-[520px] overflow-auto">
                <DataTable>
                  <DataTableHeader>
                    <DataTableRow>
                      <DataTableHead>
                        <button onClick={() => toggleSort("bus")} className="inline-flex items-center gap-1">
                          Bus <SortIcon k="bus" />
                        </button>
                      </DataTableHead>
                      <DataTableHead>Placa</DataTableHead>
                      <DataTableHead>Coord. más frecuente</DataTableHead>
                      <DataTableHead>
                        <button onClick={() => toggleSort("rep")} className="inline-flex items-center gap-1">
                          Máx repetida <SortIcon k="rep" />
                        </button>
                      </DataTableHead>
                      <DataTableHead>
                        <button onClick={() => toggleSort("distintas")} className="inline-flex items-center gap-1">
                          Distintas <SortIcon k="distintas" />
                        </button>
                      </DataTableHead>
                      <DataTableHead>GPS hoy</DataTableHead>
                      <DataTableHead>Estado</DataTableHead>
                    </DataTableRow>
                  </DataTableHeader>
                  <DataTableBody>
                    {sorted.length === 0 ? (
                      <DataTableRow>
                        <DataTableCell colSpan={7} className="text-sm text-muted-foreground">
                          Sin resultados.
                        </DataTableCell>
                      </DataTableRow>
                    ) : (
                      sorted.map((r) => {
                        const s = statusOf(r);
                        return (
                          <DataTableRow key={r.busCode}>
                            <DataTableCell className="font-medium">{r.busCode}</DataTableCell>
                            <DataTableCell>{r.plate ?? "—"}</DataTableCell>
                            <DataTableCell className="text-xs tabular-nums">{coordText(r.topLat, r.topLon)}</DataTableCell>
                            <DataTableCell className={`font-semibold tabular-nums ${s === "repetida" ? "text-amber-700" : ""}`}>
                              {nfmt(r.maxRep)}
                            </DataTableCell>
                            <DataTableCell className="tabular-nums">{nfmt(r.distintas)}</DataTableCell>
                            <DataTableCell className="tabular-nums">{nfmt(r.total)}</DataTableCell>
                            <DataTableCell>
                              {s === "cero" ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                                  <AlertTriangle className="h-3 w-3" /> En 0
                                </span>
                              ) : s === "repetida" ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                                  <Crosshair className="h-3 w-3" /> Repetida
                                </span>
                              ) : (
                                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                                  OK
                                </span>
                              )}
                            </DataTableCell>
                          </DataTableRow>
                        );
                      })
                    )}
                  </DataTableBody>
                </DataTable>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
