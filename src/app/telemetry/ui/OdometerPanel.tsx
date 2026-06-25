"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Gauge,
  RefreshCw,
  Search,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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

  const zeroBuses = React.useMemo(() => rows.filter((r) => r.km === 0), [rows]);

  const stats = React.useMemo(() => {
    const withKm = rows.filter((r) => r.km != null) as Array<Row & { km: number }>;
    const positive = withKm.filter((r) => r.km > 0).map((r) => r.km);
    const avg = positive.length ? Math.round(positive.reduce((a, b) => a + b, 0) / positive.length) : 0;
    const max = withKm.length ? Math.max(...withKm.map((r) => r.km)) : 0;
    return { total: rows.length, zeros: zeroBuses.length, avg, max };
  }, [rows, zeroBuses]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.busCode.toLowerCase().includes(q) || (r.plate ?? "").toLowerCase().includes(q)
    );
  }, [rows, query]);

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

  const chartData = React.useMemo(() => {
    return (rows.filter((r) => r.km != null && (r.km as number) > 0) as Array<Row & { km: number }>)
      .sort((a, b) => b.km - a.km)
      .slice(0, 12)
      .map((r) => ({ busCode: r.busCode, km: r.km }));
  }, [rows]);

  const toggleSort = (key: SortKey) => {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "km" ? "desc" : "asc" }
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Odómetro (kilometraje)</h2>
          <p className="text-xs text-muted-foreground">
            Último kilometraje por bus (campo kilometrosOdometro de las tramas P60 · últimos 3 días)
          </p>
        </div>
        <button className="sts-btn-ghost text-sm inline-flex items-center gap-1" onClick={load}>
          <RefreshCw className="h-4 w-4" /> Actualizar
        </button>
      </div>

      {error ? (
        <div className="sts-card p-4 text-sm text-red-700">No se pudo cargar: {error}</div>
      ) : null}

      {loading ? (
        <div className="sts-card p-6 text-sm text-muted-foreground">Cargando kilometraje…</div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Buses con dato" value={nfmt(stats.total)} color="#2563eb" Icon={Gauge} />
            <Kpi
              label="Odómetro en 0"
              value={nfmt(stats.zeros)}
              color="#b91c1c"
              Icon={AlertTriangle}
              sub="posible falla de sensor"
            />
            <Kpi label="Promedio km" value={fmtKm(stats.avg)} color="#15803d" Icon={Gauge} sub="excluye los que están en 0" />
            <Kpi label="Máximo km" value={fmtKm(stats.max)} color="#7c3aed" Icon={Gauge} />
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
                Suele indicar falla del sensor o dato incorrecto. Buses:{" "}
                {zeroBuses.map((b) => b.busCode).join(", ")}
              </p>
            </div>
          ) : null}

          {chartData.length > 0 ? (
            <div className="sts-card p-5">
              <h3 className="mb-3 text-sm font-semibold">Top 12 buses por kilometraje</h3>
              <div style={{ width: "100%", height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      tickLine={false}
                      axisLine={{ stroke: "#e2e8f0" }}
                      tickFormatter={(v: number) => nfmt(v)}
                    />
                    <YAxis
                      type="category"
                      dataKey="busCode"
                      width={70}
                      tick={{ fontSize: 11, fill: "#334155" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      formatter={(v: number) => [`${nfmt(v)} km`, "Odómetro"]}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                    />
                    <Bar dataKey="km" fill="#2563eb" radius={[0, 4, 4, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : null}

          <div className="sts-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="inline-flex items-center gap-1 text-sm font-semibold">
                <Gauge className="h-4 w-4" /> Kilometraje por bus
              </h3>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filtrar por bus o placa…"
                    className="h-8 w-56 rounded-md border border-border bg-transparent pl-8 pr-2 text-sm outline-none focus:border-foreground"
                  />
                </div>
                <span className="text-xs text-muted-foreground">
                  {sorted.length} de {rows.length}
                </span>
              </div>
            </div>
            <div className="max-h-[560px] overflow-auto">
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
                      return (
                        <DataTableRow key={r.busCode}>
                          <DataTableCell className={`font-medium ${zero ? "text-red-700" : ""}`}>
                            {r.busCode}
                          </DataTableCell>
                          <DataTableCell className={zero ? "text-red-700" : undefined}>
                            {r.plate ?? "—"}
                          </DataTableCell>
                          <DataTableCell className={`font-semibold tabular-nums ${zero ? "text-red-700" : ""}`}>
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
        </>
      )}
    </div>
  );
}
