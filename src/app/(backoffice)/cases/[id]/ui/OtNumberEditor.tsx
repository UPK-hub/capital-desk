"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OtNumberEditor({
  caseId,
  current,
}: {
  caseId: string;
  current: number | null;
}) {
  const router = useRouter();
  const [val, setVal] = useState(current != null ? String(current) : "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workOrderNo: val.trim() || null }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error ?? "No se pudo guardar");
      setMsg("Número de OT guardado.");
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <p className="text-xs text-muted-foreground">Número de OT (CapitalBus)</p>
      <div className="mt-1 flex gap-2">
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="Ej. 12345"
          inputMode="numeric"
          className="app-field-control h-9 w-full rounded-lg px-3 text-sm"
        />
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="sts-btn-primary h-9 shrink-0 px-3 text-sm disabled:opacity-50"
        >
          {saving ? "..." : "Guardar"}
        </button>
      </div>
      {msg ? <p className="mt-1 text-xs text-muted-foreground">{msg}</p> : null}
    </div>
  );
}
