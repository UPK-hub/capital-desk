"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  workOrderId: string;
};

export default function ValidateWorkOrderCard({ workOrderId }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function validate() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/validate`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "No se pudo validar la OT");
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "No se pudo validar la OT");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="sts-card p-5">
      <h2 className="text-base font-semibold">Validación coordinador</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Valida el acta para cerrar el caso y habilitar PDF/recibo.
      </p>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      <button
        type="button"
        onClick={validate}
        disabled={saving}
        className="mt-3 inline-flex w-full items-center justify-center rounded-md border px-4 py-2 text-sm disabled:opacity-60"
      >
        {saving ? "Validando..." : "Verificar OT"}
      </button>
    </section>
  );
}

