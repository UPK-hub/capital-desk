"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";

/**
 * Edicion inline del titulo del caso, integrada en el encabezado del detalle.
 * Solo se renderiza el lapiz "Editar" cuando canEdit = true (lo decide el server).
 * Llama a PATCH /api/cases/[id] con { title } y refresca la pagina.
 */
export default function EditCaseTitleCard({
  caseId,
  initialTitle,
  canEdit = false,
}: {
  caseId: string;
  initialTitle: string;
  canEdit?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(initialTitle);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Mantener el valor sincronizado si cambia el titulo desde el server.
  React.useEffect(() => {
    if (!editing) setValue(initialTitle);
  }, [initialTitle, editing]);

  React.useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function startEdit() {
    setValue(initialTitle);
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError(null);
    setValue(initialTitle);
  }

  async function save() {
    const next = value.trim();
    if (next.length < 3) {
      setError("El titulo debe tener al menos 3 caracteres.");
      return;
    }
    if (next === initialTitle) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "No se pudo actualizar el titulo");
      setEditing(false);
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "No se pudo actualizar el titulo");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-start gap-2">
        <h1 className="break-words text-2xl font-semibold leading-tight text-slate-900 lg:text-[2.2rem]">
          {initialTitle}
        </h1>
        {canEdit ? (
          <button
            type="button"
            onClick={startEdit}
            title="Editar titulo"
            aria-label="Editar titulo"
            className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
          >
            <Pencil className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") cancel();
        }}
        disabled={saving}
        className="h-11 w-full rounded-md border px-3 text-xl font-semibold focus-visible:outline-none lg:text-2xl"
        placeholder="Titulo del caso"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving || value.trim().length < 3}
          className="sts-btn-primary text-sm disabled:opacity-60"
        >
          {saving ? "Guardando..." : "Guardar"}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={saving}
          className="sts-btn-ghost text-sm disabled:opacity-60"
        >
          Cancelar
        </button>
        {error ? <span className="text-xs text-red-600">{error}</span> : null}
      </div>
    </div>
  );
}
