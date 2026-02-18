"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, FileText, Upload } from "lucide-react";

type Props = {
  workOrderId: string;
  disabled: boolean;
  finishedAt: string | null;
  blockingReason: string | null;
  caseType?: "PREVENTIVO" | "CORRECTIVO" | string;
  equipmentOptions?: Array<{ id: string; label: string }>;
  embedded?: boolean;
};

export default function FinishWorkOrderCard({
  workOrderId,
  disabled,
  finishedAt,
  blockingReason,
  caseType,
  equipmentOptions = [],
  embedded = false,
}: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsPreventive, setNeedsPreventive] = useState(false);
  const [preventiveMessage, setPreventiveMessage] = useState<string | null>(null);
  const [createCorrective, setCreateCorrective] = useState(false);
  const [selectedEquipments, setSelectedEquipments] = useState<string[]>([]);
  const inputId = useId();

  async function submit(opts?: { forcePreventive?: boolean }) {
    setSaving(true);
    setError(null);

    try {
      const fd = new FormData();
      fd.set("notes", notes);
      if (photo) fd.set("photo", photo);
      if (opts?.forcePreventive) fd.set("createPreventive", "true");
      if (caseType === "PREVENTIVO" && createCorrective) {
        fd.set("createCorrective", "true");
        fd.set("correctiveEquipmentIds", JSON.stringify(selectedEquipments));
      }

      const res = await fetch(`/api/work-orders/${workOrderId}/finish`, {
        method: "POST",
        body: fd,
      });

      if (res.status === 409) {
        const data = await res.json().catch(() => ({}));
        setNeedsPreventive(true);
        setPreventiveMessage(
          data?.error ?? "Han pasado 21 días o más desde el último preventivo. ¿Deseas generarlo ahora?"
        );
        return;
      }

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `${res.status} ${res.statusText}`);
      }

      setNotes("");
      setPhoto(null);
      setFileName("");
      setCreateCorrective(false);
      setSelectedEquipments([]);
      setNeedsPreventive(false);
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Error finalizando OT");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={embedded ? "space-y-4" : "sts-card border-2 border-border/60 bg-card p-5"}>
      {!embedded ? (
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Finalizar OT</h2>
          {finishedAt ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Finalizada
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <AlertCircle className="h-3.5 w-3.5" />
              En proceso
            </span>
          )}
        </div>
      ) : null}

      {finishedAt ? (
        <p className="mt-2 text-sm text-muted-foreground">Finalizada: {finishedAt}</p>
      ) : blockingReason ? (
        <p className="mt-2 text-sm font-medium text-amber-800">{blockingReason}</p>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Registra nota y evidencia de finalización.</p>
      )}

      {error ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      ) : null}

      {needsPreventive ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm">{preventiveMessage}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="sts-btn-primary text-sm"
              onClick={() => submit({ forcePreventive: true })}
              disabled={saving}
            >
              Sí, generar preventivo
            </button>
            <button
              type="button"
              className="sts-btn-ghost text-sm"
              onClick={() => setNeedsPreventive(false)}
              disabled={saving}
            >
              No, continuar
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3">
        {caseType === "PREVENTIVO" ? (
          <div className="rounded-lg border border-border/60 bg-card p-3">
            <div className="flex items-center gap-2">
              <input
                id={`${workOrderId}-corrective`}
                type="checkbox"
                checked={createCorrective}
                onChange={(e) => setCreateCorrective(e.target.checked)}
                disabled={disabled || saving}
              />
              <label htmlFor={`${workOrderId}-corrective`} className="text-sm">
                ¿Se realizó mantenimiento correctivo?
              </label>
            </div>

            {createCorrective ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">Selecciona los equipos con correctivo</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {equipmentOptions.map((eq) => (
                    <label key={eq.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedEquipments.includes(eq.id)}
                        onChange={(e) => {
                          setSelectedEquipments((prev) =>
                            e.target.checked ? [...prev, eq.id] : prev.filter((id) => id !== eq.id)
                          );
                        }}
                      />
                      {eq.label}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <textarea
          className="app-field-control min-h-[88px] w-full rounded-xl border p-3 text-sm focus-visible:outline-none"
          placeholder="Notas de finalización..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={disabled || saving}
        />

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Evidencia final</p>
          <div className="rounded-xl border-2 border-dashed border-primary/35 bg-primary/5 p-4">
            <label
              htmlFor={inputId}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 text-center ${disabled || saving ? "pointer-events-none opacity-60" : ""}`}
            >
              <Upload className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium text-primary">Seleccionar archivo</span>
              <span className="text-xs text-primary/80">Evidencia de cierre</span>
            </label>
          </div>
          <input
            id={inputId}
            type="file"
            accept="image/*"
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
            <p className="text-xs text-muted-foreground">Sin archivo seleccionado.</p>
          )}
        </div>

        <button
          type="button"
          onClick={() => submit()}
          disabled={
            disabled ||
            saving ||
            !notes.trim() ||
            !photo ||
            (caseType === "PREVENTIVO" && createCorrective && selectedEquipments.length === 0)
          }
          className="sts-btn-primary w-full text-sm disabled:opacity-60"
        >
          {saving ? "Guardando..." : "Finalizar"}
        </button>
      </div>
    </section>
  );
}
