"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { caseStatusLabels, caseTypeLabels, labelFromMap } from "@/lib/labels";

export type GestionRow = {
  id: string;
  caseNo: number | null;
  type: string;
  status: string;
  priority: number;
  title: string;
  busCode: string;
  busPlate: string | null;
  responsableId: string | null;
  responsableName: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

type User = { id: string; name: string };

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function statusPill(status: string) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium";
  if (status === "NUEVO") return `${base} bg-blue-50 text-blue-700`;
  if (status === "OT_ASIGNADA" || status === "EN_EJECUCION") return `${base} bg-amber-50 text-amber-700`;
  if (status === "RESUELTO" || status === "CERRADO") return `${base} bg-emerald-50 text-emerald-700`;
  return `${base} bg-slate-100 text-slate-600`;
}
function fmtCaseNo(n: number | null) {
  return n ? `CASO-${String(n).padStart(3, "0")}` : "—";
}

export default function GestionCasosTable({ rows, users, canAssign = true }: { rows: GestionRow[]; users: User[]; canAssign?: boolean }) {
  const router = useRouter();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function assign(caseId: string, userId: string) {
    setSavingId(caseId);
    setErr(null);
    try {
      const res = await fetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedToId: userId || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "No se pudo asignar.");
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "No se pudo asignar.");
    } finally {
      setSavingId(null);
    }
  }

  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-border/60 bg-white p-6 text-center text-sm text-muted-foreground shadow-sm">
        No hay casos con estos filtros.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border/60 bg-white shadow-sm">
      <table className="w-full min-w-[920px] border-collapse">
        <thead>
          <tr className="border-b border-border/50 bg-slate-50/60 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            <th className="px-3 py-2.5">#</th>
            <th className="px-3 py-2.5">Bus</th>
            <th className="px-3 py-2.5">Placa</th>
            <th className="px-3 py-2.5">Tipo</th>
            <th className="px-3 py-2.5">Gestión</th>
            <th className="px-3 py-2.5">Estado</th>
            <th className="px-3 py-2.5">Responsable</th>
            <th className="px-3 py-2.5">Resolución</th>
            <th className="px-3 py-2.5">Creado</th>
            <th className="px-3 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              onClick={() => router.push(`/cases/${r.id}`)}
              className="cursor-pointer border-b border-border/40 transition last:border-0 hover:bg-slate-50"
            >
              <td className="px-3 py-2.5 text-sm tabular-nums text-slate-500">{fmtCaseNo(r.caseNo)}</td>
              <td className="px-3 py-2.5 text-sm font-medium text-slate-700">{r.busCode}</td>
              <td className="px-3 py-2.5 text-xs tabular-nums text-slate-600">{r.busPlate ?? "—"}</td>
              <td className="px-3 py-2.5 text-xs text-slate-600">{labelFromMap(r.type, caseTypeLabels)}</td>
              <td className="px-3 py-2.5">
                <span className="block max-w-[260px] truncate text-[13px] text-slate-700">{r.title}</span>
              </td>
              <td className="px-3 py-2.5">
                <span className={statusPill(r.status)}>{labelFromMap(r.status, caseStatusLabels)}</span>
              </td>
              <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                {canAssign ? (
                  <select
                    value={r.responsableId ?? ""}
                    disabled={savingId === r.id}
                    onChange={(e) => void assign(r.id, e.target.value)}
                    className="app-field-control h-8 w-[150px] rounded-lg px-2 text-xs disabled:opacity-60"
                  >
                    <option value="">Sin asignar</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-slate-600">{r.responsableName ?? "Sin asignar"}</span>
                )}
              </td>
              <td className="px-3 py-2.5 text-xs text-slate-600">{fmt(r.resolvedAt)}</td>
              <td className="px-3 py-2.5 text-xs text-slate-500">{fmt(r.createdAt)}</td>
              <td className="px-3 py-2.5 text-right">
                <span className="text-xs font-medium text-blue-600">Abrir</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {err ? <p className="px-3 py-2 text-xs text-red-600">{err}</p> : null}
    </div>
  );
}
