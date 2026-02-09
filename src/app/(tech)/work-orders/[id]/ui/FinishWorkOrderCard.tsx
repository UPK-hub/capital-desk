"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  workOrderId: string;
  disabled: boolean;
  finishedAt: string | null;
  blockingReason: string | null;
  caseType?: "PREVENTIVO" | "CORRECTIVO" | string;
  equipmentOptions?: Array<{ id: string; label: string }>;
};

export default function FinishWorkOrderCard({
  workOrderId,
  disabled,
  finishedAt,
  blockingReason,
  caseType,
  equipmentOptions = [],
}: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [fileName, setFileName] = useState("Ningun archivo seleccionado");
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
      setFileName("Ningun archivo seleccionado");
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
    <section className="sts-card p-5">
      <h2 className="text-base font-semibold">Finalizar OT</h2>

      {finishedAt ? (
        <p className="mt-2 text-sm text-muted-foreground">Finalizada: {finishedAt}</p>
      ) : blockingReason ? (
        <p className="mt-2 text-sm text-amber-700">{blockingReason}</p>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Registra nota y evidencia de finalización.</p>
      )}

      {error ? (
        <div className="mt-3 sts-card p-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      ) : null}

      {needsPreventive ? (
        <div className="mt-3 sts-card p-3">
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
              className="rounded-md border px-3 py-2 text-sm"
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
          <div className="sts-card p-3">
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
          className="min-h-[90px] w-full rounded-xl border border-zinc-200/70 bg-white/90 p-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
          placeholder="Notas de finalización..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={disabled || saving}
        />

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Evidencia</p>
          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor={inputId}
              className={`sts-btn-ghost text-sm ${disabled || saving ? "opacity-60 pointer-events-none" : ""}`}
            >
              Seleccionar archivo
            </label>
            <span className="text-xs text-muted-foreground">{fileName}</span>
          </div>
          <input
            id={inputId}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              setPhoto(file);
              setFileName(file?.name ?? "Ningun archivo seleccionado");
            }}
            disabled={disabled || saving}
          />
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={
            disabled ||
            saving ||
            !notes.trim() ||
            !photo ||
            (caseType === "PREVENTIVO" && createCorrective && selectedEquipments.length === 0)
          }
          className="sts-btn-primary text-sm disabled:opacity-60"
        >
          {saving ? "Guardando..." : "Finalizar"}
        </button>
      </div>
    </section>
  );
}
