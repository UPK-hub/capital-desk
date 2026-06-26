"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Celda "Asignado" editable en línea: un desplegable que cambia el RESPONSABLE
 * del caso (Case.assignedToId) sin entrar al detalle. Usa PATCH /api/cases/[id].
 * Se usa en la tabla de Casos y en la de Novedades.
 */
export default function AssigneeCell({
  caseId,
  currentId,
  currentName,
  users,
}: {
  caseId: string;
  currentId: string | null;
  currentName: string | null;
  users: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  // Si el responsable actual no está en la lista (p.ej. no es de UPK), igual lo
  // mostramos como opción para que no aparezca en blanco.
  const hasCurrent = !!currentId && users.some((u) => u.id === currentId);
  const extra = currentId && !hasCurrent ? { id: currentId, name: currentName ?? "Asignado actual" } : null;

  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value; // "" = sin asignar
    if (value === (currentId ?? "")) return;
    setSaving(true);
    setError(false);
    try {
      const res = await fetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedToId: value || null }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <select
      value={currentId ?? ""}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      disabled={saving}
      title={error ? "No se pudo asignar — reintenta" : currentName ?? "Sin asignar"}
      className={`max-w-[160px] truncate rounded-md border bg-white px-1.5 py-1 text-xs disabled:opacity-50 ${
        error ? "border-red-400 text-red-600" : currentId ? "border-slate-200 text-slate-700" : "border-slate-200 text-slate-400"
      }`}
    >
      <option value="">{saving ? "Guardando…" : "Sin asignar"}</option>
      {extra ? <option value={extra.id}>{extra.name}</option> : null}
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </select>
  );
}
