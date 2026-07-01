"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, FileText, Upload } from "lucide-react";
import { withPhotoWatermark } from "@/lib/photo-watermark-client";

type Props = {
  workOrderId: string;
  disabled: boolean;
  startedAt: string | null;
  startEvidencePath?: string | null;
  embedded?: boolean;
  quickVerificationPreset?: {
    required: boolean;
    catalogCode: string;
    affectedEquipment: string;
    reportedNovelty: string;
    quickCheck: string;
    minimalEvidence: string;
    impact: string;
    quickSteps: Array<{ id: string; label: string }>;
    requiredEvidence: Array<{ id: string; label: string; required: boolean }>;
  } | null;
  watermarkContext?: {
    equipmentLabel?: string | null;
    busCode?: string | null;
    caseRef?: string | null;
  };
};

function normalizeStoredUploadPath(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const marker = "/api/uploads/";
  const markerIdx = raw.indexOf(marker);
  if (markerIdx >= 0) {
    return raw
      .slice(markerIdx + marker.length)
      .replace(/^\/+/, "")
      .replace(/^uploads\//i, "")
      .replace(/\\/g, "/");
  }
  try {
    const u = new URL(raw);
    const pathname = String(u.pathname ?? "");
    const idx = pathname.indexOf(marker);
    if (idx >= 0) {
      return pathname
        .slice(idx + marker.length)
        .replace(/^\/+/, "")
        .replace(/^uploads\//i, "")
        .replace(/\\/g, "/");
    }
    return pathname
      .replace(/^\/+/, "")
      .replace(/^uploads\//i, "")
      .replace(/\\/g, "/");
  } catch {
    return raw
      .replace(/^\/+/, "")
      .replace(/^api\/uploads\//i, "")
      .replace(/^uploads\//i, "")
      .replace(/\\/g, "/");
  }
}

function toUploadUrl(path: string | null | undefined) {
  const rel = normalizeStoredUploadPath(path);
  return rel ? `/api/uploads/${rel}` : "";
}

function isImageUploadPath(path: string | null | undefined) {
  const rel = normalizeStoredUploadPath(path).toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(rel);
}

export default function StartWorkOrderCard({
  workOrderId,
  disabled,
  startedAt,
  startEvidencePath = null,
  embedded = false,
  quickVerificationPreset = null,
  watermarkContext,
}: Props) {
  const router = useRouter();
  const defaultStartNote = `Inicio de ${String(watermarkContext?.caseRef ?? "").trim() || "caso"} del ID bus (${String(
    watermarkContext?.busCode ?? ""
  ).trim() || "sin bus"})`;
  const isUpdateMode = Boolean(startedAt);
  const [notes, setNotes] = useState(defaultStartNote);
  const [photo, setPhoto] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quickResult, setQuickResult] = useState<"" | "CONFIRMADA" | "DESCARTADA" | "REQUIERE_REVISION">("");
  const [quickNotes, setQuickNotes] = useState("");
  const [quickAction, setQuickAction] = useState("");
  const [quickChecklist, setQuickChecklist] = useState<Array<{ id: string; label: string; done: boolean }>>(
    () =>
      (quickVerificationPreset?.quickSteps ?? []).map((step) => ({
        id: step.id,
        label: step.label,
        done: false,
      }))
  );
  const [quickEvidence, setQuickEvidence] = useState<
    Array<{
      key: string;
      label: string;
      required: boolean;
      mode: "photo" | "file";
      file: File | null;
      fileName: string;
    }>
  >(
    () =>
      (quickVerificationPreset?.requiredEvidence ?? []).map((item) => ({
        key: item.id,
        label: item.label,
        required: Boolean(item.required),
        mode: "photo",
        file: null,
        fileName: "",
      }))
  );
  const inputId = useId();
  const localStartPreviewUrl = useMemo(() => {
    if (!photo || !String(photo.type ?? "").toLowerCase().startsWith("image/")) return "";
    return URL.createObjectURL(photo);
  }, [photo]);
  const persistedStartPreviewUrl = isImageUploadPath(startEvidencePath) ? toUploadUrl(startEvidencePath) : "";
  const startPreviewUrl = localStartPreviewUrl || persistedStartPreviewUrl;

  useEffect(() => {
    if (!localStartPreviewUrl) return;
    return () => URL.revokeObjectURL(localStartPreviewUrl);
  }, [localStartPreviewUrl]);

  useEffect(() => {
    setQuickChecklist(
      (quickVerificationPreset?.quickSteps ?? []).map((step) => ({
        id: step.id,
        label: step.label,
        done: false,
      }))
    );
    setQuickEvidence(
      (quickVerificationPreset?.requiredEvidence ?? []).map((item) => ({
        key: item.id,
        label: item.label,
        required: Boolean(item.required),
        mode: "photo" as const,
        file: null,
        fileName: "",
      }))
    );
  }, [quickVerificationPreset]);

  useEffect(() => {
    setNotes((prev) => (prev.trim() ? prev : defaultStartNote));
  }, [defaultStartNote]);

  const requiresQuickVerification = Boolean(quickVerificationPreset?.required);
  const missingQuickSteps = quickChecklist.filter((step) => !step.done);
  const missingQuickEvidence = quickEvidence.filter((item) => item.required && !item.file);
  const hasAnyQuickInput =
    quickResult !== "" ||
    quickNotes.trim().length > 0 ||
    quickAction.trim().length > 0 ||
    quickChecklist.some((step) => step.done) ||
    quickEvidence.some((item) => Boolean(item.file));
  const quickVerificationPayloadReady =
    quickResult !== "" &&
    quickNotes.trim().length >= 5 &&
    missingQuickSteps.length === 0 &&
    missingQuickEvidence.length === 0;

  async function submit() {
    setSaving(true);
    setError(null);

    try {
      const fd = new FormData();
      fd.set("notes", notes);
      if (quickVerificationPreset && quickVerificationPayloadReady) {
        const quickChecklistPayload = quickChecklist.map((step) => ({
          id: step.id,
          label: step.label,
          done: Boolean(step.done),
        }));
        const quickEvidencePayload = quickEvidence.map((item) => ({
          key: item.key,
          label: item.label,
          required: Boolean(item.required),
        }));

        fd.set(
          "quickVerification",
          JSON.stringify({
            result: quickResult || null,
            notes: quickNotes.trim(),
            suggestedAction: quickAction.trim(),
            catalogCode: quickVerificationPreset.catalogCode || null,
            affectedEquipment: quickVerificationPreset.affectedEquipment || null,
            reportedNovelty: quickVerificationPreset.reportedNovelty || null,
            checklist: quickChecklistPayload,
            evidenceItems: quickEvidencePayload,
          })
        );

        for (const item of quickEvidence) {
          if (!item.file) continue;
          let fileToUpload = item.file;
          if (item.file.type.startsWith("image/")) {
            fileToUpload = await withPhotoWatermark(item.file, {
              equipmentLabel: item.label,
              busCode: watermarkContext?.busCode || null,
              caseRef: watermarkContext?.caseRef || null,
            });
          }
          fd.set(`quickEvidence:${item.key}`, fileToUpload);
        }
      }
      if (photo) {
        const startEvidence = photo.type.startsWith("image/")
          ? await withPhotoWatermark(photo, {
              equipmentLabel: watermarkContext?.equipmentLabel || "Evidencia de inicio OT",
              busCode: watermarkContext?.busCode || null,
              caseRef: watermarkContext?.caseRef || null,
            })
          : photo;
        fd.set("photo", startEvidence);
      }

      const res = await fetch(`/api/work-orders/${workOrderId}/start`, {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `${res.status} ${res.statusText}`);
      }

      setNotes(defaultStartNote);
      setPhoto(null);
      setFileName("");
      setQuickResult("");
      setQuickNotes("");
      setQuickAction("");
      setQuickChecklist(
        (quickVerificationPreset?.quickSteps ?? []).map((step) => ({
          id: step.id,
          label: step.label,
          done: false,
        }))
      );
      setQuickEvidence(
        (quickVerificationPreset?.requiredEvidence ?? []).map((item) => ({
          key: item.id,
          label: item.label,
          required: Boolean(item.required),
          mode: "photo" as const,
          file: null,
          fileName: "",
        }))
      );
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
      {!startedAt ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Registra la nota de inicio. La evidencia es opcional.
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Puedes actualizar la nota y volver a cargar la evidencia de inicio.
        </p>
      )}

      {error ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3">
        {quickVerificationPreset ? (
          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Pre-formulario: verificación rápida
              </p>
              <p className="text-sm font-medium">
                {quickVerificationPreset.reportedNovelty || "Novedad"}{" "}
                {quickVerificationPreset.catalogCode ? `(${quickVerificationPreset.catalogCode})` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                Equipo afectado: {quickVerificationPreset.affectedEquipment || "No especificado"}
              </p>
              {quickVerificationPreset.quickCheck ? (
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                  Verificación sugerida: {quickVerificationPreset.quickCheck}
                </p>
              ) : null}
              {quickVerificationPreset.minimalEvidence ? (
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                  Evidencia mínima: {quickVerificationPreset.minimalEvidence}
                </p>
              ) : null}
              {quickVerificationPreset.impact ? (
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                  Impacto sugerido: {quickVerificationPreset.impact}
                </p>
              ) : null}
            </div>

            {quickChecklist.length ? (
              <div className="mt-3 rounded-lg border border-border/60 bg-background/70 p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Paso a paso (según catálogo)
                </p>
                <div className="mt-2 space-y-2">
                  {quickChecklist.map((step) => (
                    <label
                      key={step.id}
                      className="flex items-start gap-2 rounded-md border border-border/50 px-2 py-2 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={step.done}
                        onChange={(e) =>
                          setQuickChecklist((prev) =>
                            prev.map((item) =>
                              item.id === step.id ? { ...item, done: e.target.checked } : item
                            )
                          )
                        }
                        disabled={disabled || saving}
                        className="mt-0.5"
                      />
                      <span className="leading-relaxed text-foreground">{step.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            {quickEvidence.length ? (
              <div className="mt-3 rounded-lg border border-border/60 bg-background/70 p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Evidencias de verificación rápida
                </p>
                <div className="mt-2 space-y-2">
                  {quickEvidence.map((item) => {
                    const fileInputId = `${inputId}-quick-${item.key}`;
                    return (
                      <div key={item.key} className="rounded-lg border border-border/50 px-2 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-medium leading-relaxed">{item.label}</p>
                          {item.required ? (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                              Obligatoria
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-2 inline-flex rounded-md border border-border/60 bg-muted/30 p-0.5">
                          <button
                            type="button"
                            onClick={() =>
                              setQuickEvidence((prev) =>
                                prev.map((entry) =>
                                  entry.key === item.key ? { ...entry, mode: "photo" } : entry
                                )
                              )
                            }
                            disabled={disabled || saving}
                            className={`rounded px-2 py-1 text-[11px] ${
                              item.mode === "photo"
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground"
                            }`}
                          >
                            Cargar foto
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setQuickEvidence((prev) =>
                                prev.map((entry) =>
                                  entry.key === item.key ? { ...entry, mode: "file" } : entry
                                )
                              )
                            }
                            disabled={disabled || saving}
                            className={`rounded px-2 py-1 text-[11px] ${
                              item.mode === "file"
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground"
                            }`}
                          >
                            Cargar archivo
                          </button>
                        </div>

                        <label
                          htmlFor={fileInputId}
                          className={`mt-2 flex cursor-pointer items-center justify-center rounded-md border-2 border-dashed border-primary/35 bg-primary/5 px-2 py-2 text-xs font-medium text-primary ${disabled || saving ? "pointer-events-none opacity-60" : ""}`}
                        >
                          {item.mode === "photo" ? "Tomar/cargar foto" : "Seleccionar archivo"}
                        </label>
                        <input
                          id={fileInputId}
                          type="file"
                          accept={
                            item.mode === "photo"
                              ? "image/*"
                              : "image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
                          }
                          capture={item.mode === "photo" ? "environment" : undefined}
                          className="sr-only"
                          onChange={(e) => {
                            const selectedFile = e.target.files?.[0] ?? null;
                            setQuickEvidence((prev) =>
                              prev.map((entry) =>
                                entry.key === item.key
                                  ? {
                                      ...entry,
                                      file: selectedFile,
                                      fileName: selectedFile?.name ?? "",
                                    }
                                  : entry
                              )
                            );
                          }}
                          disabled={disabled || saving}
                        />

                        {item.fileName ? (
                          <p className="mt-1 flex items-center gap-1 break-all text-[11px] text-muted-foreground">
                            <FileText className="h-3.5 w-3.5" />
                            {item.fileName}
                          </p>
                        ) : (
                          <p className="mt-1 text-[11px] text-muted-foreground">Sin archivo.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="mt-3 grid gap-3">
              <label className="text-xs text-muted-foreground">
                Resultado verificación rápida {requiresQuickVerification ? "(obligatorio)" : "(opcional)"}
              </label>
              <select
                className="app-field-control h-10 w-full rounded-xl border px-3 text-sm"
                value={quickResult}
                onChange={(e) => setQuickResult(e.target.value as any)}
                disabled={disabled || saving}
              >
                <option value="">Seleccionar resultado</option>
                <option value="CONFIRMADA">Confirmada</option>
                <option value="DESCARTADA">Descartada</option>
                <option value="REQUIERE_REVISION">Requiere revisión adicional</option>
              </select>

              <textarea
                className="app-field-control min-h-[72px] w-full rounded-xl border p-3 text-sm focus-visible:outline-none"
                placeholder="Observaciones de verificación rápida (mínimo 5 caracteres)"
                value={quickNotes}
                onChange={(e) => setQuickNotes(e.target.value)}
                disabled={disabled || saving}
              />

              <input
                className="app-field-control h-10 w-full rounded-xl border px-3 text-sm"
                placeholder="Acción sugerida (opcional)"
                value={quickAction}
                onChange={(e) => setQuickAction(e.target.value)}
                disabled={disabled || saving}
              />

              {requiresQuickVerification && missingQuickSteps.length > 0 ? (
                <p className="text-xs text-amber-700">
                  Si deseas guardar la verificación rápida, completa todos los pasos.
                </p>
              ) : null}

              {requiresQuickVerification && missingQuickEvidence.length > 0 ? (
                <p className="text-xs text-amber-700">
                  Si deseas guardar la verificación rápida, adjunta las evidencias obligatorias.
                </p>
              ) : null}

              {quickVerificationPreset && !hasAnyQuickInput ? (
                <p className="text-xs text-muted-foreground">
                  Puedes iniciar la OT sin este pre-formulario y continuar con el flujo correctivo normal.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

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
              <span className="text-xs text-primary/80">Evidencia de inicio (opcional)</span>
            </label>
          </div>
          <input
            id={inputId}
            type="file"
            accept="*/*"
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
          {startPreviewUrl ? (
            <div className="rounded-xl border border-border/70 bg-card p-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium text-muted-foreground">
                  {localStartPreviewUrl ? "Vista previa nueva" : "Última evidencia guardada"}
                </p>
                <a
                  href={startPreviewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] font-medium text-primary underline"
                >
                  Abrir
                </a>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={startPreviewUrl}
                alt="Vista previa evidencia inicio"
                className="h-44 w-full rounded-lg border object-cover"
              />
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={disabled || saving || !notes.trim()}
          className="sts-btn-primary text-sm disabled:opacity-60"
        >
          {saving ? "Guardando..." : isUpdateMode ? "Actualizar inicio" : "Iniciar"}
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
