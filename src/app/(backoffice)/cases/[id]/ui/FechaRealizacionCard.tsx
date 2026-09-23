"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, RotateCcw } from "lucide-react";
import { performedDateInputValue } from "@/lib/cases/performed-at";

/**
 * Fecha en la que realmente se realizó el trabajo.
 *
 * Por defecto es la fecha de creación del caso. Se puede corregir cuando el
 * técnico carga y cierra el caso otro día (por ejemplo, un preventivo hecho el
 * 31 de agosto que quedó cerrado el 1 de septiembre): es la fecha con la que el
 * caso cuenta en los reportes del mes.
 */
export default function FechaRealizacionCard({
  caseId,
  createdAt,
  performedAt,
  canManage = false,
  titulo = "Fecha de realización",
}: {
  caseId: string;
  createdAt: string;
  performedAt: string | null;
  canManage?: boolean;
  titulo?: string;
}) {
  const router = useRouter();
  const porDefecto = performedDateInputValue(createdAt);
  const [value, setValue] = React.useState(() => performedDateInputValue(performedAt ?? createdAt));
  const [guardado, setGuardado] = React.useState<string | null>(performedAt);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const actual = performedDateInputValue(guardado ?? createdAt);
  const usaDefecto = !guardado;
  const cambiado = value !== actual;

  async function guardar(fecha: string | null) {
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/cases/${caseId}/performed-at`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: fecha }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "No se pudo guardar la fecha.");
        return;
      }
      setGuardado(data?.performedAt ?? null);
      setValue(data?.effectiveDate ?? porDefecto);
      setMsg(fecha ? "Fecha de realización actualizada." : "Se restableció la fecha de creación.");
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "No se pudo guardar la fecha.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="sts-card p-4 lg:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-slate-700">
          <CalendarCheck className="h-4 w-4 text-muted-foreground" />
          {titulo}
        </h2>
        {usaDefecto ? (
          <span className="rounded-full border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground">
            Por defecto: fecha de creación
          </span>
        ) : (
          <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">
            Ajustada manualmente
          </span>
        )}
      </div>

      <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
        Es la fecha con la que este caso cuenta en los reportes del mes. Si el trabajo se hizo un día y
        se cargó o se cerró otro, corrígela aquí.
      </p>

      {canManage ? (
        <>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="min-w-[180px]">
              <label className="text-[11px] text-muted-foreground">Se realizó el</label>
              <input
                type="date"
                className="h-9 w-full rounded-md border px-2 text-sm focus-visible:outline-none"
                value={value}
                max={performedDateInputValue(new Date())}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="sts-btn-primary text-sm disabled:opacity-60"
              disabled={saving || !value || !cambiado}
              onClick={() => guardar(value)}
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
            {!usaDefecto ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm disabled:opacity-60"
                disabled={saving}
                onClick={() => guardar(null)}
                title={`Volver a la fecha de creación (${porDefecto.split("-").reverse().join("/")})`}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Usar la de creación
              </button>
            ) : null}
          </div>
          {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
          {msg ? <p className="mt-2 text-xs text-green-700">{msg}</p> : null}
        </>
      ) : (
        <p className="mt-3 text-sm font-medium text-slate-700">
          {actual.split("-").reverse().join("/")}
        </p>
      )}
    </section>
  );
}
