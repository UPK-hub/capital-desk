"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Responsive, WidthProvider } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip as ChartTooltip,
  Legend as ChartLegend,
  Filler,
} from "chart.js";
import { Line, Bar, Doughnut } from "react-chartjs-2";
import {
  GripVertical,
  Pencil,
  Plus,
  Trash2,
  X,
  RotateCcw,
  LayoutDashboard,
  Settings2,
} from "lucide-react";
import {
  type AccessFlags,
  type DashboardData,
  type GridItem,
  type Viz,
  type WidgetConfig,
  defaultDashboard,
  getMetric,
  metricsFor,
  RANGE_OPTIONS,
} from "@/lib/dashboard/catalog";

const ResponsiveGrid = WidthProvider(Responsive);

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  ChartTooltip,
  ChartLegend,
  Filler
);

function hexToRgba(hex: string, a: number) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

type WidgetResult =
  | {
      kind: "scalar";
      value: number;
      spark?: number[];
      delta?: { value: number; unit: "%" | "abs"; dir: "up" | "down" | "flat" };
    }
  | {
      kind: "series";
      label: string;
      label2?: string;
      accent2?: string;
      points: { date: string; value: number; value2?: number }[];
    }
  | { kind: "breakdown"; items: { label: string; value: number; color: string }[] }
  | { kind: "list"; items: ListItem[] }
  | { kind: "error"; message: string };

type ListItem = {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  tone?: string;
};

type Props = {
  flags: AccessFlags;
  initialData: DashboardData | null;
  userName: string;
  tenantName: string;
};

const TONE_CLASSES: Record<string, string> = {
  blue: "bg-blue-50 text-blue-700",
  amber: "bg-amber-50 text-amber-700",
  green: "bg-emerald-50 text-emerald-700",
  red: "bg-red-50 text-red-700",
  violet: "bg-violet-50 text-violet-700",
  slate: "bg-slate-100 text-slate-600",
};

function newId() {
  return `w-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
}

function sanitize(data: DashboardData, flags: AccessFlags): DashboardData {
  // Quita widgets cuya métrica ya no existe o no es accesible.
  const widgets = (data.widgets || []).filter((w) => {
    const m = getMetric(w.metric);
    return m && m.can(flags);
  });
  const ids = new Set(widgets.map((w) => w.i));
  const layout = (data.layout || []).filter((l) => ids.has(l.i));
  return {
    version: data.version ?? 1,
    widgets,
    layout,
    filters: { rangeDays: data.filters?.rangeDays ?? 14 },
  };
}

export default function DashboardClient({
  flags,
  initialData,
  userName,
  tenantName,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [dash, setDash] = useState<DashboardData>(() => {
    // Si el tablero guardado es de una versión anterior, se actualiza al
    // nuevo diseño por defecto (4 KPIs + actividad + dona).
    const base =
      initialData && initialData.version === 4 ? initialData : defaultDashboard(flags);
    return sanitize(base, flags);
  });
  const [results, setResults] = useState<Record<string, WidgetResult>>({});
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<{ open: boolean; widget: WidgetConfig | null }>(
    { open: false, widget: null }
  );
  const [editMode, setEditMode] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setMounted(true), []);

  // --- Guardado (debounce) ---
  const scheduleSave = useCallback((next: DashboardData) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch("/api/dashboard/layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: next }),
      }).catch(() => {});
    }, 800);
  }, []);

  const commit = useCallback(
    (next: DashboardData) => {
      setDash(next);
      scheduleSave(next);
    },
    [scheduleSave]
  );

  // --- Carga de datos ---
  const dataSignature = useMemo(
    () =>
      dash.widgets.map((w) => `${w.i}:${w.metric}`).join("|") +
      "@" +
      dash.filters.rangeDays,
    [dash.widgets, dash.filters.rangeDays]
  );

  useEffect(() => {
    let cancelled = false;
    const widgets = dash.widgets.map((w) => ({ i: w.i, metric: w.metric }));
    if (widgets.length === 0) {
      setResults({});
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch("/api/dashboard/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ widgets, rangeDays: dash.filters.rangeDays }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json?.ok) setResults(json.data ?? {});
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSignature]);

  // --- Mutaciones ---
  const onLayoutStop = useCallback(
    (current: any[]) => {
      const byId = new Map<string, GridItem>(dash.layout.map((l) => [l.i, l]));
      const layout: GridItem[] = current
        .filter((c) => c.i !== "__add__")
        .map((c) => {
        const prev = byId.get(c.i);
        return {
          i: c.i,
          x: c.x,
          y: c.y,
          w: c.w,
          h: c.h,
          minW: prev?.minW,
          minH: prev?.minH,
        };
      });
      commit({ ...dash, layout });
    },
    [dash, commit]
  );

  const maxY = useCallback(() => {
    return dash.layout.reduce((acc, l) => Math.max(acc, l.y + l.h), 0);
  }, [dash.layout]);

  const addWidget = useCallback(
    (cfg: { metric: string; viz: Viz; title: string }) => {
      const m = getMetric(cfg.metric);
      if (!m) return;
      const i = newId();
      const isKpi = m.kind === "scalar";
      const isList = m.kind === "list";
      const item: GridItem = isKpi
        ? { i, x: 0, y: maxY(), w: 3, h: 3, minW: 2, minH: 3 }
        : isList
        ? { i, x: 0, y: maxY(), w: 12, h: 8, minW: 4, minH: 5 }
        : { i, x: 0, y: maxY(), w: 6, h: 9, minW: 3, minH: 6 };
      const widget: WidgetConfig = { i, metric: cfg.metric, viz: cfg.viz, title: cfg.title };
      commit({
        ...dash,
        widgets: [...dash.widgets, widget],
        layout: [...dash.layout, item],
      });
    },
    [dash, commit, maxY]
  );

  const updateWidget = useCallback(
    (cfg: WidgetConfig) => {
      commit({
        ...dash,
        widgets: dash.widgets.map((w) => (w.i === cfg.i ? cfg : w)),
      });
    },
    [dash, commit]
  );

  const removeWidget = useCallback(
    (i: string) => {
      commit({
        ...dash,
        widgets: dash.widgets.filter((w) => w.i !== i),
        layout: dash.layout.filter((l) => l.i !== i),
      });
    },
    [dash, commit]
  );

  const resetDefault = useCallback(() => {
    const next = defaultDashboard(flags);
    commit(next);
  }, [flags, commit]);

  const setRange = useCallback(
    (rangeDays: number) => {
      commit({ ...dash, filters: { ...dash.filters, rangeDays } });
    },
    [dash, commit]
  );

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString("es-CO", {
        weekday: "short",
        day: "2-digit",
        month: "short",
      }),
    []
  );

  const displayLayout = useMemo(() => {
    if (!editMode) return dash.layout;
    const my = dash.layout.reduce((a, l) => Math.max(a, l.y + l.h), 0);
    return [
      ...dash.layout,
      { i: "__add__", x: 0, y: my, w: 3, h: 3, static: true },
    ];
  }, [dash.layout, editMode]);

  const layouts = useMemo(
    () => ({
      lg: displayLayout,
      md: displayLayout,
      sm: displayLayout,
      xs: displayLayout,
      xxs: displayLayout,
    }),
    [displayLayout]
  );

  return (
    <div className="dashboard-root space-y-4">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .react-grid-item.react-grid-placeholder{background:rgba(37,99,235,.16);border:1px dashed rgba(37,99,235,.5);border-radius:16px;}
            .dashboard-root .react-grid-item{transition:transform 180ms ease, width 180ms ease, height 180ms ease;}
            .dashboard-root .react-resizable-handle{z-index:5;}
          `,
        }}
      />
      {/* Encabezado */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-white px-4 py-3.5 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
            <LayoutDashboard className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">
              Tablero de inicio
            </h1>
            <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" />
              Operación en vivo · {todayLabel}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={dash.filters.rangeDays}
            onChange={(e) => setRange(Number(e.target.value))}
            className="h-9 rounded-lg border border-border/70 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-400"
            title="Rango de fechas para las gráficas"
          >
            {RANGE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setEditor({ open: true, widget: null })}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 text-sm font-medium text-blue-700 transition hover:bg-blue-50"
          >
            <Plus className="h-4 w-4" /> Agregar gráfico
          </button>
          <button
            type="button"
            onClick={() => setEditMode((v) => !v)}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition ${
              editMode
                ? "bg-blue-600 text-white shadow-sm hover:brightness-95"
                : "border border-border/70 bg-white text-slate-600 hover:bg-slate-50"
            }`}
            title="Personalizar el tablero (mover, redimensionar, quitar)"
          >
            <Settings2 className="h-4 w-4" /> {editMode ? "Listo" : "Personalizar"}
          </button>
          {editMode ? (
            <button
              type="button"
              onClick={resetDefault}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border/70 bg-white px-3 text-sm text-slate-600 transition hover:bg-slate-50"
              title="Restablecer el tablero por defecto"
            >
              <RotateCcw className="h-4 w-4" /> Restablecer
            </button>
          ) : null}
        </div>
      </div>

      {/* Grid */}
      {dash.widgets.length === 0 ? (
        <EmptyState onAdd={() => setEditor({ open: true, widget: null })} />
      ) : !mounted ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {dash.widgets.slice(0, 4).map((w) => (
            <div
              key={w.i}
              className="h-28 animate-pulse rounded-2xl border border-border/60 bg-white"
            />
          ))}
        </div>
      ) : (
        <ResponsiveGrid
          className="layout"
          layouts={layouts as any}
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
          cols={{ lg: 12, md: 12, sm: 6, xs: 4, xxs: 2 }}
          rowHeight={30}
          margin={[14, 14]}
          isDraggable={editMode}
          isResizable={editMode}
          draggableHandle=".widget-handle"
          onDragStop={onLayoutStop}
          onResizeStop={onLayoutStop}
        >
          {dash.widgets.map((w) => (
            <div key={w.i} className="dashboard-cell">
              <WidgetCard
                widget={w}
                result={results[w.i]}
                loading={loading && !results[w.i]}
                editMode={editMode}
                onEdit={() => setEditor({ open: true, widget: w })}
                onRemove={() => removeWidget(w.i)}
              />
            </div>
          ))}
          {editMode ? (
            <div key="__add__" className="dashboard-cell">
              <AddTile onClick={() => setEditor({ open: true, widget: null })} />
            </div>
          ) : null}
        </ResponsiveGrid>
      )}

      {editor.open ? (
        <WidgetEditor
          flags={flags}
          widget={editor.widget}
          onClose={() => setEditor({ open: false, widget: null })}
          onSave={(cfg) => {
            if (editor.widget) updateWidget({ ...editor.widget, ...cfg });
            else addWidget(cfg);
            setEditor({ open: false, widget: null });
          }}
          onDelete={
            editor.widget
              ? () => {
                  removeWidget(editor.widget!.i);
                  setEditor({ open: false, widget: null });
                }
              : undefined
          }
        />
      ) : null}
    </div>
  );
}

// ============================================================================
// Tarjeta de widget
// ============================================================================
function WidgetCard({
  widget,
  result,
  loading,
  editMode,
  onEdit,
  onRemove,
}: {
  widget: WidgetConfig;
  result?: WidgetResult;
  loading: boolean;
  editMode: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-white shadow-sm transition hover:shadow-md">
      <div
        className={`widget-handle flex items-center gap-2 px-3.5 pt-2.5 pb-1 ${
          editMode ? "cursor-move" : ""
        }`}
      >
        {editMode ? (
          <GripVertical className="h-4 w-4 shrink-0 text-slate-300" />
        ) : null}
        <span className="flex-1 truncate text-xs font-medium text-slate-500">
          {widget.title}
        </span>
        {editMode ? (
          <>
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={onEdit}
              className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              title="Editar"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={onRemove}
              className="rounded p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
              title="Quitar"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 px-3.5 pb-3.5 pt-0.5">
        <WidgetBody widget={widget} result={result} loading={loading} />
      </div>
    </div>
  );
}

function WidgetBody({
  widget,
  result,
  loading,
}: {
  widget: WidgetConfig;
  result?: WidgetResult;
  loading: boolean;
}) {
  if (loading || !result) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-500" />
      </div>
    );
  }
  if (result.kind === "error") {
    return (
      <div className="flex h-full w-full items-center justify-center px-2 text-center text-xs text-muted-foreground">
        {result.message}
      </div>
    );
  }
  if (result.kind === "scalar") {
    const accent = getMetric(widget.metric)?.accent ?? "#2563eb";
    const d = result.delta;
    const arrow = d ? (d.dir === "up" ? "▲" : d.dir === "down" ? "▼" : "→") : "";
    const dColor = d
      ? d.dir === "up"
        ? "text-emerald-600"
        : d.dir === "down"
        ? "text-red-500"
        : "text-slate-400"
      : "";
    return (
      <div className="flex h-full flex-col justify-center">
        <div className="flex items-baseline gap-2">
          <span
            className="text-[22px] font-semibold leading-none tabular-nums"
            style={{ color: accent }}
          >
            {result.value.toLocaleString("es-CO")}
          </span>
          {d ? (
            <span className={`text-[11px] font-semibold ${dColor}`}>
              {arrow} {d.unit === "%" ? `${d.value}%` : d.value}
            </span>
          ) : null}
        </div>
        {result.spark && result.spark.length > 1 ? (
          <Sparkline values={result.spark} accent={accent} />
        ) : null}
      </div>
    );
  }
  if (result.kind === "series") {
    return (
      <SeriesChart
        viz={widget.viz}
        data={result.points}
        label={result.label}
        accent={getMetric(widget.metric)?.accent ?? "#2563eb"}
        label2={result.label2}
        accent2={result.accent2}
      />
    );
  }
  if (result.kind === "breakdown") {
    return <BreakdownChart viz={widget.viz} items={result.items} />;
  }
  if (result.kind === "list") {
    return <ListView items={result.items} />;
  }
  return null;
}

// ============================================================================
// Renderers de gráficos
// ============================================================================
function Sparkline({ values, accent }: { values: number[]; accent: string }) {
  const data = {
    labels: values.map((_, i) => i),
    datasets: [
      {
        data: values,
        borderColor: accent,
        backgroundColor: hexToRgba(accent, 0.1),
        borderWidth: 2,
        tension: 0,
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: true,
      },
    ],
  };
  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: { x: { display: false }, y: { display: false } },
    elements: { line: { borderCapStyle: "round" } },
  };
  return (
    <div style={{ position: "relative", height: 34, marginTop: 8 }}>
      <Line data={data} options={options} />
    </div>
  );
}

function SeriesChart({
  viz,
  data,
  label,
  accent,
  label2,
  accent2,
}: {
  viz: Viz;
  data: { date: string; value: number; value2?: number }[];
  label: string;
  accent: string;
  label2?: string;
  accent2?: string;
}) {
  const c2 = accent2 ?? "#16a34a";
  const labels = data.map((p) => p.date);
  const scales: any = {
    x: {
      grid: { display: false },
      border: { display: false },
      ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 7, font: { size: 10 }, color: "#aab2bf" },
    },
    y: {
      beginAtZero: true,
      grace: "18%",
      grid: { color: "#f1f3f6" },
      border: { display: false },
      ticks: { display: false },
    },
  };
  const tooltip = {
    backgroundColor: "#0f172a",
    padding: 8,
    cornerRadius: 8,
    titleFont: { size: 11 },
    bodyFont: { size: 11 },
    usePointStyle: true,
  };

  if (viz === "bar") {
    const d = {
      labels,
      datasets: [
        { label, data: data.map((p) => p.value), backgroundColor: accent, borderRadius: 5, maxBarThickness: 26 },
      ],
    };
    const o: any = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip },
      scales,
    };
    return (
      <div style={{ position: "relative", height: "100%" }}>
        <Bar data={d} options={o} />
      </div>
    );
  }

  const mkLine = (lbl: string, vals: number[], color: string) => ({
    label: lbl,
    data: vals,
    borderColor: color,
    backgroundColor: hexToRgba(color, 0.12),
    borderWidth: 2.5,
    tension: 0,
    fill: viz !== "line",
    pointRadius: vals.map((_, i) => (i === vals.length - 1 ? 3.5 : 0)),
    pointHoverRadius: 4,
    pointBackgroundColor: "#ffffff",
    pointBorderColor: color,
    pointBorderWidth: 2,
  });
  const datasets = [mkLine(label, data.map((p) => p.value), accent)];
  if (label2) datasets.push(mkLine(label2, data.map((p) => p.value2 ?? 0), c2));

  const o: any = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: label2
        ? {
            position: "top",
            align: "end",
            labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: "circle", font: { size: 10 }, color: "#7c8595" },
          }
        : { display: false },
      tooltip,
    },
    scales,
  };
  return (
    <div style={{ position: "relative", height: "100%" }}>
      <Line data={{ labels, datasets }} options={o} />
    </div>
  );
}

function BreakdownChart({
  viz,
  items,
}: {
  viz: Viz;
  items: { label: string; value: number; color: string }[];
}) {
  const total = items.reduce((a, b) => a + b.value, 0);
  if (total === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
        Sin datos
      </div>
    );
  }
  const tooltip = {
    backgroundColor: "#0f172a",
    padding: 8,
    cornerRadius: 8,
    titleFont: { size: 11 },
    bodyFont: { size: 11 },
    usePointStyle: true,
  };
  if (viz === "bar") {
    const d = {
      labels: items.map((i) => i.label),
      datasets: [
        {
          data: items.map((i) => i.value),
          backgroundColor: items.map((i) => i.color),
          borderRadius: 5,
          maxBarThickness: 36,
        },
      ],
    };
    const o: any = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 10 }, color: "#aab2bf" } },
        y: { beginAtZero: true, grace: "18%", grid: { color: "#f1f3f6" }, border: { display: false }, ticks: { display: false } },
      },
    };
    return (
      <div style={{ position: "relative", height: "100%" }}>
        <Bar data={d} options={o} />
      </div>
    );
  }
  const d = {
    labels: items.map((i) => i.label),
    datasets: [
      {
        data: items.map((i) => i.value),
        backgroundColor: items.map((i) => i.color),
        borderColor: "#ffffff",
        borderWidth: 2,
        hoverOffset: 4,
      },
    ],
  };
  const o: any = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "62%",
    plugins: {
      legend: {
        position: "bottom",
        labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: "circle", font: { size: 10 }, color: "#64748b", padding: 10 },
      },
      tooltip,
    },
  };
  return (
    <div style={{ position: "relative", height: "100%" }}>
      <Doughnut data={d} options={o} />
    </div>
  );
}

function ListView({ items }: { items: ListItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
        No tienes pendientes asignados 🎉
      </div>
    );
  }
  return (
    <div className="h-full overflow-y-auto pr-1">
      <ul className="space-y-1">
        {items.map((it) => (
          <li
            key={it.id}
            className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 transition hover:bg-slate-50"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-800">{it.title}</p>
              {it.subtitle ? (
                <p className="truncate text-xs text-muted-foreground">{it.subtitle}</p>
              ) : null}
            </div>
            {it.badge ? (
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                  TONE_CLASSES[it.tone ?? "slate"] ?? TONE_CLASSES.slate
                }`}
              >
                {it.badge}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ============================================================================
// Tarjeta "Agregar gráfico" (modo personalizar)
// ============================================================================
function AddTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-blue-200 bg-blue-50/40 p-3 text-center transition hover:border-blue-300 hover:bg-blue-50"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
        <Plus className="h-5 w-5" />
      </span>
      <span className="text-xs font-semibold text-slate-600">Agregar gráfico</span>
    </button>
  );
}

// ============================================================================
// Estado vacío
// ============================================================================
function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-blue-200 bg-blue-50/40 px-6 py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
        <LayoutDashboard className="h-6 w-6" />
      </span>
      <p className="text-sm font-medium text-slate-700">Tu tablero está vacío</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        Agrega gráficos y KPIs para armar tu vista de inicio a la medida.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white shadow-sm transition hover:brightness-95"
      >
        <Plus className="h-4 w-4" /> Agregar gráfico
      </button>
    </div>
  );
}

// ============================================================================
// Modal: agregar / editar widget
// ============================================================================
function WidgetEditor({
  flags,
  widget,
  onClose,
  onSave,
  onDelete,
}: {
  flags: AccessFlags;
  widget: WidgetConfig | null;
  onClose: () => void;
  onSave: (cfg: { metric: string; viz: Viz; title: string }) => void;
  onDelete?: () => void;
}) {
  const available = useMemo(() => metricsFor(flags), [flags]);
  const grouped = useMemo(() => {
    const map = new Map<string, typeof available>();
    for (const m of available) {
      const arr = map.get(m.group) ?? [];
      arr.push(m);
      map.set(m.group, arr);
    }
    return Array.from(map.entries());
  }, [available]);

  const [metric, setMetric] = useState<string>(
    widget?.metric ?? available[0]?.key ?? ""
  );
  const def = getMetric(metric);
  const [viz, setViz] = useState<Viz>(widget?.viz ?? def?.defaultViz ?? "number");
  const [title, setTitle] = useState<string>(widget?.title ?? def?.label ?? "");
  const [titleEdited, setTitleEdited] = useState<boolean>(!!widget);

  const onMetricChange = (key: string) => {
    setMetric(key);
    const m = getMetric(key);
    if (m) {
      setViz(m.defaultViz);
      if (!titleEdited) setTitle(m.label);
    }
  };

  const canSave = !!metric && !!title.trim();

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/40 p-4"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border/60 bg-white p-5 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">
            {widget ? "Editar gráfico" : "Agregar gráfico"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              Métrica
            </span>
            <select
              value={metric}
              onChange={(e) => onMetricChange(e.target.value)}
              className="h-10 w-full rounded-lg border border-border/70 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-400"
            >
              {grouped.map(([group, metrics]) => (
                <optgroup key={group} label={group}>
                  {metrics.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {def?.hint ? (
              <span className="mt-1 block text-[11px] text-muted-foreground">
                {def.hint}
              </span>
            ) : null}
          </label>

          {def && def.allowedViz.length > 1 ? (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">
                Tipo de visualización
              </span>
              <div className="flex flex-wrap gap-2">
                {def.allowedViz.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setViz(v)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition ${
                      viz === v
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-border/70 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {VIZ_LABELS[v] ?? v}
                  </button>
                ))}
              </div>
            </label>
          ) : null}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              Título
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleEdited(true);
              }}
              className="h-10 w-full rounded-lg border border-border/70 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-400"
              placeholder="Título del gráfico"
            />
          </label>
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" /> Quitar
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border/70 bg-white px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!canSave}
              onClick={() => onSave({ metric, viz, title: title.trim() })}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:brightness-95 disabled:opacity-50"
            >
              {widget ? "Guardar" : "Agregar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const VIZ_LABELS: Record<string, string> = {
  number: "Número",
  area: "Área",
  line: "Línea",
  bar: "Barras",
  pie: "Torta",
  list: "Lista",
};
