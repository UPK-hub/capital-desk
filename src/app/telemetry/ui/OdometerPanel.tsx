"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Download,
  Gauge,
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

type OdometerRow = {
  busCode: string;
  plate: string | null;
  odometer: string | null;
  eventAt: string | null;
  receivedAt: string | null;
};

type Row = OdometerRow & { km: number | null };
type SortKey = "bus" | "km" | "fecha";
type StatusFilter = "todos" | "valido" | "cero" | "sin";

function nfmt(n: number) {
  return new Intl.NumberFormat("es-CO").format(n ?? 0);
}

function kmNumber(v: string | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmtKm(n: number | null) {
  return n == null ? "—" : `${nfmt(n)} km`;
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("es-CO");
}

function statusOf(km: number | null): StatusFilter {
  if (km == null) return "sin";
  if (km === 0) return "cero";
  return "valido";
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

export default function OdometerPanel() {
  const [rawRows, setRawRows] = React.useState<OdometerRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("todos");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "bus", dir: "asc" });

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/telemetry/odometer`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = (await res.json()) as { rows: OdometerRow[] };
      setRawRows(json.rows ?? []);
    } catch (e: any) {
      setError(e?.message || "No se pudo cargar la información");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const rows: Row[] = React.useMemo(
    () => rawRows.map((r) => ({ ...r, km: kmNumber(r.odometer) })),
    [rawRows]
  );

  const stats = React.useMemo(() => {
    const withKm = rows.filter((r) => r.km != null) as Array<Row & { km: number }>;
    const zeros = withKm.filter((r) => r.km === 0).length;
    const validos = withKm.filter((r) => r.km > 0);
    const avg = validos.length ? Math.round(validos.reduce((a, b) => a + b.km, 0) / validos.length) : 0;
    return {
      total: rows.length,
      conDato: withKm.length,
      validos: validos.length,
      sinDato: rows.length - withKm.length,
      zeros,
      avg,
    };
  }, [rows]);

  const zeroBuses = React.useMemo(() => rows.filter((r) => r.km === 0), [rows]);

  const donutData = React.useMemo(
    () =>
      [
        { key: "valido" as const, name: "Con odómetro (>0)", value: stats.validos, color: "#15803d" },
        { key: "cero" as const, name: "En 0", value: stats.zeros, color: "#b91c1c" },
        { key: "sin" as const, name: "Sin reportar", value: stats.sinDato, color: "#94a3b8" },
      ].filter((d) => d.value > 0),
    [stats]
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "todos" && statusOf(r.km) !== statusFilter) return false;
      if (q && !(r.busCode.toLowerCase().includes(q) || (r.plate ?? "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, query, statusFilter]);

  const sorted = React.useMemo(() => {
    const arr = [...filtered];
    const dir = sort.dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (sort.key === "bus") return a.busCode.localeCompare(b.busCode) * dir;
      if (sort.key === "km") return ((a.km ?? -1) - (b.km ?? -1)) * dir;
      const ta = a.eventAt ? new Date(a.eventAt).getTime() : 0;
      const tb = b.eventAt ? new Date(b.eventAt).getTime() : 0;
      return (ta - tb) * dir;
    });
    return arr;
  }, [filtered, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "km" ? "desc" : "asc" }
    );
  };

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
    { key: "valido", label: "Con dato (>0)", count: stats.validos, color: "#15803d" },
    { key: "cero", label: "En 0", count: stats.zeros, color: "#b91c1c" },
    { key: "sin", label: "Sin reportar", count: stats.sinDato, color: "#94a3b8" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Odómetro (kilometraje)</h2>
          <p className="text-xs text-muted-foreground">
            Último kilometraje por bus (campo kilometrosOdometro de las tramas P60 · últimos 3 días)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            className="sts-btn-primary text-sm inline-flex items-center gap-1"
            href="/api/telemetry/odometer/export"
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
        <div className="sts-card p-6 text-sm text-muted-foreground">Cargando kilometraje…</div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Flota (activos)" value={nfmt(stats.total)} color="#2563eb" Icon={Gauge} />
            <Kpi
              label="Con odómetro"
              value={nfmt(stats.conDato)}
              color="#0891b2"
              Icon={Gauge}
              sub={`${nfmt(stats.sinDato)} sin reportar`}
            />
            <Kpi
              label="Odómetro en 0"
              value={nfmt(stats.zeros)}
              color="#b91c1c"
              Icon={AlertTriangle}
              sub="posible falla de sensor"
            />
            <Kpi label="Promedio km" value={fmtKm(stats.avg)} color="#15803d" Icon={Gauge} sub="solo válidos (>0)" />
          </div>

          {zeroBuses.length > 0 ? (
            <div className="sts-card border border-red-300 bg-red-50 p-4">
              <div className="flex items-center gap-2 text-red-700">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <p className="text-sm font-semibold">
                  {zeroBuses.length} {zeroBuses.length === 1 ? "bus está" : "buses están"} reportando el
                  odómetro en 0
                </p>
              </div>
              <p className="mt-1 text-xs text-red-700/80">
                Suele indicar falla del sensor o dato incorrecto. Buses: {zeroBuses.map((b) => b.busCode).join(", ")}
              </p>
            </div>
          ) : null}

          <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_1fr]">
            {/* Dona de estado */}
            <div className="sts-card p-5">
              <h3 className="text-sm font-semibold">Estado del odómetro de la flota</h3>
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

            {/* Tabla con filtros */}
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
                      <DataTableHead>
                        <button onClick={() => toggleSort("km")} className="inline-flex items-center gap-1">
                          Último odómetro <SortIcon k="km" />
                        </button>
                      </DataTableHead>
                      <DataTableHead>
                        <button onClick={() => toggleSort("fecha")} className="inline-flex items-center gap-1">
                          Fecha lectura <SortIcon k="fecha" />
                        </button>
                      </DataTableHead>
                      <DataTableHead>Recibido</DataTableHead>
                    </DataTableRow>
                  </DataTableHeader>
                  <DataTableBody>
                    {sorted.length === 0 ? (
                      <DataTableRow>
                        <DataTableCell colSpan={5} className="text-sm text-muted-foreground">
                          Sin resultados.
                        </DataTableCell>
                      </DataTableRow>
                    ) : (
                      sorted.map((r) => {
                        const zero = r.km === 0;
                        const sin = r.km == null;
                        return (
                          <DataTableRow key={r.busCode}>
                            <DataTableCell className={`font-medium ${zero ? "text-red-700" : ""}`}>
                              {r.busCode}
                            </DataTableCell>
                            <DataTableCell className={zero ? "text-red-700" : undefined}>
                              {r.plate ?? "—"}
                            </DataTableCell>
                            <DataTableCell
                              className={`font-semibold tabular-nums ${zero ? "text-red-700" : sin ? "text-muted-foreground" : ""}`}
                            >
                              <span className="inline-flex items-center gap-1">
                                {zero ? <AlertTriangle className="h-3.5 w-3.5" /> : null}
                                {fmtKm(r.km)}
                              </span>
                            </DataTableCell>
                            <DataTableCell>{fmtDate(r.eventAt)}</DataTableCell>
                            <DataTableCell>{fmtDate(r.receivedAt)}</DataTableCell>
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
