"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Columns3, Layers, List, LayoutGrid, ChevronUp, ChevronDown, Link2, GripVertical, Copy, Crown } from "lucide-react";
import { StatusPill, StatusPillStatus } from "@/components/ui/status-pill";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { caseStatusLabels, labelFromMap } from "@/lib/labels";

export type NovedadRow = {
  id: string;
  caseNo: number | null;
  title: string;
  busCode: string;
  busPlate: string | null;
  status: string;
  priority: number;
  equipo: string | null;
  creator: string | null;
  assignee: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  // Correctivo atado (si existe)
  corrId: string | null;
  corrCaseNo: number | null;
  corrStatus: string | null;
  corrWorkOrderNo: number | null;
  // Duplicados: novedades que son el mismo caso (mismo bus)
  dupGroupId: string | null;
  dupCount: number;
  dupRole: "principal" | "dependiente" | null;
  dupPrincipalId: string | null;
  dupPrincipalCaseNo: number | null;
  dupRelated: Array<{ id: string; caseNo: number | null }>;
};

type Col = { key: string; label: string; always?: boolean; sortable?: boolean };
const COLUMNS: Col[] = [
  { key: "caseNo", label: "#", always: true, sortable: true },
  { key: "createdAt", label: "Creado", sortable: true },
  { key: "bus", label: "Bus", sortable: true },
  { key: "placa", label: "Placa", sortable: true },
  { key: "asunto", label: "Novedad", always: true },
  { key: "equipo", label: "Equipo afectado", sortable: true },
  { key: "priority", label: "Prioridad", sortable: true },
  { key: "status", label: "Estado", sortable: true },
  { key: "duplicada", label: "Duplicada", sortable: true },
  { key: "correctivo", label: "Correctivo", sortable: true },
  { key: "creador", label: "Creador", sortable: true },
  { key: "asignado", label: "Asignado", sortable: true },
  { key: "ot", label: "# OT", sortable: true },
  { key: "updatedAt", label: "Actualizado", sortable: true },
  { key: "resolvedAt", label: "Resolución", sortable: true },
];
const ALL_KEYS = COLUMNS.map((c) => c.key);
const DEFAULT_ORDER = ["caseNo", "createdAt", "bus", "placa", "asunto", "equipo", "priority", "status", "duplicada", "correctivo", "creador", "asignado", "resolvedAt", "ot", "updatedAt"];
const DEFAULT_HIDDEN = ["ot", "updatedAt"];
const ORDER_KEY = "capitaldesk.novedades.colOrder.v3";
const HIDDEN_KEY = "capitaldesk.novedades.hiddenCols.v4";

const STATUS_ORDER: Record<string, number> = { NUEVO: 0, OT_ASIGNADA: 1, EN_EJECUCION: 2, RESUELTO: 3, CERRADO: 4 };
const KCOLS = [
  { key: "NUEVO", label: "Nuevo", color: "#2563eb" },
  { key: "OT_ASIGNADA", label: "OT asignada", color: "#06b6d4" },
  { key: "EN_EJECUCION", label: "En ejecución", color: "#f59e0b" },
  { key: "RESUELTO", label: "Resuelto", color: "#16a34a" },
  { key: "CERRADO", label: "Cerrado", color: "#64748b" },
];

function mapCaseStatus(status: string | null): StatusPillStatus {
  if (status === "NUEVO") return "nuevo";
  if (status === "OT_ASIGNADA" || status === "EN_EJECUCION") return "en_ejecucion";
  if (status === "RESUELTO" || status === "CERRADO") return "completado";
  return "nuevo";
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `hace ${days} d`;
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
}
function initials(name?: string | null) {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "—";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}
function reconcileOrder(stored: string[]): string[] {
  const valid = stored.filter((k) => ALL_KEYS.includes(k));
  for (const k of DEFAULT_ORDER) if (!valid.includes(k)) valid.push(k);
  return valid;
}

export default function NovedadesTable({ rows }: { rows: NovedadRow[] }) {
  const router = useRouter();
  const [hidden, setHidden] = useState<Set<string>>(new Set(DEFAULT_HIDDEN));
  const [order, setOrder] = useState<string[]>(DEFAULT_ORDER);
  const [sortKey, setSortKey] = useState<string>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [groupBy, setGroupBy] = useState<string>("none");
  const [colsOpen, setColsOpen] = useState(false);
  const [view, setView] = useState<"todas" | "kanban" | "conCorrectivo" | "pendientes">("todas");
  const [dragKey, setDragKey] = useState<string | null>(null);
  const colsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const h = window.localStorage.getItem(HIDDEN_KEY);
      if (h) setHidden(new Set(JSON.parse(h)));
      const o = window.localStorage.getItem(ORDER_KEY);
      if (o) setOrder(reconcileOrder(JSON.parse(o)));
    } catch {}
  }, []);
  const persistHidden = (next: Set<string>) => {
    setHidden(next);
    try {
      window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(Array.from(next)));
    } catch {}
  };
  const persistOrder = (next: string[]) => {
    setOrder(next);
    try {
      window.localStorage.setItem(ORDER_KEY, JSON.stringify(next));
    } catch {}
  };

  useEffect(() => {
    if (!colsOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (colsRef.current && !colsRef.current.contains(e.target as Node)) setColsOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [colsOpen]);

  const visible = (key: string) => !hidden.has(key);
  const toggleCol = (key: string) => {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    persistHidden(next);
  };
  const setSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };
  const moveDrag = (overKey: string) => {
    if (!dragKey || dragKey === overKey) return;
    const a = [...order];
    const from = a.indexOf(dragKey);
    const to = a.indexOf(overKey);
    if (from < 0 || to < 0) return;
    a.splice(from, 1);
    a.splice(to, 0, dragKey);
    persistOrder(a);
  };

  const orderedCols = useMemo(() => order.map((k) => COLUMNS.find((c) => c.key === k)).filter(Boolean) as Col[], [order]);
  const visibleCols = useMemo(() => orderedCols.filter((c) => visible(c.key)), [orderedCols, hidden]);

  const cmp = (a: NovedadRow, b: NovedadRow) => {
    const t = (s: string | null) => (s ? new Date(s).getTime() : -Infinity);
    let r = 0;
    switch (sortKey) {
      case "caseNo": r = (a.caseNo ?? 0) - (b.caseNo ?? 0); break;
      case "bus": r = a.busCode.localeCompare(b.busCode); break;
      case "placa": r = (a.busPlate ?? "~").localeCompare(b.busPlate ?? "~"); break;
      case "priority": r = a.priority - b.priority; break;
      case "createdAt": r = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(); break;
      case "updatedAt": r = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(); break;
      case "resolvedAt": r = t(a.resolvedAt) - t(b.resolvedAt); break;
      case "equipo": r = (a.equipo ?? "~").localeCompare(b.equipo ?? "~"); break;
      case "status": r = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9); break;
      case "duplicada": {
        const rank = (x: NovedadRow) => (x.dupRole === "principal" ? 0 : x.dupRole === "dependiente" ? 1 : 2);
        r = rank(a) - rank(b);
        break;
      }
      case "correctivo": r = (a.corrCaseNo ?? 0) - (b.corrCaseNo ?? 0); break;
      case "creador": r = (a.creator ?? "~").localeCompare(b.creator ?? "~"); break;
      case "asignado": r = (a.assignee ?? "~").localeCompare(b.assignee ?? "~"); break;
      case "ot": r = (a.corrWorkOrderNo ?? 0) - (b.corrWorkOrderNo ?? 0); break;
      default: r = 0;
    }
    return sortDir === "asc" ? r : -r;
  };

  const baseRows = useMemo(() => {
    if (view === "conCorrectivo") return rows.filter((r) => r.corrId);
    if (view === "pendientes") return rows.filter((r) => !r.corrId);
    return rows;
  }, [rows, view]);
  const sorted = useMemo(() => [...baseRows].sort(cmp), [baseRows, sortKey, sortDir]);

  const groups = useMemo(() => {
    if (groupBy === "none") return [{ key: "", label: "", rows: sorted }];
    const map = new Map<string, NovedadRow[]>();
    for (const r of sorted) {
      let k = "";
      if (groupBy === "status") k = labelFromMap(r.status, caseStatusLabels);
      else if (groupBy === "equipo") k = r.equipo ?? "Sin equipo";
      else if (groupBy === "bus") k = r.busCode;
      else if (groupBy === "duplicado") k = r.dupGroupId && r.dupCount > 1 ? `Mismo caso · ${r.busCode}` : "Sin duplicados";
      else if (groupBy === "correctivo") k = r.corrId ? "Con correctivo" : "Pendiente";
      const arr = map.get(k) ?? [];
      arr.push(r);
      map.set(k, arr);
    }
    return Array.from(map.entries()).map(([label, rs]) => ({ key: label, label, rows: rs }));
  }, [sorted, groupBy]);

  const colCount = visibleCols.length;

  const CorrectivoCell = ({ c }: { c: NovedadRow }) => {
    if (!c.corrId) return <span className="text-xs text-slate-400">Pendiente</span>;
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          router.push(`/cases/${c.corrId}`);
        }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-white px-2 py-1 text-left transition hover:bg-slate-50"
        title="Abrir correctivo"
      >
        <Link2 className="h-3 w-3 text-slate-400" />
        <span className="text-[11px] tabular-nums text-slate-500">
          {c.corrCaseNo ? `CASO-${String(c.corrCaseNo).padStart(3, "0")}` : "Correctivo"}
        </span>
        <StatusPill status={mapCaseStatus(c.corrStatus)} label={labelFromMap(c.corrStatus ?? "", caseStatusLabels) || "—"} />
      </button>
    );
  };

  const dateCell = (iso: string) => (
    <>
      <div className="text-xs text-slate-600">{fmtDate(iso)}</div>
      <div className="text-[10.5px] text-slate-400">{relTime(iso)}</div>
    </>
  );

  const renderCell = (key: string, c: NovedadRow) => {
    switch (key) {
      case "caseNo": return <span className="text-sm tabular-nums text-slate-400">{c.caseNo}</span>;
      case "createdAt": return dateCell(c.createdAt);
      case "bus": return <span className="text-sm font-medium text-slate-700">{c.busCode}</span>;
      case "placa":
        return c.busPlate ? (
          <span className="inline-flex items-center rounded-md border border-border/60 bg-slate-50 px-1.5 py-0.5 text-xs font-medium tabular-nums text-slate-700">
            {c.busPlate}
          </span>
        ) : (
          <span className="text-xs text-slate-400">Sin placa</span>
        );
      case "asunto":
        return (
          <div className="max-w-[300px]">
            <div className="truncate text-sm font-medium text-slate-800">{c.title}</div>
            <div className="truncate text-xs text-muted-foreground">{c.busCode} · {c.busPlate ?? "Sin placa"}</div>
          </div>
        );
      case "equipo": return <span className="text-xs text-slate-600">{c.equipo ?? "—"}</span>;
      case "priority": return <PriorityBadge priority={c.priority} />;
      case "status":
        return (
          <StatusPill
            status={mapCaseStatus(c.status)}
            label={labelFromMap(c.status, caseStatusLabels)}
            pulse={c.status === "EN_EJECUCION" || c.status === "OT_ASIGNADA"}
          />
        );
      case "duplicada": {
        if (c.dupRole === "dependiente") {
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (c.dupPrincipalId) router.push(`/cases/${c.dupPrincipalId}`);
              }}
              title="Esta novedad es un duplicado: depende de la principal"
              className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 transition hover:bg-amber-100"
            >
              <Copy className="h-3 w-3" /> Duplicada de{" "}
              {c.dupPrincipalCaseNo ? `CASO-${String(c.dupPrincipalCaseNo).padStart(3, "0")}` : "—"}
            </button>
          );
        }
        if (c.dupRole === "principal") {
          const shown = c.dupRelated.slice(0, 2);
          const extra = c.dupRelated.length - shown.length;
          return (
            <span className="inline-flex flex-wrap items-center gap-1 text-[11px] text-slate-600" title="Otras novedades la duplican">
              <Crown className="h-3 w-3 text-amber-600" />
              <span className="text-slate-400">Duplicada por</span>
              {shown.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/cases/${m.id}`);
                  }}
                  className="rounded border border-border/60 bg-white px-1 tabular-nums text-slate-600 transition hover:bg-slate-50"
                >
                  {m.caseNo ? `CASO-${String(m.caseNo).padStart(3, "0")}` : "caso"}
                </button>
              ))}
              {extra > 0 ? <span className="text-slate-400">+{extra}</span> : null}
            </span>
          );
        }
        return <span className="text-xs text-slate-400">—</span>;
      }
      case "correctivo": return <CorrectivoCell c={c} />;
      case "creador":
        return c.creator ? (
          <span className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-semibold text-blue-700">
              {initials(c.creator)}
            </span>
            <span className="truncate text-xs text-slate-600">{c.creator}</span>
          </span>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        );
      case "asignado":
        return c.assignee ? (
          <span className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-semibold text-emerald-700">
              {initials(c.assignee)}
            </span>
            <span className="truncate text-xs text-slate-600">{c.assignee}</span>
          </span>
        ) : (
          <span className="text-xs text-slate-400">Sin asignar</span>
        );
      case "ot": return <span className="text-xs tabular-nums text-slate-500">{c.corrWorkOrderNo ? `#${c.corrWorkOrderNo}` : "—"}</span>;
      case "updatedAt": return dateCell(c.updatedAt);
      case "resolvedAt": return c.resolvedAt ? dateCell(c.resolvedAt) : <span className="text-xs text-slate-400">—</span>;
      default: return null;
    }
  };

  const SortHead = ({ col }: { col: Col }) => {
    const active = sortKey === col.key;
    return (
      <th
        className={`px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400 ${
          col.sortable ? "cursor-pointer select-none hover:text-slate-600" : ""
        }`}
        onClick={col.sortable ? () => setSort(col.key) : undefined}
      >
        <span className="inline-flex items-center gap-1">
          {col.label}
          {active ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
        </span>
      </th>
    );
  };

  const renderRow = (c: NovedadRow) => (
    <tr
      key={c.id}
      onClick={() => router.push(`/cases/${c.id}`)}
      className="cursor-pointer border-b border-border/40 transition last:border-0 hover:bg-slate-50"
    >
      {visibleCols.map((col) => (
        <td key={col.key} className="px-3 py-2.5">
          {renderCell(col.key, c)}
        </td>
      ))}
    </tr>
  );

  const KanbanCard = ({ c }: { c: NovedadRow }) => (
    <div
      onClick={() => router.push(`/cases/${c.id}`)}
      className="cursor-pointer rounded-xl border border-border/60 bg-white p-2.5 shadow-sm transition hover:shadow-md"
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] tabular-nums text-slate-400">#{c.caseNo}</span>
        <PriorityBadge priority={c.priority} />
      </div>
      <div className="truncate text-[13px] font-medium text-slate-800">{c.title}</div>
      <div className="truncate text-[11px] text-muted-foreground">{c.busCode} · {c.equipo ?? "Sin equipo"}</div>
      <div className="mt-2 flex items-center justify-between">
        {c.corrId ? (
          <span className="inline-flex items-center gap-1 text-[10.5px] text-slate-500">
            <Link2 className="h-3 w-3" /> Correctivo {c.corrCaseNo ? `#${c.corrCaseNo}` : ""}
          </span>
        ) : (
          <span className="text-[10.5px] text-slate-400">Sin correctivo</span>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-2.5">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .nov-xscroll{scrollbar-width:thin;scrollbar-color:#cbd5e1 #eef1f5;}
            .nov-xscroll::-webkit-scrollbar{height:11px;}
            .nov-xscroll::-webkit-scrollbar-track{background:#eef1f5;}
            .nov-xscroll::-webkit-scrollbar-thumb{background:#c2ccd9;border-radius:8px;border:2px solid #eef1f5;}
            .nov-xscroll::-webkit-scrollbar-thumb:hover{background:#94a3b8;}
          `,
        }}
      />
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap overflow-hidden rounded-lg border border-border/70 text-xs">
          <button type="button" onClick={() => setView("todas")} className={`inline-flex items-center gap-1.5 px-3 py-1.5 font-medium ${view === "todas" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
            <List className="h-3.5 w-3.5" /> Tabla
          </button>
          <button type="button" onClick={() => setView("kanban")} className={`inline-flex items-center gap-1.5 border-l border-border/60 px-3 py-1.5 font-medium ${view === "kanban" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
            <LayoutGrid className="h-3.5 w-3.5" /> Kanban
          </button>
          <button type="button" onClick={() => setView("conCorrectivo")} className={`border-l border-border/60 px-3 py-1.5 font-medium ${view === "conCorrectivo" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
            Con correctivo
          </button>
          <button type="button" onClick={() => setView("pendientes")} className={`border-l border-border/60 px-3 py-1.5 font-medium ${view === "pendientes" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
            Pendientes
          </button>
        </div>

        {view !== "kanban" ? (
          <>
            <label className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-white px-2.5 py-1.5 text-xs text-slate-600">
              <Layers className="h-3.5 w-3.5" />
              Agrupar:
              <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className="bg-transparent text-xs font-medium text-slate-700 outline-none">
                <option value="none">Ninguno</option>
                <option value="status">Estado</option>
                <option value="equipo">Equipo afectado</option>
                <option value="bus">Bus</option>
                <option value="duplicado">Mismo caso (duplicadas)</option>
                <option value="correctivo">Correctivo</option>
              </select>
            </label>

            <div className="relative" ref={colsRef}>
              <button type="button" onClick={() => setColsOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
                <Columns3 className="h-3.5 w-3.5" /> Columnas
              </button>
              {colsOpen ? (
                <div className="absolute left-0 top-full z-30 mt-1.5 w-60 rounded-xl border border-border/70 bg-white p-2 shadow-xl">
                  <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Arrastra para ordenar · marca para mostrar
                  </p>
                  {orderedCols.map((c) => (
                    <div
                      key={c.key}
                      draggable
                      onDragStart={() => setDragKey(c.key)}
                      onDragEnd={() => setDragKey(null)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        moveDrag(c.key);
                      }}
                      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] ${dragKey === c.key ? "bg-blue-50" : "hover:bg-slate-50"}`}
                    >
                      <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-slate-300" />
                      <input type="checkbox" checked={visible(c.key)} disabled={c.always} onChange={() => !c.always && toggleCol(c.key)} />
                      <span className={c.always ? "text-slate-400" : "text-slate-700"}>{c.label}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <span className="ml-auto text-[11px] text-slate-400">
              Orden: {COLUMNS.find((c) => c.key === sortKey)?.label ?? sortKey} {sortDir === "asc" ? "↑" : "↓"}
            </span>
          </>
        ) : null}
      </div>

      {/* Vista Tabla */}
      {view !== "kanban" ? (
        <div className="nov-xscroll overflow-x-auto rounded-2xl border border-border/60 bg-white shadow-sm">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr className="border-b border-border/50 bg-slate-50/60">
                {visibleCols.map((col) => (
                  <SortHead key={col.key} col={col} />
                ))}
              </tr>
            </thead>
            {groupBy === "none" ? (
              <tbody>
                {groups[0].rows.length ? (
                  groups[0].rows.map(renderRow)
                ) : (
                  <tr>
                    <td colSpan={colCount} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      No hay novedades con estos filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            ) : (
              groups.map((g) => (
                <tbody key={g.key}>
                  <tr className="bg-slate-50/80">
                    <td colSpan={colCount} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {g.label}{" "}
                      <span className="ml-1 rounded-full bg-slate-200 px-1.5 text-[10px] tabular-nums text-slate-600">{g.rows.length}</span>
                    </td>
                  </tr>
                  {g.rows.map(renderRow)}
                </tbody>
              ))
            )}
          </table>
        </div>
      ) : (
        /* Vista Kanban */
        <div className="flex gap-3 overflow-x-auto pb-2">
          {KCOLS.map((col) => {
            const items = sorted.filter((r) => r.status === col.key);
            return (
              <div key={col.key} className="flex w-[260px] shrink-0 flex-col rounded-2xl border border-border/60 bg-slate-50/50">
                <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
                  <span className="flex items-center gap-2 text-[12.5px] font-semibold text-slate-700">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: col.color }} />
                    {col.label}
                  </span>
                  <span className="rounded-full bg-white px-1.5 text-[10px] tabular-nums text-slate-500">{items.length}</span>
                </div>
                <div className="flex flex-col gap-2 p-2">
                  {items.length === 0 ? (
                    <p className="px-1 py-3 text-center text-[11px] text-slate-300">—</p>
                  ) : (
                    items.map((c) => <KanbanCard key={c.id} c={c} />)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
