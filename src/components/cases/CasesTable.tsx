"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Columns3, Layers, List, LayoutGrid, ChevronUp, ChevronDown } from "lucide-react";
import { StatusPill, StatusPillStatus } from "@/components/ui/status-pill";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { TypeBadge } from "@/components/ui/TypeBadge";
import { caseStatusLabels, caseTypeLabels, labelFromMap } from "@/lib/labels";

export type CaseRow = {
  id: string;
  caseNo: number | null;
  title: string;
  busCode: string;
  busPlate: string | null;
  type: string;
  status: string;
  priority: number;
  assignee: string | null;
  createdAt: string;
  updatedAt: string;
};

const COLUMNS: { key: string; label: string; always?: boolean; sortable?: boolean }[] = [
  { key: "caseNo", label: "#", always: true, sortable: true },
  { key: "asunto", label: "Asunto", always: true },
  { key: "type", label: "Tipo", sortable: true },
  { key: "priority", label: "Prioridad", sortable: true },
  { key: "status", label: "Estado", sortable: true },
  { key: "assignee", label: "Asignado", sortable: true },
  { key: "createdAt", label: "Creado", sortable: true },
  { key: "updatedAt", label: "Actualizado", sortable: true },
];

const STORAGE_KEY = "capitaldesk.cases.hiddenCols";
const STATUS_ORDER: Record<string, number> = {
  NUEVO: 0,
  OT_ASIGNADA: 1,
  EN_EJECUCION: 2,
  RESUELTO: 3,
  CERRADO: 4,
};

function mapCaseStatus(status: string): StatusPillStatus {
  if (status === "NUEVO") return "nuevo";
  if (status === "OT_ASIGNADA" || status === "EN_EJECUCION") return "en_ejecucion";
  if (status === "RESUELTO" || status === "CERRADO") return "completado";
  return "nuevo";
}
function initials(name?: string | null) {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "—";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
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

export default function CasesTable({ rows }: { rows: CaseRow[] }) {
  const router = useRouter();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<string>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [groupBy, setGroupBy] = useState<string>("none");
  const [colsOpen, setColsOpen] = useState(false);
  const colsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setHidden(new Set(JSON.parse(raw)));
    } catch {}
  }, []);
  const persistHidden = (next: Set<string>) => {
    setHidden(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next)));
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

  const cmp = (a: CaseRow, b: CaseRow) => {
    let r = 0;
    switch (sortKey) {
      case "caseNo":
        r = (a.caseNo ?? 0) - (b.caseNo ?? 0);
        break;
      case "priority":
        r = a.priority - b.priority;
        break;
      case "createdAt":
        r = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
      case "updatedAt":
        r = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        break;
      case "type":
        r = labelFromMap(a.type, caseTypeLabels).localeCompare(labelFromMap(b.type, caseTypeLabels));
        break;
      case "status":
        r = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
        break;
      case "assignee":
        r = (a.assignee ?? "~").localeCompare(b.assignee ?? "~");
        break;
      default:
        r = 0;
    }
    return sortDir === "asc" ? r : -r;
  };

  const sorted = useMemo(() => [...rows].sort(cmp), [rows, sortKey, sortDir]);

  const groups = useMemo(() => {
    if (groupBy === "none") return [{ key: "", label: "", rows: sorted }];
    const map = new Map<string, CaseRow[]>();
    for (const r of sorted) {
      let k = "";
      if (groupBy === "status") k = labelFromMap(r.status, caseStatusLabels);
      else if (groupBy === "type") k = labelFromMap(r.type, caseTypeLabels);
      else if (groupBy === "bus") k = r.busCode;
      else if (groupBy === "assignee") k = r.assignee ?? "Sin asignar";
      const arr = map.get(k) ?? [];
      arr.push(r);
      map.set(k, arr);
    }
    return Array.from(map.entries()).map(([label, rs]) => ({ key: label, label, rows: rs }));
  }, [sorted, groupBy]);

  const colCount = COLUMNS.filter((c) => visible(c.key)).length;

  const SortHead = ({ ck, label, align }: { ck: string; label: string; align?: string }) => {
    const col = COLUMNS.find((c) => c.key === ck);
    const active = sortKey === ck;
    return (
      <th
        className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 ${
          align === "right" ? "text-right" : "text-left"
        } ${col?.sortable ? "cursor-pointer select-none hover:text-slate-600" : ""}`}
        onClick={col?.sortable ? () => setSort(ck) : undefined}
      >
        <span className={`inline-flex items-center gap-1 ${align === "right" ? "justify-end" : ""}`}>
          {label}
          {active ? (
            sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
          ) : null}
        </span>
      </th>
    );
  };

  const renderRow = (c: CaseRow) => (
    <tr
      key={c.id}
      onClick={() => router.push(`/cases/${c.id}`)}
      className="cursor-pointer border-b border-border/40 transition last:border-0 hover:bg-slate-50"
    >
      {visible("caseNo") && <td className="px-3 py-2.5 text-sm tabular-nums text-slate-400">{c.caseNo}</td>}
      {visible("asunto") && (
        <td className="px-3 py-2.5">
          <div className="max-w-[280px]">
            <div className="truncate text-sm font-medium text-slate-800">{c.title}</div>
            <div className="truncate text-xs text-muted-foreground">
              {c.busCode} · {c.busPlate ?? "Sin placa"}
            </div>
          </div>
        </td>
      )}
      {visible("type") && (
        <td className="px-3 py-2.5">
          <TypeBadge type={c.type as any} label={labelFromMap(c.type, caseTypeLabels)} />
        </td>
      )}
      {visible("priority") && (
        <td className="px-3 py-2.5">
          <PriorityBadge priority={c.priority} />
        </td>
      )}
      {visible("status") && (
        <td className="px-3 py-2.5">
          <StatusPill
            status={mapCaseStatus(c.status)}
            label={labelFromMap(c.status, caseStatusLabels)}
            pulse={c.status === "EN_EJECUCION" || c.status === "OT_ASIGNADA"}
          />
        </td>
      )}
      {visible("assignee") && (
        <td className="px-3 py-2.5">
          {c.assignee ? (
            <span className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-semibold text-blue-700">
                {initials(c.assignee)}
              </span>
              <span className="truncate text-xs text-slate-600">{c.assignee}</span>
            </span>
          ) : (
            <span className="text-xs text-slate-400">Sin asignar</span>
          )}
        </td>
      )}
      {visible("createdAt") && <td className="px-3 py-2.5 text-xs text-muted-foreground">{relTime(c.createdAt)}</td>}
      {visible("updatedAt") && (
        <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">{relTime(c.updatedAt)}</td>
      )}
    </tr>
  );

  return (
    <div className="space-y-2.5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-lg border border-border/70 text-xs">
          <span className="inline-flex items-center gap-1.5 bg-blue-600 px-3 py-1.5 font-medium text-white">
            <List className="h-3.5 w-3.5" /> Tabla
          </span>
          <span
            className="inline-flex cursor-not-allowed items-center gap-1.5 bg-white px-3 py-1.5 text-slate-400"
            title="Disponible en la etapa 3"
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Kanban
          </span>
        </div>

        <label className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-white px-2.5 py-1.5 text-xs text-slate-600">
          <Layers className="h-3.5 w-3.5" />
          Agrupar:
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value)}
            className="bg-transparent text-xs font-medium text-slate-700 outline-none"
          >
            <option value="none">Ninguno</option>
            <option value="status">Estado</option>
            <option value="type">Tipo</option>
            <option value="bus">Bus</option>
            <option value="assignee">Responsable</option>
          </select>
        </label>

        <div className="relative" ref={colsRef}>
          <button
            type="button"
            onClick={() => setColsOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
          >
            <Columns3 className="h-3.5 w-3.5" /> Columnas
          </button>
          {colsOpen ? (
            <div className="absolute left-0 top-full z-30 mt-1.5 w-52 rounded-xl border border-border/70 bg-white p-2 shadow-xl">
              <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Mostrar columnas
              </p>
              {COLUMNS.map((c) => (
                <label
                  key={c.key}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] ${
                    c.always ? "text-slate-400" : "cursor-pointer text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={visible(c.key)}
                    disabled={c.always}
                    onChange={() => !c.always && toggleCol(c.key)}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          ) : null}
        </div>

        <span className="ml-auto text-[11px] text-slate-400">
          Orden: {COLUMNS.find((c) => c.key === sortKey)?.label ?? sortKey} {sortDir === "asc" ? "↑" : "↓"}
        </span>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-white shadow-sm">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr className="border-b border-border/50 bg-slate-50/60">
              {visible("caseNo") && <SortHead ck="caseNo" label="#" />}
              {visible("asunto") && <SortHead ck="asunto" label="Asunto" />}
              {visible("type") && <SortHead ck="type" label="Tipo" />}
              {visible("priority") && <SortHead ck="priority" label="Prioridad" />}
              {visible("status") && <SortHead ck="status" label="Estado" />}
              {visible("assignee") && <SortHead ck="assignee" label="Asignado" />}
              {visible("createdAt") && <SortHead ck="createdAt" label="Creado" />}
              {visible("updatedAt") && <SortHead ck="updatedAt" label="Actualizado" align="right" />}
            </tr>
          </thead>
          {groupBy === "none" ? (
            <tbody>{groups[0].rows.map(renderRow)}</tbody>
          ) : (
            groups.map((g) => (
              <tbody key={g.key}>
                <tr className="bg-slate-50/80">
                  <td
                    colSpan={colCount}
                    className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                  >
                    {g.label}{" "}
                    <span className="ml-1 rounded-full bg-slate-200 px-1.5 text-[10px] tabular-nums text-slate-600">
                      {g.rows.length}
                    </span>
                  </td>
                </tr>
                {g.rows.map(renderRow)}
              </tbody>
            ))
          )}
        </table>
      </div>
    </div>
  );
}
