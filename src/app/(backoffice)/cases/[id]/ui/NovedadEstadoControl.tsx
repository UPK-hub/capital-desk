"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { caseStatusLabels } from "@/lib/labels";

// Estados que se pueden fijar manualmente en una novedad (para gestionarla).
const STATUSES: { value: string; label: string }[] = [
  { value: "NUEVO", label: "Nueva" },
  { value: "EN_EJECUCION", label: "En gestión" },
  { value: "RESUELTO", label: "Resuelta" },
  { value: "CERRADO", label: "Cerrada" },
];

export default function NovedadEstadoControl({
  caseId,
  current,
}: {
  caseId: string;
  current: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [value, setValue] = React.useState(current);

  // Si el estado actual no está entre los editables, lo mostramos igual como opción.
  const options = STATUSES.some((s) => s.value === value)
    ? STATUSES
    : [{ value, label: caseStatusLabels[value] ?? value }, ...STATUSES];

  async function change(next: string) {
    if (next === value || saving) return;
    const prev = value;
    setValue(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "No se pudo cambiar el estado.");
      router.refresh();
    } catch (e: any) {
      setValue(prev);
      setError(e?.message ?? "No se pudo cambiar el estado.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <select
        value={value}
        disabled={saving}
        onChange={(e) => change(e.target.value)}
        className="rounded-md border border-border/70 bg-white px-2 py-1 text-[12px] font-medium text-slate-700 disabled:opacity-60"
        title="Cambiar el estado de la novedad"
      >
        {options.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      {error ? <span className="text-[10px] text-red-600">{error}</span> : null}
    </div>
  );
}
