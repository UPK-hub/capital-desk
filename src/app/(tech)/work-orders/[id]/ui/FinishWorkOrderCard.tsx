"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, FileText, Upload } from "lucide-react";
import { withPhotoWatermarkMany } from "@/lib/photo-watermark-client";

type FinishAutoContent = {
  catalogCode: string;
  reportedNovelty?: string | null;
  quickSolvedResponse?: string | null;
  requiresOtResponse?: string | null;
  standardObservation?: string | null;
  startedAtIso?: string | null;
  busCode?: string | null;
  busPlate?: string | null;
  caseRef?: string | null;
};

type Props = {
  workOrderId: string;
  disabled: boolean;
  finishedAt: string | null;
  blockingReason: string | null;
  caseType?: "PREVENTIVO" | "CORRECTIVO" | string;
  equipmentOptions?: Array<{ id: string; label: string }>;
  embedded?: boolean;
  watermarkContext?: {
    equipmentLabel?: string | null;
    busCode?: string | null;
    caseRef?: string | null;
  };
  autoContent?: FinishAutoContent | null;
};

function formatBogotaDateTime(date: Date) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(date);
}

function minutesSince(startedAtIso: string | null | undefined) {
  if (!startedAtIso) return null;
  const startedAtMs = Date.parse(startedAtIso);
  if (!Number.isFinite(startedAtMs)) return null;
  return Math.max(0, Math.floor((Date.now() - startedAtMs) / 60000));
}

function applyTemplate(
  text: string,
  context: { bus: string; dateTime: string; caseRef: string; code: string; novelty: string }
) {
  if (!text.trim()) return "";
  return text
    .replace(/\{BUS\}/gi, context.bus)
    .replace(/\{FECHA_HORA\}/gi, context.dateTime)
    .replace(/\{CASE_REF\}/gi, context.caseRef)
    .replace(/\{CASO\}/gi, context.caseRef)
    .replace(/\{CODIGO\}/gi, context.code)
    .replace(/\{NOVEDAD\}/gi, context.novelty);
}

function buildAutoNotes(autoContent: FinishAutoContent | null | undefined) {
  if (!autoContent) return { text: "", elapsedMinutes: null as number | null, quickSolved: false };

  const elapsedMinutes = minutesSince(autoContent.startedAtIso);
  const quickSolved = elapsedMinutes !== null ? elapsedMinutes <= 5 : false;
  const selectedTemplate = quickSolved
    ? String(autoContent.quickSolvedResponse ?? "").trim()
    : String(autoContent.requiresOtResponse ?? "").trim();
  const fallbackTemplate = String(autoContent.requiresOtResponse ?? autoContent.quickSolvedResponse ?? "").trim();
  const observationTemplate = String(autoContent.standardObservation ?? "").trim();

  const bus = autoContent.busCode?.trim()
    ? autoContent.busPlate?.trim()
      ? `${autoContent.busCode.trim()} (${autoContent.busPlate.trim()})`
      : autoContent.busCode.trim()
    : "No disponible";
  const dateTime = formatBogotaDateTime(new Date());
  const caseRef = autoContent.caseRef?.trim() || "N/A";
  const code = autoContent.catalogCode?.trim() || "N/A";
  const novelty = autoContent.reportedNovelty?.trim() || "N/A";

  const main = applyTemplate(selectedTemplate || fallbackTemplate, { bus, dateTime, caseRef, code, novelty });
  const observation = applyTemplate(observationTemplate, { bus, dateTime, caseRef, code, novelty });
  const text = [main, observation].filter(Boolean).join("\n\n").trim();

  return { text, elapsedMinutes, quickSolved };
}

export default function FinishWorkOrderCard({
  workOrderId,
  disabled,
  finishedAt,
  blockingReason,
  caseType,
  equipmentOptions = [],
  embedded = false,
  watermarkContext,
  autoContent = null,
}: Props) {
  const router = useRouter();
  const autoNotes = buildAutoNotes(autoContent);
  const [notes, setNotes] = useState(autoNotes.text);
  const [notesTouched, setNotesTouched] = useState(false);
  const [evidences, setEvidences] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsPreventive, setNeedsPreventive] = useState(false);
  const [preventiveMessage, setPreventiveMessage] = useState<string | null>(null);
  const [createCorrective, setCreateCorrective] = useState(false);
  const [selectedEquipments, setSelectedEquipments] = useState<string[]>([]);
  const inputId = useId();

  useEffect(() => {
    if (!autoContent || notesTouched || finishedAt) return;

    const syncSuggestion = () => {
      const next = buildAutoNotes(autoContent).text;
      if (!next) return;
      setNotes(next);
    };

    syncSuggestion();
    const timer = window.setInterval(syncSuggestion, 60_000);
    return () => window.clearInterval(timer);
  }, [autoContent, notesTouched, finishedAt]);

  async function submit(opts?: { forcePreventive?: boolean }) {
    setSaving(true);
    setError(null);

    try {
      const fd = new FormData();
      fd.set("notes", notes);
      const stamped = await withPhotoWatermarkMany(evidences, {
        equipmentLabel: watermarkContext?.equipmentLabel || "Evidencia de cierre OT",
        busCode: watermarkContext?.busCode || null,
        caseRef: watermarkContext?.caseRef || null,
      });
      for (const file of stamped) fd.append("evidences", file);
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
      setEvidences([]);
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
          onChange={(e) => {
            setNotes(e.target.value);
            setNotesTouched(true);
          }}
          disabled={disabled || saving}
        />
        {autoNotes.text && !finishedAt ? (
          <p className="text-xs text-muted-foreground">
            Autocompletado por {autoContent?.catalogCode || "catálogo"}{" "}
            {autoNotes.elapsedMinutes !== null
              ? autoNotes.quickSolved
                ? `(<=5 min, ${autoNotes.elapsedMinutes} min).`
                : `(>5 min, ${autoNotes.elapsedMinutes} min).`
              : "(sin tiempo de inicio)."}
            {notesTouched ? " Editaste el texto sugerido." : ""}
          </p>
        ) : null}

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Evidencias finales</p>
          <div className="rounded-xl border-2 border-dashed border-primary/35 bg-primary/5 p-4">
            <label
              htmlFor={inputId}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 text-center ${disabled || saving ? "pointer-events-none opacity-60" : ""}`}
            >
              <Upload className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium text-primary">Cargar foto o archivo</span>
              <span className="text-xs text-primary/80">Evidencias de cierre (múltiples)</span>
            </label>
          </div>
          <input
            id={inputId}
            type="file"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
            multiple
            className="sr-only"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              setEvidences(files);
            }}
            disabled={disabled || saving}
          />
          {evidences.length ? (
            <div className="space-y-1">
              {evidences.map((file, idx) => (
                <p key={`${file.name}-${idx}`} className="flex items-center gap-1 break-all text-xs text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" />
                  {file.name}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Sin fotos o archivos seleccionados.</p>
          )}
        </div>

        <button
          type="button"
          onClick={() => submit()}
          disabled={
            disabled ||
            saving ||
            !notes.trim() ||
            evidences.length === 0 ||
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
