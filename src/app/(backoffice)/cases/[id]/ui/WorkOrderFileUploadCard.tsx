"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type Props = {
  workOrderId: string;
  currentFilePath?: string | null;
  currentFileName?: string | null;
};

export default function WorkOrderFileUploadCard({
  workOrderId,
  currentFilePath,
  currentFileName,
}: Props) {
  const router = useRouter();
  const [file, setFile] = React.useState<File | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  async function onUpload() {
    if (!file || saving) return;
    setSaving(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.set("file", file);

      const res = await fetch(`/api/work-orders/${workOrderId}/order-file`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "No se pudo cargar el archivo");

      setFile(null);
      setMsg("Archivo cargado correctamente.");
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "No se pudo cargar el archivo");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="sts-card p-3">
      <p className="text-xs text-muted-foreground">Archivo de orden de trabajo</p>

      {currentFilePath ? (
        <a
          className="mt-1 inline-block text-sm underline"
          href={`/api/uploads/${currentFilePath}`}
          target="_blank"
          rel="noreferrer"
        >
          {currentFileName?.trim() || "Abrir archivo OT"}
        </a>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">Sin archivo cargado.</p>
      )}

      <div className="mt-3 space-y-2">
        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-xs"
        />
        <button
          type="button"
          onClick={onUpload}
          disabled={!file || saving}
          className="inline-flex h-9 w-full items-center justify-center rounded-md border px-4 text-sm disabled:opacity-50"
        >
          {saving ? "Cargando..." : "Cargar archivo OT"}
        </button>
      </div>

      {msg ? <p className="mt-2 text-xs text-muted-foreground">{msg}</p> : null}
    </div>
  );
}

