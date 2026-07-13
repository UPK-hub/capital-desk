"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  createDefaultRvrChecklist,
  createDefaultRvrAspects,
  formatRvrNo,
  normalizeRvrAspects,
  RvrChecklistRow,
  RvrAspects,
  RVR_BUS_ASPECTS,
  RVR_MAX_BUSES_PER_DAY,
} from "@/lib/rvr";

type EligibleBus = {
  id: string;
  code: string;
  plate: string | null;
  nvrIp: string | null;
  lastPreventiveAt: string | null;
  reason?: string | null;
  reasonLabel?: string | null;
  rank?: number;
  detail?: string;
  hasOpenNovedad?: boolean;
};

type CorrectiveQueueItem = {
  busId: string;
  busCode: string;
  busPlate: string | null;
  rank: number;
  reason: string;
  reasonLabel: string;
  detail: string;
  hasOpenNovedad: boolean;
  lastPreventiveAt?: string | null;
};

type EvidenceItem = {
  filePath: string;
  fileName: string;
  mimeType: string;
  size: number;
};

type ReviewBusPayload = {
  id: string;
  busId: string;
  busCode: string;
  busPlate: string | null;
  nvrIp: string | null;
  reviewedAt: string | null;
  generalResult: string;
  relevantFindings: string;
  ticketUpk: string;
  requiresCorrective: boolean;
  capitalbusOt: string;
  checklist: RvrChecklistRow[];
  aspects: RvrAspects;
  evidences: EvidenceItem[];
  priorityReason?: string | null;
  priorityDetail?: string | null;
  priorityRank?: number | null;
  correctiveCaseId: string | null;
  correctiveCaseNo: number | null;
  correctiveWorkOrderId: string | null;
  correctiveWorkOrderNo: number | null;
};

type ReviewPayload = {
  id: string;
  reviewNo?: number | null;
  date: string;
  scheduleWindow: string;
  generalResult: string;
  relevantFindings: string;
  ticketUpk: string;
  requiresCorrective: boolean;
  capitalbusOt: string;
  evidencesNotes: string;
  evidences?: EvidenceItem[];
  status: "DRAFT" | "COMPLETED";
  buses: ReviewBusPayload[];
};

type ApiGetResponse = {
  date: string;
  maxBuses: number;
  eligibleBuses: EligibleBus[];
  correctiveQueue?: CorrectiveQueueItem[];
  hasReview?: boolean;
  review?: ReviewPayload | null;
};

type ObservationCatalogItem = {
  code: string;
  result: string;
  category: string;
  reason: string;
  standardObservation: string;
  suggestedAction: string;
  nextStatus: string;
};

type ObservationCatalogResponse = {
  ok?: boolean;
  error?: string;
  items?: ObservationCatalogItem[];
};

type BusForm = {
  rowId: string | null;
  busId: string;
  busCode: string;
  busPlate: string | null;
  nvrIp: string;
  reviewedAt: string;
  generalResult: string;
  relevantFindings: string;
  ticketUpk: string;
  requiresCorrective: boolean;
  capitalbusOt: string;
  checklist: RvrChecklistRow[];
  aspects: RvrAspects;
  evidences: EvidenceItem[];
  newFiles: File[];
  // Evidencia (imagen) nueva por cámara, pendiente de guardar. Clave = cámara.
  newCamFiles: Record<string, File>;
  priorityReason: string | null;
  priorityDetail: string | null;
  correctiveCaseId: string | null;
  correctiveCaseNo: number | null;
  correctiveWorkOrderId: string | null;
  correctiveWorkOrderNo: number | null;
};

type TopForm = {
  scheduleWindow: string;
  generalResult: string;
  relevantFindings: string;
  ticketUpk: string;
  requiresCorrective: boolean;
  capitalbusOt: string;
  evidencesNotes: string;
  status: "DRAFT" | "COMPLETED";
};

const defaultTopForm = (): TopForm => ({
  scheduleWindow: "2 horas",
  generalResult: "",
  relevantFindings: "",
  ticketUpk: "",
  requiresCorrective: false,
  capitalbusOt: "",
  evidencesNotes: "",
  status: "DRAFT",
});

function todayInputDate() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
}

function fmtDate(value: string | null) {
  if (!value) return "Sin registro";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Sin registro";
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "America/Bogota" }).format(d);
}

function renderObservationTemplate(
  template: string,
  values: {
    busCode: string;
    camera: string;
    code: string;
  }
) {
  const hour = new Intl.DateTimeFormat("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Bogota",
  }).format(new Date());

  const replacements: Record<string, string> = {
    BUS: values.busCode,
    EQUIPO: values.camera,
    CANAL: values.camera,
    COD_NVD: values.code,
    HORA: hour,
    TIEMPO_OFFLINE: "N/A",
  };

  return String(template ?? "").replace(/\{([A-Z_]+)\}/g, (_match, token: string) => {
    return replacements[token] ?? `{${token}}`;
  });
}

function emptyBusForm(bus: EligibleBus): BusForm {
  return {
    rowId: null,
    busId: bus.id,
    busCode: bus.code,
    busPlate: bus.plate,
    nvrIp: bus.nvrIp ?? "",
    reviewedAt: new Date().toISOString(),
    generalResult: "",
    relevantFindings: "",
    ticketUpk: "",
    requiresCorrective: false,
    capitalbusOt: "",
    checklist: createDefaultRvrChecklist(),
    aspects: createDefaultRvrAspects(),
    evidences: [],
    newFiles: [],
    newCamFiles: {},
    priorityReason: bus.reasonLabel ?? null,
    priorityDetail: bus.detail ?? null,
    correctiveCaseId: null,
    correctiveCaseNo: null,
    correctiveWorkOrderId: null,
    correctiveWorkOrderNo: null,
  };
}

function savedBusForm(saved: ReviewBusPayload): BusForm {
  return {
    rowId: saved.id,
    busId: saved.busId,
    busCode: saved.busCode,
    busPlate: saved.busPlate,
    nvrIp: saved.nvrIp ?? "",
    reviewedAt: saved.reviewedAt ?? new Date().toISOString(),
    generalResult: saved.generalResult ?? "",
    relevantFindings: saved.relevantFindings ?? "",
    ticketUpk: saved.ticketUpk ?? "",
    requiresCorrective: saved.requiresCorrective,
    capitalbusOt: saved.capitalbusOt ?? "",
    checklist: saved.checklist?.length ? saved.checklist : createDefaultRvrChecklist(),
    aspects: normalizeRvrAspects(saved.aspects),
    evidences: saved.evidences ?? [],
    newFiles: [],
    newCamFiles: {},
    priorityReason: saved.priorityReason ?? null,
    priorityDetail: saved.priorityDetail ?? null,
    correctiveCaseId: saved.correctiveCaseId,
    correctiveCaseNo: saved.correctiveCaseNo,
    correctiveWorkOrderId: saved.correctiveWorkOrderId,
    correctiveWorkOrderNo: saved.correctiveWorkOrderNo,
  };
}

const REASON_BADGE: Record<string, string> = {
  NO_TRANSMITE: "bg-red-100 text-red-700",
  ALARMA_CAMARA: "bg-orange-100 text-orange-700",
  PREVENTIVO_AYER: "bg-blue-100 text-blue-700",
  PREVENTIVO_10D: "bg-amber-100 text-amber-800",
  RECHECK_15D: "bg-slate-100 text-slate-600",
  NO_REPORTA_CON_FALLA: "bg-red-100 text-red-700",
  ODOMETRO_CERO: "bg-orange-100 text-orange-700",
  COORDENADAS_CERO: "bg-amber-100 text-amber-800",
};

function reasonBadgeClass(reason?: string | null) {
  return REASON_BADGE[String(reason ?? "")] ?? "bg-amber-100 text-amber-800";
}

export default function RvrDailyClient({ userName, initialDate }: { userName: string; initialDate?: string }) {
  const date = initialDate ?? todayInputDate();
  const isToday = date === todayInputDate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [reviewNo, setReviewNo] = useState<number | null>(null);
  const [eligible, setEligible] = useState<EligibleBus[]>([]);
  const [selectedBusIds, setSelectedBusIds] = useState<string[]>([]);
  const [topForm, setTopForm] = useState<TopForm>(defaultTopForm());
  const [generalEvidences, setGeneralEvidences] = useState<EvidenceItem[]>([]);
  const [newGeneralFiles, setNewGeneralFiles] = useState<File[]>([]);
  const [busForms, setBusForms] = useState<Record<string, BusForm>>({});
  const [creatingBusId, setCreatingBusId] = useState<string | null>(null);
  const [observationCatalog, setObservationCatalog] = useState<ObservationCatalogItem[]>([]);
  const [correctiveQueue, setCorrectiveQueue] = useState<CorrectiveQueueItem[]>([]);
  const [queuesLoading, setQueuesLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [creatingCorrBusId, setCreatingCorrBusId] = useState<string | null>(null);
  const [openBusId, setOpenBusId] = useState<string | null>(null);

  const selectedBuses = useMemo(
    () => selectedBusIds.map((id) => busForms[id]).filter(Boolean),
    [selectedBusIds, busForms]
  );
  const observationByCode = useMemo(
    () => new Map(observationCatalog.map((item) => [item.code, item])),
    [observationCatalog]
  );
  const exportHref = `/api/rvr/daily/export?date=${encodeURIComponent(date)}&format=xlsx`;

  const applyReview = (review: ReviewPayload) => {
    setReviewId(review.id);
    setReviewNo(review.reviewNo ?? null);
    setTopForm({
      scheduleWindow: review.scheduleWindow || "2 horas",
      generalResult: review.generalResult || "",
      relevantFindings: review.relevantFindings || "",
      ticketUpk: review.ticketUpk || "",
      requiresCorrective: review.requiresCorrective,
      capitalbusOt: review.capitalbusOt || "",
      evidencesNotes: review.evidencesNotes || "",
      status: review.status || "DRAFT",
    });
    setGeneralEvidences(review.evidences ?? []);
    const next: Record<string, BusForm> = {};
    for (const row of review.buses) next[row.busId] = savedBusForm(row);
    setBusForms(next);
    setSelectedBusIds(review.buses.map((row) => row.busId));
  };

  // Efecto 1 (RÁPIDO): carga la revisión del día (los buses ya guardados).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setInfo(null);
      try {
        const res = await fetch(`/api/rvr/daily?date=${encodeURIComponent(date)}`, { cache: "no-store" });
        const payload = (await res.json().catch(() => ({}))) as ApiGetResponse & { error?: string };
        if (!res.ok) throw new Error(payload.error || "No se pudo cargar la revisión.");
        if (cancelled) return;

        if (payload.review) {
          applyReview(payload.review);
        } else {
          setReviewId(null);
          setReviewNo(null);
          setTopForm(defaultTopForm());
          setGeneralEvidences([]);
          setBusForms({});
          setSelectedBusIds([]);
        }
        setNewGeneralFiles([]);
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? "Error cargando la revisión.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  // Efecto 2 (SEGUNDO PLANO): colas pesadas (priorizados + prioridad de correctivo).
  useEffect(() => {
    let cancelled = false;
    async function loadQueues() {
      if (!isToday) {
        setEligible([]);
        setCorrectiveQueue([]);
        return;
      }
      setQueuesLoading(true);
      try {
        const res = await fetch(`/api/rvr/daily?date=${encodeURIComponent(date)}&queues=1`, { cache: "no-store" });
        const payload = (await res.json().catch(() => ({}))) as ApiGetResponse & { error?: string };
        if (!res.ok || cancelled) return;
        setEligible(payload.eligibleBuses ?? []);
        setCorrectiveQueue(payload.correctiveQueue ?? []);
        // Si aún no hay revisión del día, auto-seleccionar los priorizados.
        if (payload.hasReview === false) {
          const auto = (payload.eligibleBuses ?? []).slice(0, RVR_MAX_BUSES_PER_DAY).map((b) => b.id);
          setSelectedBusIds((prev) => (prev.length > 0 ? prev : auto));
          setBusForms((cur) => {
            if (Object.keys(cur).length > 0) return cur;
            const next: Record<string, BusForm> = {};
            for (const id of auto) {
              const b = (payload.eligibleBuses ?? []).find((item) => item.id === id);
              if (b) next[id] = emptyBusForm(b);
            }
            return next;
          });
        }
      } catch {
        // Silencioso: las colas son secundarias.
      } finally {
        if (!cancelled) setQueuesLoading(false);
      }
    }
    void loadQueues();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, isToday]);

  useEffect(() => {
    let cancelled = false;
    async function loadObservationCatalog() {
      try {
        const res = await fetch("/api/rvr/observation-catalog", { cache: "no-store" });
        const payload = (await res.json().catch(() => ({}))) as ObservationCatalogResponse;
        if (!res.ok || !payload.ok) return;
        if (cancelled) return;
        setObservationCatalog(Array.isArray(payload.items) ? payload.items : []);
      } catch {
        // Se mantiene la observación manual si el catálogo no está disponible.
      }
    }
    void loadObservationCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleBus = (busId: string, checked: boolean) => {
    setError(null);
    setInfo(null);
    setSelectedBusIds((prev) => {
      if (checked) {
        if (prev.includes(busId)) return prev;
        if (prev.length >= RVR_MAX_BUSES_PER_DAY) {
          setError(`Máximo ${RVR_MAX_BUSES_PER_DAY} buses por día.`);
          return prev;
        }
        setBusForms((current) => {
          if (current[busId]) return current;
          const bus = eligible.find((item) => item.id === busId);
          if (!bus) return current;
          return { ...current, [busId]: emptyBusForm(bus) };
        });
        return [...prev, busId];
      }
      return prev.filter((id) => id !== busId);
    });
  };

  const patchBus = (busId: string, updater: (prev: BusForm) => BusForm) => {
    setBusForms((prev) => {
      const current = prev[busId];
      if (!current) return prev;
      return { ...prev, [busId]: updater(current) };
    });
  };

  const selectObservationCode = (bus: BusForm, rowIndex: number, nextCode: string) => {
    const normalizedCode = String(nextCode ?? "").trim().toUpperCase();
    patchBus(bus.busId, (prev) => {
      const nextChecklist = [...prev.checklist];
      const currentRow = nextChecklist[rowIndex];
      if (!currentRow) return prev;

      const catalogItem = normalizedCode ? observationByCode.get(normalizedCode) : undefined;
      const nextObservation =
        catalogItem && catalogItem.standardObservation
          ? renderObservationTemplate(catalogItem.standardObservation, {
              busCode: prev.busCode,
              camera: currentRow.camera,
              code: catalogItem.code,
            })
          : currentRow.observation;

      nextChecklist[rowIndex] = {
        ...currentRow,
        observationCode: normalizedCode,
        observation: nextObservation,
      };

      return {
        ...prev,
        checklist: nextChecklist,
      };
    });
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      if (!selectedBusIds.length) throw new Error("Selecciona al menos 1 bus.");
      const entries = selectedBusIds.map((busId) => {
        const bus = busForms[busId];
        return {
          busId,
          reviewedAt: bus?.reviewedAt || new Date().toISOString(),
          nvrIp: bus?.nvrIp || "",
          generalResult: bus?.generalResult || "",
          relevantFindings: bus?.relevantFindings || "",
          ticketUpk: bus?.ticketUpk || "",
          requiresCorrective: Boolean(bus?.requiresCorrective),
          capitalbusOt: bus?.capitalbusOt || "",
          checklist: bus?.checklist || createDefaultRvrChecklist(),
          aspects: bus?.aspects || createDefaultRvrAspects(),
        };
      });

      const fd = new FormData();
      fd.set("payload", JSON.stringify({ date, ...topForm, selectedBusIds, entries }));
      for (const busId of selectedBusIds) {
        const files = busForms[busId]?.newFiles ?? [];
        for (const file of files) fd.append(`evidence:${busId}`, file);
        const camFiles = busForms[busId]?.newCamFiles ?? {};
        for (const [camera, file] of Object.entries(camFiles)) {
          fd.append(`evidence-cam:${busId}:${camera}`, file);
        }
      }
      for (const file of newGeneralFiles) fd.append("evidence:general", file);

      const res = await fetch("/api/rvr/daily", { method: "POST", body: fd });
      const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; review?: ReviewPayload; message?: string };
      if (!res.ok || !payload.ok || !payload.review) throw new Error(payload.error || "No se pudo guardar.");

      applyReview(payload.review);
      setNewGeneralFiles([]);
      setInfo(payload.message || "Revisión guardada.");
    } catch (err: any) {
      setError(err?.message ?? "Error guardando la revisión.");
    } finally {
      setSaving(false);
    }
  };

  const createCorrective = async (bus: BusForm) => {
    if (!reviewId || !bus.rowId) return setError("Guarda primero la revisión.");
    setCreatingBusId(bus.busId);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(
        `/api/rvr/reviews/${encodeURIComponent(reviewId)}/buses/${encodeURIComponent(bus.rowId)}/corrective`,
        { method: "POST" }
      );
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        caseId?: string;
        caseNo?: number | null;
        workOrderId?: string | null;
        workOrderNo?: number | null;
      };
      if (!res.ok || !payload.ok) throw new Error(payload.error || "No se pudo crear correctivo.");
      patchBus(bus.busId, (prev) => ({
        ...prev,
        correctiveCaseId: payload.caseId ?? prev.correctiveCaseId,
        correctiveCaseNo: payload.caseNo ?? prev.correctiveCaseNo,
        correctiveWorkOrderId: payload.workOrderId ?? prev.correctiveWorkOrderId,
        correctiveWorkOrderNo: payload.workOrderNo ?? prev.correctiveWorkOrderNo,
      }));
      setInfo(`Correctivo generado para ${bus.busCode}.`);
    } catch (err: any) {
      setError(err?.message ?? "Error generando correctivo.");
    } finally {
      setCreatingBusId(null);
    }
  };

  const generateToday = async () => {
    setGenerating(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/rvr/daily/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; total?: number; created?: number };
      if (!res.ok || !payload.ok) throw new Error(payload.error || "No se pudo generar la lista.");
      window.location.reload();
    } catch (err: any) {
      setError(err?.message ?? "Error generando la lista.");
      setGenerating(false);
    }
  };

  const createCorrectivePriority = async (item: CorrectiveQueueItem) => {
    setCreatingCorrBusId(item.busId);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/rvr/corrective-priority", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ busId: item.busId, reason: item.reasonLabel, detail: item.detail }),
      });
      const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; caseNo?: number | null };
      if (!res.ok || !payload.ok) throw new Error(payload.error || "No se pudo crear el correctivo.");
      setInfo(`Correctivo CASO-${String(payload.caseNo ?? "").padStart(3, "0")} creado para ${item.busCode}.`);
      setCorrectiveQueue((prev) => prev.filter((x) => x.busId !== item.busId));
    } catch (err: any) {
      setError(err?.message ?? "Error creando el correctivo.");
    } finally {
      setCreatingCorrBusId(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-border/60 bg-white p-6 text-sm text-muted-foreground shadow-sm">
        Cargando revisión visual remota...
      </div>
    );
  }

  const thClass = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400";
  const statusChip =
    topForm.status === "COMPLETED"
      ? "bg-emerald-100 text-emerald-700"
      : "bg-blue-100 text-blue-700";

  return (
    <div className="space-y-4">
      {/* Encabezado (estilo módulo de casos) */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-white px-4 py-3.5 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-lg font-semibold tracking-tight text-slate-900">
            Revisión visual remota
            <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-sm font-semibold text-slate-700">
              {formatRvrNo(reviewNo)}
            </span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusChip}`}>
              {topForm.status === "COMPLETED" ? "Completada" : "En gestión"}
            </span>
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <Link href="/rvr" className="text-primary hover:underline">← Revisiones</Link>
            {" · "}
            {new Intl.DateTimeFormat("es-CO", { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))}
            {" · "}
            {selectedBusIds.length} buses · Responsable: {userName}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Estado de la revisión"
            className="app-field-control h-9 rounded-lg px-3 text-sm"
            value={topForm.status}
            onChange={(e) =>
              setTopForm((prev) => ({ ...prev, status: e.target.value === "COMPLETED" ? "COMPLETED" : "DRAFT" }))
            }
          >
            <option value="DRAFT">En gestión</option>
            <option value="COMPLETED">Completada</option>
          </select>
          <button
            type="button"
            className="inline-flex h-9 items-center rounded-lg border border-border/70 bg-white px-3 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
            onClick={() => window.open(exportHref, "_blank", "noopener,noreferrer")}
          >
            Exportar
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white shadow-sm transition hover:brightness-95 disabled:opacity-60"
            onClick={save}
            disabled={saving}
          >
            {saving ? "Guardando..." : "Guardar revisión"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">{error}</div>
      ) : null}
      {info ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 shadow-sm">{info}</div>
      ) : null}

      {/* Lista 1: buses priorizados para revisión (solo en la revisión de HOY) */}
      {isToday ? (
      <section className="overflow-hidden rounded-2xl border border-border/60 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 bg-muted/20 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold">Buses priorizados para revisión</h2>
            <p className="text-xs text-muted-foreground">
              No transmite → alarma de cámara → preventivo ayer → preventivo 10+ días → re-revisión cada 7 días (4 veces al mes por bus).
            </p>
          </div>
          <button
            type="button"
            className="inline-flex h-9 items-center rounded-lg border border-border/70 bg-white px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
            onClick={generateToday}
            disabled={generating}
          >
            {generating ? "Generando..." : "Generar lista de hoy"}
          </button>
        </div>
        {queuesLoading && eligible.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">Cargando priorización…</p>
        ) : eligible.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">Sin buses priorizados por ahora.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className={thClass}>#</th>
                  <th className={thClass}>Bus</th>
                  <th className={thClass}>Placa</th>
                  <th className={thClass}>Motivo</th>
                  <th className={thClass}>Últ. preventivo</th>
                  <th className={thClass}>IP NVR</th>
                  <th className={`${thClass} text-center`}>Incluir</th>
                </tr>
              </thead>
              <tbody>
                {eligible.map((bus, idx) => {
                  const included = selectedBusIds.includes(bus.id);
                  return (
                    <tr key={bus.id} className={`border-t border-border/40 ${included ? "bg-blue-50/40" : ""}`}>
                      <td className="px-3 py-2 tabular-nums text-slate-400">{idx + 1}</td>
                      <td className="px-3 py-2 font-medium text-slate-900">{bus.code}</td>
                      <td className="px-3 py-2 text-muted-foreground">{bus.plate ?? "Sin placa"}</td>
                      <td className="px-3 py-2">
                        {bus.reasonLabel ? (
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${reasonBadgeClass(bus.reason)}`}>
                            {bus.reasonLabel}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                        {bus.hasOpenNovedad ? (
                          <span className="ml-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                            novedad abierta
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDate(bus.lastPreventiveAt)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{bus.nvrIp || "No registrada"}</td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          aria-label={`Incluir bus ${bus.code}`}
                          checked={included}
                          onChange={(e) => toggleBus(bus.id, e.target.checked)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      ) : null}

      {/* Lista 2: prioridad de correctivo (solo hoy) */}
      {isToday ? (
      <section className="overflow-hidden rounded-2xl border border-border/60 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 bg-muted/20 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold">Prioridad de correctivo</h2>
            <p className="text-xs text-muted-foreground">
              Buses con falla técnica: no reporta → odómetro en 0 → coordenadas en 0.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex h-9 items-center rounded-lg border border-border/70 bg-white px-3 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50"
            onClick={() => window.open("/api/rvr/corrective-priority/export?format=xlsx", "_blank", "noopener,noreferrer")}
          >
            Exportar Excel
          </button>
        </div>
        {queuesLoading && correctiveQueue.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">Cargando priorización…</p>
        ) : correctiveQueue.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">Sin buses con falla técnica pendiente. ✔</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className={thClass}>#</th>
                  <th className={thClass}>Bus</th>
                  <th className={thClass}>Placa</th>
                  <th className={thClass}>Motivo</th>
                  <th className={thClass}>Detalle</th>
                  <th className={`${thClass} text-right`}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {correctiveQueue.map((item, idx) => (
                  <tr key={item.busId} className="border-t border-border/40">
                    <td className="px-3 py-2 tabular-nums text-slate-400">{idx + 1}</td>
                    <td className="px-3 py-2 font-medium text-slate-900">{item.busCode}</td>
                    <td className="px-3 py-2 text-muted-foreground">{item.busPlate ?? "Sin placa"}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${reasonBadgeClass(item.reason)}`}>
                        {item.reasonLabel}
                      </span>
                      {item.hasOpenNovedad ? (
                        <span className="ml-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                          novedad abierta
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{item.detail || "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        className="inline-flex h-8 items-center rounded-lg bg-blue-600 px-3 text-xs font-medium text-white shadow-sm transition hover:brightness-95 disabled:opacity-60"
                        onClick={() => createCorrectivePriority(item)}
                        disabled={creatingCorrBusId === item.busId}
                      >
                        {creatingCorrBusId === item.busId ? "Creando..." : "Crear correctivo"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      ) : null}

      {/* Revisión bus por bus */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-base font-semibold text-slate-900">
            Revisión bus por bus ({selectedBuses.length})
          </h2>
        </div>

        {selectedBuses.length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-white p-6 text-center text-sm text-muted-foreground shadow-sm">
            Marca los buses a revisar en la lista de priorizados.
          </div>
        ) : null}

        {selectedBuses.map((bus, busIdx) => {
          const isOpen = openBusId === bus.busId;
          const ticketAuto =
            reviewNo != null
              ? `${String(reviewNo).padStart(4, "0")}-${busIdx + 1}`
              : `— (se numera al guardar)`;
          const camNovedades = bus.checklist.filter((r) => r.complies === "N").length;
          return (
            <div key={bus.busId} className="overflow-hidden rounded-2xl border border-border/60 bg-white shadow-sm">
              <button
                type="button"
                className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left transition hover:bg-slate-50"
                onClick={() => setOpenBusId((prev) => (prev === bus.busId ? null : bus.busId))}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold">
                    {bus.busCode} <span className="font-normal text-muted-foreground">{bus.busPlate ?? "Sin placa"}</span>
                  </span>
                  <span className="inline-block rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    {bus.ticketUpk || ticketAuto}
                  </span>
                  {bus.priorityReason ? (
                    <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                      {bus.priorityReason}
                    </span>
                  ) : null}
                  {camNovedades ? (
                    <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
                      {camNovedades} cámara(s) con novedad
                    </span>
                  ) : null}
                  {bus.evidences.length + bus.newFiles.length ? (
                    <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                      {bus.evidences.length + bus.newFiles.length} evidencia(s)
                    </span>
                  ) : null}
                  {bus.correctiveCaseNo ? (
                    <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                      Correctivo CASO-{String(bus.correctiveCaseNo).padStart(3, "0")}
                    </span>
                  ) : null}
                </span>
                <span className="text-xs font-medium text-primary">{isOpen ? "Cerrar ▲" : "Abrir ▼"}</span>
              </button>

              {isOpen ? (
                <div className="space-y-3 border-t border-border/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">IP NVR: {bus.nvrIp || "No registrada"}</p>
                    <div className="flex gap-2">
                      {bus.correctiveCaseId ? (
                        <Link
                          href={`/cases/${bus.correctiveCaseId}`}
                          className="sts-btn-ghost inline-flex h-9 items-center px-3 text-xs"
                        >
                          Ver caso
                        </Link>
                      ) : null}
                      {bus.requiresCorrective ? (
                        <button
                          type="button"
                          className="sts-btn-primary h-9 px-3 text-xs disabled:opacity-60"
                          onClick={() => createCorrective(bus)}
                          disabled={creatingBusId === bus.busId}
                        >
                          {creatingBusId === bus.busId ? "Generando..." : "Generar correctivo"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <div className="text-xs text-muted-foreground">
                      Ticket de revisión (automático)
                      <div className="mt-1 flex h-10 items-center rounded-xl border border-border/60 bg-slate-50 px-3 text-sm font-semibold text-slate-700">
                        {bus.ticketUpk || ticketAuto}
                      </div>
                    </div>
                    <label className="text-xs text-muted-foreground">
                      ¿Requiere correctivo?
                      <select
                        className="app-field-control mt-1 h-10 w-full rounded-xl px-3 text-sm"
                        value={bus.requiresCorrective ? "S" : "N"}
                        onChange={(e) =>
                          patchBus(bus.busId, (prev) => ({ ...prev, requiresCorrective: e.target.value === "S" }))
                        }
                      >
                        <option value="N">No</option>
                        <option value="S">Sí</option>
                      </select>
                    </label>
                    <label className="text-xs text-muted-foreground">
                      Resultado
                      <input
                        type="text"
                        className="app-field-control mt-1 h-10 w-full rounded-xl px-3 text-sm"
                        value={bus.generalResult}
                        onChange={(e) => patchBus(bus.busId, (prev) => ({ ...prev, generalResult: e.target.value }))}
                      />
                    </label>
                  </div>
                  <label className="block text-xs text-muted-foreground">
                    Hallazgos
                    <textarea
                      className="app-field-control mt-1 min-h-[72px] w-full rounded-xl p-3 text-sm"
                      value={bus.relevantFindings}
                      onChange={(e) => patchBus(bus.busId, (prev) => ({ ...prev, relevantFindings: e.target.value }))}
                    />
                  </label>

                  <div className="rounded-xl border border-border/60 p-3">
                    <p className="text-xs font-medium text-muted-foreground">Revisión del bus</p>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {RVR_BUS_ASPECTS.map((a) => (
                        <label key={a.key} className="block text-xs text-muted-foreground">
                          {a.label}
                          <select
                            className="app-field-control mt-1 h-10 w-full rounded-xl px-3 text-sm"
                            value={bus.aspects[a.key] ?? ""}
                            onChange={(e) =>
                              patchBus(bus.busId, (prev) => ({
                                ...prev,
                                aspects: {
                                  ...prev.aspects,
                                  [a.key]: e.target.value === "S" || e.target.value === "N" ? e.target.value : "",
                                },
                              }))
                            }
                          >
                            <option value="">--</option>
                            <option value="S">Sí</option>
                            <option value="N">No</option>
                          </select>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-border/60">
                    <table className="w-full min-w-[1020px] text-sm">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className={thClass}>Cámara</th>
                          <th className={thClass}>Estado</th>
                          <th className={thClass}>Tipo de novedad</th>
                          <th className={thClass}>Observación</th>
                          <th className={thClass}>Evidencia (imagen)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bus.checklist.map((row, idx) => (
                          <tr key={row.camera} className="border-t border-border/50">
                            <td className="px-3 py-2 font-medium">{row.camera}</td>
                            <td className="px-3 py-2">
                              <select
                                className="app-field-control h-9 w-28 rounded-lg px-2 text-sm"
                                value={row.complies}
                                onChange={(e) =>
                                  patchBus(bus.busId, (prev) => {
                                    const next = [...prev.checklist];
                                    const nextComplies =
                                      e.target.value === "S" || e.target.value === "N" ? e.target.value : "";
                                    next[idx] = {
                                      ...next[idx],
                                      complies: nextComplies,
                                      observationCode: nextComplies === "N" ? next[idx].observationCode : "",
                                    };
                                    return { ...prev, checklist: next };
                                  })
                                }
                              >
                                <option value="">--</option>
                                <option value="S">OK</option>
                                <option value="N">Novedad</option>
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <select
                                className="app-field-control h-9 w-full rounded-lg px-2 text-sm disabled:opacity-60"
                                value={row.observationCode ?? ""}
                                disabled={row.complies !== "N"}
                                onChange={(e) => selectObservationCode(bus, idx, e.target.value)}
                              >
                                <option value="">{row.complies === "N" ? "Seleccionar..." : "No aplica"}</option>
                                {observationCatalog.map((item) => (
                                  <option key={item.code} value={item.code}>
                                    {item.code} · {item.reason || item.result || item.category}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                className="app-field-control h-9 w-full rounded-lg px-2 text-sm"
                                value={row.observation}
                                onChange={(e) =>
                                  patchBus(bus.busId, (prev) => {
                                    const next = [...prev.checklist];
                                    next[idx] = { ...next[idx], observation: e.target.value };
                                    return { ...prev, checklist: next };
                                  })
                                }
                              />
                              {row.complies === "N" && row.observationCode ? (
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                  Acción sugerida:{" "}
                                  {observationByCode.get(row.observationCode)?.suggestedAction || "Sin acción sugerida"}
                                </p>
                              ) : null}
                            </td>
                            <td className="px-3 py-2">
                              {bus.newCamFiles[row.camera] ? (
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="max-w-[140px] truncate text-muted-foreground">
                                    {bus.newCamFiles[row.camera].name}
                                  </span>
                                  <button
                                    type="button"
                                    className="text-red-600 hover:underline"
                                    onClick={() =>
                                      patchBus(bus.busId, (prev) => {
                                        const next = { ...prev.newCamFiles };
                                        delete next[row.camera];
                                        return { ...prev, newCamFiles: next };
                                      })
                                    }
                                  >
                                    Quitar
                                  </button>
                                </div>
                              ) : row.evidence ? (
                                <div className="flex items-center gap-2">
                                  <a
                                    href={`/api/uploads/${row.evidence.filePath}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-2 text-xs text-primary hover:underline"
                                  >
                                    {row.evidence.mimeType.startsWith("image/") ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={`/api/uploads/${row.evidence.filePath}`}
                                        alt={`Evidencia ${row.camera}`}
                                        className="h-9 w-9 rounded-md border border-border/60 object-cover"
                                      />
                                    ) : null}
                                    <span className="max-w-[110px] truncate">{row.evidence.fileName}</span>
                                  </a>
                                  <label className="cursor-pointer text-xs text-slate-500 hover:underline">
                                    Cambiar
                                    <input
                                      type="file"
                                      accept="*/*"
                                      className="hidden"
                                      onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f)
                                          patchBus(bus.busId, (prev) => ({
                                            ...prev,
                                            newCamFiles: { ...prev.newCamFiles, [row.camera]: f },
                                          }));
                                        e.currentTarget.value = "";
                                      }}
                                    />
                                  </label>
                                </div>
                              ) : (
                                <label className="inline-flex h-8 cursor-pointer items-center rounded-lg border border-border/70 bg-white px-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50">
                                  Subir imagen
                                  <input
                                    type="file"
                                    accept="*/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f)
                                        patchBus(bus.busId, (prev) => ({
                                          ...prev,
                                          newCamFiles: { ...prev.newCamFiles, [row.camera]: f },
                                        }));
                                      e.currentTarget.value = "";
                                    }}
                                  />
                                </label>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="rounded-xl border border-border/60 p-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      Evidencias del bus ({bus.evidences.length + bus.newFiles.length})
                    </p>
                    <input
                      type="file"
                      multiple
                      accept="*/*"
                      className="app-field-control mt-2 h-10 w-full rounded-xl px-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1 file:text-xs file:text-white"
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        patchBus(bus.busId, (prev) => ({ ...prev, newFiles: [...prev.newFiles, ...files] }));
                        e.currentTarget.value = "";
                      }}
                    />
                    {bus.newFiles.length ? (
                      <div className="mt-2 space-y-1">
                        {bus.newFiles.map((f, idx) => (
                          <div key={`${f.name}-${idx}`} className="flex items-center justify-between gap-2 text-xs">
                            <span className="truncate text-muted-foreground">{f.name} (pendiente de guardar)</span>
                            <button
                              type="button"
                              className="text-red-600 hover:underline"
                              onClick={() =>
                                patchBus(bus.busId, (prev) => ({
                                  ...prev,
                                  newFiles: prev.newFiles.filter((_, i) => i !== idx),
                                }))
                              }
                            >
                              Quitar
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {bus.evidences.length ? (
                      <div className="mt-2 space-y-1">
                        {bus.evidences.map((ev, idx) => (
                          <a
                            key={`${ev.filePath}-${idx}`}
                            href={`/api/uploads/${ev.filePath}`}
                            target="_blank"
                            rel="noreferrer"
                            className="block truncate text-xs text-primary hover:underline"
                          >
                            {ev.fileName}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </section>

      {/* Acciones al pie */}
      <div className="flex justify-end gap-2">
        <button type="button" className="sts-btn-ghost h-10 px-4 text-sm" onClick={() => window.location.reload()}>
          Recargar
        </button>
        <button
          type="button"
          className="inline-flex h-10 items-center rounded-lg bg-blue-600 px-5 text-sm font-medium text-white shadow-sm transition hover:brightness-95 disabled:opacity-60"
          onClick={save}
          disabled={saving}
        >
          {saving ? "Guardando..." : "Guardar revisión"}
        </button>
      </div>
    </div>
  );
}
