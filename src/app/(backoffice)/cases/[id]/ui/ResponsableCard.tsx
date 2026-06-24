"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ResponsableCard({
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
  const [sel, setSel] = useState(currentId ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedToId: sel || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "No se pudo guardar");
      setMsg("Responsable actualizado.");
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="sts-card overflow-hidden">
      <div className="border-b border-border/50 bg-muted/20 p-5">
        <h2 className="text-base font-semibold">Responsable del caso</h2>
      </div>
      <div className="space-y-3 p-5">
        <p className="text-xs text-muted-foreground">
          Persona asignada al caso. No cambia el estado ni requiere OT (sirve también en casos cerrados).
        </p>
        <select
          value={sel}
          onChange={(e) => setSel(e.target.value)}
          className="app-field-control h-10 w-full rounded-xl px-3 text-sm"
        >
          <option value="">— Sin asignar —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {currentName ? `Actual: ${currentName}` : "Sin responsable"}
          </span>
          <button
            type="button"
            onClick={save}
            disabled={saving || sel === (currentId ?? "")}
            className="sts-btn-primary h-9 px-4 text-sm disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
        {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
      </div>
    </section>
  );
}
