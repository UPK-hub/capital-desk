"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type PriorityOption = "BAJA" | "MEDIA" | "ALTA";
type AffectedEquipmentType = "NVR" | "CAMARAS" | "ROUTER_SIM" | "SWITCH_POE" | "GPS" | "CMS";

const AFFECTED_EQUIPMENT_OPTIONS: Array<{ value: AffectedEquipmentType; label: string }> = [
  { value: "NVR", label: "NVR / Grabador" },
  { value: "CAMARAS", label: "Cámaras" },
  { value: "ROUTER_SIM", label: "Router / SIM (comunicaciones)" },
  { value: "SWITCH_POE", label: "Switch PoE" },
  { value: "GPS", label: "GPS" },
  { value: "CMS", label: "Centro de Gestión (CMS)" },
];

const NOVEDAD_OPTIONS_BY_EQUIPMENT: Record<AffectedEquipmentType, string[]> = {
  NVR: ["NVR no enciende", "NVR sin grabación", "NVR con falla de disco", "NVR reiniciando"],
  CAMARAS: ["Sin imagen", "Cámara borrosa", "Cámara con mancha", "Cámara desconectada"],
  ROUTER_SIM: ["Bus no reporta", "Sin datos de comunicación", "SIM sin servicio", "Intermitencia de enlace"],
  SWITCH_POE: ["Sin alimentación PoE", "Puerto sin enlace", "Switch sin energía", "Switch intermitente"],
  GPS: ["Sin posición GPS", "Posición errática", "GPS desconectado", "Sin actualización de ubicación"],
  CMS: ["Bus no visible en CMS", "Evento no registrado en CMS", "Datos incompletos en CMS", "Sin sincronización CMS"],
};

type NovedadCatalogOption = {
  code: string;
  novelty: string;
  affectedEquipment: AffectedEquipmentType;
  priorityValue: number;
  priorityLabel: string;
  minimalEvidence: string;
  impact: string;
};

function normalizeAffectedEquipment(value: string): AffectedEquipmentType | "" {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  if (normalized === "NVR") return "NVR";
  if (normalized === "CAMARAS") return "CAMARAS";
  if (normalized === "ROUTER_SIM") return "ROUTER_SIM";
  if (normalized === "SWITCH_POE") return "SWITCH_POE";
  if (normalized === "GPS") return "GPS";
  if (normalized === "CMS") return "CMS";
  return "";
}

function mapCatalogPriorityToOption(priorityValue: number): PriorityOption {
  if (priorityValue <= 2) return "ALTA";
  if (priorityValue >= 4) return "BAJA";
  return "MEDIA";
}

type Props = {
  caseId: string;
  canEdit: boolean;
  batchRef: string | null;
  initialPriority?: number | null;
  catalogCode: string;
  affectedEquipment: string;
  reportedNovelty: string;
  affectation: string;
  observations: string;
  evidencePath: string | null;
  evidenceName: string | null;
  relatedCorrectiveCaseId?: string | null;
  relatedWorkOrderId?: string | null;
};

export default function NovedadTraceCard(props: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [catalogCode, setCatalogCode] = useState(props.catalogCode);
  const [affectedEquipment, setAffectedEquipment] = useState<AffectedEquipmentType | "">(
    normalizeAffectedEquipment(props.affectedEquipment)
  );
  const [priority, setPriority] = useState<PriorityOption>(
    mapCatalogPriorityToOption(Number(props.initialPriority ?? 3) || 3)
  );
  const [reportedNovelty, setReportedNovelty] = useState(props.reportedNovelty);
  const [affectation, setAffectation] = useState(props.affectation);
  const [observations, setObservations] = useState(props.observations);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [novedadCatalog, setNovedadCatalog] = useState<NovedadCatalogOption[]>([]);
  const [activateCorrectiveOt, setActivateCorrectiveOt] = useState(false);
  const [activatedCorrectiveCaseId, setActivatedCorrectiveCaseId] = useState<string | null>(
    props.relatedCorrectiveCaseId ?? null
  );
  const [activatedWorkOrderId, setActivatedWorkOrderId] = useState<string | null>(
    props.relatedWorkOrderId ?? null
  );

  const catalogByEquipment = useMemo(() => {
    const grouped: Partial<Record<AffectedEquipmentType, NovedadCatalogOption[]>> = {};
    for (const item of novedadCatalog) {
      if (!grouped[item.affectedEquipment]) grouped[item.affectedEquipment] = [];
      grouped[item.affectedEquipment]!.push(item);
    }
    return grouped;
  }, [novedadCatalog]);

  const equipmentCatalog = affectedEquipment ? catalogByEquipment[affectedEquipment] ?? [] : [];
  const fallbackOptions = affectedEquipment ? NOVEDAD_OPTIONS_BY_EQUIPMENT[affectedEquipment] : [];
  const selectedCatalog = equipmentCatalog.find((entry) => entry.code === catalogCode) ?? null;
  const noveltySelectValue = equipmentCatalog.length ? catalogCode : reportedNovelty;

  useEffect(() => {
    let cancelled = false;
    async function loadCatalog() {
      try {
        const res = await fetch("/api/novedades/catalog", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !Array.isArray(data?.items) || cancelled) return;
        setNovedadCatalog(
          data.items.map((item: any) => ({
            code: String(item.code ?? ""),
            novelty: String(item.novelty ?? ""),
            affectedEquipment: item.affectedEquipment as AffectedEquipmentType,
            priorityValue: Number(item.priorityValue ?? 3) || 3,
            priorityLabel: String(item.priorityLabel ?? ""),
            minimalEvidence: String(item.minimalEvidence ?? ""),
            impact: String(item.impact ?? ""),
          }))
        );
      } catch {
        // keep fallback local options
      }
    }
    void loadCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSave(options?: { activateCorrectiveOt?: boolean }) {
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("catalogCode", catalogCode);
      fd.set("affectedEquipment", affectedEquipment);
      fd.set("priority", priority);
      fd.set("reportedNovelty", reportedNovelty);
      fd.set("affectation", affectation);
      fd.set("observations", observations);
      const shouldActivate = options?.activateCorrectiveOt ?? activateCorrectiveOt;
      fd.set("activateCorrectiveOt", shouldActivate ? "1" : "0");
      if (props.batchRef) fd.set("batchRef", props.batchRef);
      if (evidenceFile) fd.set("evidence", evidenceFile);

      const res = await fetch(`/api/cases/${props.caseId}/novedad`, {
        method: "PATCH",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "No se pudo actualizar la novedad.");

      if (typeof data?.activatedCorrectiveCaseId === "string" && data.activatedCorrectiveCaseId) {
        setActivatedCorrectiveCaseId(data.activatedCorrectiveCaseId);
      }
      if (typeof data?.activatedWorkOrderId === "string" && data.activatedWorkOrderId) {
        setActivatedWorkOrderId(data.activatedWorkOrderId);
      }

      setEditing(false);
      setEvidenceFile(null);
      setActivateCorrectiveOt(false);
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "No se pudo actualizar la novedad.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="sts-card p-5">
      <h2 className="text-base font-semibold">Novedad reportada</h2>
      <div className="mt-3 space-y-2">
        <div className="sts-card p-3">
          <p className="text-xs text-muted-foreground">ID lote</p>
          <p className="mt-1 text-sm font-medium">{props.batchRef ?? "-"}</p>
        </div>
        <div className="sts-card p-3">
          <p className="text-xs text-muted-foreground">Código catálogo</p>
          <p className="mt-1 text-sm font-medium">{catalogCode || "-"}</p>
        </div>

        {editing ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Equipo afectado</label>
              <select
                value={affectedEquipment}
                onChange={(e) => {
                  setAffectedEquipment(e.target.value as AffectedEquipmentType | "");
                  setCatalogCode("");
                  setReportedNovelty("");
                }}
                className="app-field-control mt-1 h-10 w-full rounded-xl border px-3 text-sm"
              >
                <option value="">Seleccionar equipo</option>
                {AFFECTED_EQUIPMENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Prioridad</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as PriorityOption)}
                className="app-field-control mt-1 h-10 w-full rounded-xl border px-3 text-sm"
              >
                <option value="BAJA">Baja</option>
                <option value="MEDIA">Media</option>
                <option value="ALTA">Alta</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Novedad (catálogo)</label>
              <select
                value={noveltySelectValue}
                onChange={(e) => {
                  const value = e.target.value;
                  if (!value) {
                    setCatalogCode("");
                    setReportedNovelty("");
                    return;
                  }

                  if (equipmentCatalog.length) {
                    const selected = equipmentCatalog.find((entry) => entry.code === value);
                    if (selected) {
                      setCatalogCode(selected.code);
                      setReportedNovelty(selected.novelty);
                      setPriority(mapCatalogPriorityToOption(selected.priorityValue));
                      return;
                    }
                  }

                  setCatalogCode("");
                  setReportedNovelty(value);
                }}
                disabled={!affectedEquipment}
                className="app-field-control mt-1 h-10 w-full rounded-xl border px-3 text-sm"
              >
                <option value="">
                  {affectedEquipment ? "Seleccionar tipo de novedad" : "Primero selecciona equipo"}
                </option>
                {equipmentCatalog.length
                  ? equipmentCatalog.map((entry) => (
                      <option key={entry.code} value={entry.code}>
                        {entry.code} · {entry.novelty}
                      </option>
                    ))
                  : fallbackOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Código catálogo</label>
              <input
                value={catalogCode}
                readOnly
                placeholder="Se completa al elegir del catálogo"
                className="app-field-control mt-1 h-10 w-full rounded-xl border px-3 text-sm"
              />
            </div>

            {selectedCatalog ? (
              <div className="rounded-lg bg-muted/20 p-2 text-xs text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">Impacto sugerido:</span>{" "}
                  {selectedCatalog.impact || "No especificado"}
                </p>
                <p>
                  <span className="font-medium text-foreground">Evidencia mínima:</span>{" "}
                  {selectedCatalog.minimalEvidence || "No especificada"}
                </p>
              </div>
            ) : null}

            <div>
              <label className="text-xs text-muted-foreground">Novedad reportada</label>
              <input
                value={reportedNovelty}
                onChange={(e) => setReportedNovelty(e.target.value)}
                className="app-field-control mt-1 h-10 w-full rounded-xl border px-3 text-sm"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Afectación</label>
              <textarea
                value={affectation}
                onChange={(e) => setAffectation(e.target.value)}
                rows={3}
                className="app-field-control mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Observaciones</label>
              <textarea
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                rows={2}
                className="app-field-control mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Adjuntar evidencia (opcional)</label>
              <input
                type="file"
                accept="image/*,application/pdf"
                className="mt-1 block w-full text-xs"
                onChange={(e) => setEvidenceFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <label className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/20 p-2 text-xs">
              <input
                type="checkbox"
                checked={activateCorrectiveOt}
                onChange={(e) => setActivateCorrectiveOt(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Activar OT correctiva: pasa de "por validar coordinador" a flujo operativo (caso
                + ticket quedan en ejecución).
              </span>
            </label>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void onSave();
                }}
                disabled={saving}
                className="inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm disabled:opacity-50"
              >
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setError(null);
                  setEvidenceFile(null);
                  setActivateCorrectiveOt(false);
                }}
                className="inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="sts-card p-3">
              <p className="text-xs text-muted-foreground">Equipo afectado</p>
              <p className="mt-1 text-sm font-medium">
                {affectedEquipment || props.affectedEquipment || "-"}
              </p>
            </div>
            <div className="sts-card p-3">
              <p className="text-xs text-muted-foreground">Novedad reportada</p>
              <p className="mt-1 text-sm font-medium">{reportedNovelty || "-"}</p>
            </div>
            <div className="sts-card p-3">
              <p className="text-xs text-muted-foreground">Afectación</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{affectation || "-"}</p>
            </div>
            <div className="sts-card p-3">
              <p className="text-xs text-muted-foreground">Observaciones</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{observations || "-"}</p>
            </div>
          </div>
        )}

        {props.evidencePath ? (
          <a
            href={`/api/uploads/${props.evidencePath}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-full items-center justify-center rounded-md border px-4 py-2 text-sm"
          >
            {props.evidenceName?.trim() || "Abrir evidencia de novedad"}
          </a>
        ) : (
          <p className="text-xs text-muted-foreground">Sin evidencia adjunta.</p>
        )}

        {props.batchRef ? (
          <a
            href={`/novedades?batchRef=${encodeURIComponent(props.batchRef)}`}
            className="inline-flex w-full items-center justify-center rounded-md border px-4 py-2 text-sm"
          >
            Ver lote de novedad
          </a>
        ) : null}

        {(activatedCorrectiveCaseId || props.relatedCorrectiveCaseId) ? (
          <a
            href={`/cases/${activatedCorrectiveCaseId ?? props.relatedCorrectiveCaseId}`}
            className="inline-flex w-full items-center justify-center rounded-md border px-4 py-2 text-sm"
          >
            Ver caso correctivo
          </a>
        ) : null}

        {(activatedWorkOrderId || props.relatedWorkOrderId) ? (
          <a
            href={`/work-orders/${activatedWorkOrderId ?? props.relatedWorkOrderId}`}
            className="inline-flex w-full items-center justify-center rounded-md border px-4 py-2 text-sm"
          >
            Ver OT correctiva
          </a>
        ) : null}

        {props.canEdit && !editing ? (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex w-full items-center justify-center rounded-md border px-4 py-2 text-sm"
            >
              Reclasificar novedad
            </button>
            <button
              type="button"
              onClick={async () => {
                await onSave({ activateCorrectiveOt: true });
              }}
              disabled={saving}
              className="inline-flex w-full items-center justify-center rounded-md border px-4 py-2 text-sm disabled:opacity-60"
            >
              Activar OT correctiva
            </button>
          </div>
        ) : null}

        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
    </section>
  );
}
