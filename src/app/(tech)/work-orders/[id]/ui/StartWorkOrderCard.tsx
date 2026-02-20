"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, FileText, Upload } from "lucide-react";
import { withPhotoWatermark } from "@/lib/photo-watermark-client";

type Props = {
  workOrderId: string;
  disabled: boolean;
  startedAt: string | null;
  embedded?: boolean;
  watermarkContext?: {
    equipmentLabel?: string | null;
    busCode?: string | null;
    caseRef?: string | null;
  };
};

export default function StartWorkOrderCard({
  workOrderId,
  disabled,
  startedAt,
  embedded = false,
  watermarkContext,
}: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  async function submit() {
    setSaving(true);
    setError(null);

    try {
      const fd = new FormData();
      fd.set("notes", notes);
      if (photo) {
        const photoWithWatermark = await withPhotoWatermark(photo, {
          equipmentLabel: watermarkContext?.equipmentLabel || "Evidencia de inicio OT",
          busCode: watermarkContext?.busCode || null,
          caseRef: watermarkContext?.caseRef || null,
        });
        fd.set("photo", photoWithWatermark);
      }

      const res = await fetch(`/api/work-orders/${workOrderId}/start`, {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `${res.status} ${res.statusText}`);
      }

      setNotes("");
      setPhoto(null);
      setFileName("");
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Error iniciando OT");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={embedded ? "space-y-4" : "sts-card border-2 border-border/60 p-5"}>
      {!embedded ? (
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Iniciar OT</h2>
          {startedAt ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Iniciada
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
              <AlertCircle className="h-3.5 w-3.5" />
              Pendiente
            </span>
          )}
        </div>
      ) : null}

      {startedAt ? <p className="mt-2 text-sm text-muted-foreground">Iniciada: {startedAt}</p> : null}
      {!startedAt ? <p className="mt-2 text-sm text-muted-foreground">Registra nota y evidencia de inicio.</p> : null}

      {error ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3">
        <textarea
          className="app-field-control min-h-[88px] w-full rounded-xl border p-3 text-sm focus-visible:outline-none"
          placeholder="Notas de inicio..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={disabled || saving}
        />

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Evidencia inicial</p>
          <div className="rounded-xl border-2 border-dashed border-primary/35 bg-primary/5 p-4">
            <label
              htmlFor={inputId}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 text-center ${disabled || saving ? "pointer-events-none opacity-60" : ""}`}
            >
              <Upload className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium text-primary">Cargar foto o archivo</span>
              <span className="text-xs text-primary/80">Evidencia de inicio</span>
            </label>
          </div>
          <input
            id={inputId}
            type="file"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              setPhoto(file);
              setFileName(file?.name ?? "");
            }}
            disabled={disabled || saving}
          />
          {fileName ? (
            <p className="flex items-center gap-1 break-all text-xs text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              {fileName}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Sin foto o archivo seleccionado.</p>
          )}
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={disabled || saving || !notes.trim() || !photo}
          className="sts-btn-primary text-sm disabled:opacity-60"
        >
          {saving ? "Guardando..." : "Iniciar"}
        </button>

        {disabled ? (
          <p className="text-xs text-muted-foreground">
            No disponible si ya fue iniciada o finalizada.
          </p>
        ) : null}
      </div>
    </section>
  );
}
