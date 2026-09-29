"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Celda "Avisar al cliente" editable en línea: elige el contacto que recibirá el
 * aviso cuando la novedad se cierre, sin entrar al detalle del caso.
 * Usa PATCH /api/cases/[id]/notify-on-close.
 *
 * Solo aplica a NOVEDADES: en los demás tipos de caso se muestra un guion.
 */
export default function NotifyClientCell({
  caseId,
  caseType,
  currentId,
  currentName,
  contacts,
}: {
  caseId: string;
  caseType: string;
  currentId: string | null;
  currentName: string | null;
  contacts: { id: string; name: string; interno?: boolean }[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  if (caseType !== "NOVEDAD") {
    return <span className="text-xs text-slate-300">—</span>;
  }

  const hasCurrent = !!currentId && contacts.some((u) => u.id === currentId);
  const extra = currentId && !hasCurrent ? { id: currentId, name: currentName ?? "Contacto actual" } : null;
  const delCliente = contacts.filter((c) => !c.interno);
  const internos = contacts.filter((c) => c.interno);

  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    if (value === (currentId ?? "")) return;
    setSaving(true);
    setError(false);
    try {
      const res = await fetch(`/api/cases/${caseId}/notify-on-close`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: value || null }),
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
      title={error ? "No se pudo guardar — reintenta" : currentName ?? "Sin aviso al cliente"}
      className={`max-w-[170px] truncate rounded-md border bg-white px-1.5 py-1 text-xs disabled:opacity-50 ${
        error
          ? "border-red-400 text-red-600"
          : currentId
          ? "border-slate-200 text-slate-700"
          : "border-slate-200 text-slate-400"
      }`}
    >
      <option value="">{saving ? "Guardando…" : "Sin aviso"}</option>
      {extra ? <option value={extra.id}>{extra.name}</option> : null}
      {delCliente.length ? (
        <optgroup label="Contactos del cliente">
          {delCliente.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </optgroup>
      ) : null}
      {internos.length ? (
        <optgroup label="Equipo UPK">
          {internos.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </optgroup>
      ) : null}
    </select>
  );
}
