"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  createDefaultRvrChecklist,
  createDefaultRvrAspects,
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
  date: string;
  scheduleWindow: string;
  generalResult: string;
  relevantFindings: string;
  ticketUpk: string;
  requiresCorrective: boolean;
  capitalbusOt: string;
  evidencesNotes: string;
  status: "DRAFT" | "COMPLETED";
  buses: ReviewBusPayload[];
};

type ApiGetResponse = {
  date: string;
  maxBuses: number;
  eligibleBuses: EligibleBus[];
  correctiveQueue?: CorrectiveQueueItem[];
  review: ReviewPayload | null;
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

function fmtDateTime(value: string | null) {
  if (!value) return "Sin preventivo finalizado";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Sin preventivo finalizado";
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short" }).format(d);
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
    priorityReason: saved.priorityReason ?? null,
    priorityDetail: saved.priorityDetail ?? null,
    correctiveCaseId: saved.correctiveCaseId,
    correctiveCaseNo: saved.correctiveCaseNo,
    correctiveWorkOrderId: saved.correctiveWorkOrderId,
    correctiveWorkOrderNo: saved.correctiveWorkOrderNo,
  };
}

export default function RvrDailyClient({ userName }: { userName: string }) {
  const [date, setDate] = useState(todayInputDate());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [eligible, setEligible] = useState<EligibleBus[]>([]);
  const [selectedBusIds, setSelectedBusIds] = useState<string[]>([]);
  const [topForm, setTopForm] = useState<TopForm>(defaultTopForm());
  const [busForms, setBusForms] = useState<Record<string, BusForm>>({});
  const [creatingBusId, setCreatingBusId] = useState<string | null>(null);
  const [observationCatalog, setObservationCatalog] = useState<ObservationCatalogItem[]>([]);
  const [correctiveQueue, setCorrectiveQueue] = useState<CorrectiveQueueItem[]>([]);
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

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setInfo(null);
      try {
        const res = await fetch(`/api/rvr/daily?date=${encodeURIComponent(date)}`, { cache: "no-store" });
        const payload = (await res.json().catch(() => ({}))) as ApiGetResponse & { error?: string };
        if (!res.ok) throw new Error(payload.error || "No se pudo cargar RVR.");
        if (cancelled) return;

        setEligible(payload.eligibleBuses ?? []);
        setCorrectiveQueue(payload.correctiveQueue ?? []);
        if (payload.review) {
          setReviewId(payload.review.id);
          setTopForm({
            scheduleWindow: payload.review.scheduleWindow || "2 horas",
            generalResult: payload.review.generalResult || "",
            relevantFindings: payload.review.relevantFindings || "",
            ticketUpk: payload.review.ticketUpk || "",
            requiresCorrective: payload.review.requiresCorrective,
            capitalbusOt: payload.review.capitalbusOt || "",
            evidencesNotes: payload.review.evidencesNotes || "",
            status: payload.review.status || "DRAFT",
          });
          const next: Record<string, BusForm> = {};
          for (const row of payload.review.buses) next[row.busId] = savedBusForm(row);
          setBusForms(next);
          setSelectedBusIds(payload.review.buses.map((row) => row.busId));
        } else {
          setReviewId(null);
          setTopForm(defaultTopForm());
          const auto = (payload.eligibleBuses ?? []).slice(0, RVR_MAX_BUSES_PER_DAY).map((b) => b.id);
          const next: Record<string, BusForm> = {};
          for (const id of auto) {
            const b = (payload.eligibleBuses ?? []).find((item) => item.id === id);
            if (b) next[id] = emptyBusForm(b);
          }
          setBusForms(next);
          setSelectedBusIds(auto);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? "Error cargando RVR.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [date]);

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
        // Keep manual observation entry if catalog is not available.
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
      }

      const res = await fetch("/api/rvr/daily", { method: "POST", body: fd });
      const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; review?: ReviewPayload; message?: string };
      if (!res.ok || !payload.ok || !payload.review) throw new Error(payload.error || "No se pudo guardar.");

      setReviewId(payload.review.id);
      setTopForm({
        scheduleWindow: payload.review.scheduleWindow || "2 horas",
        generalResult: payload.review.generalResult || "",
        relevantFindings: payload.review.relevantFindings || "",
        ticketUpk: payload.review.ticketUpk || "",
        requiresCorrective: payload.review.requiresCorrective,
        capitalbusOt: payload.review.capitalbusOt || "",
        evidencesNotes: payload.review.evidencesNotes || "",
        status: payload.review.status || "DRAFT",
      });
      const next: Record<string, BusForm> = {};
      for (const row of payload.review.buses) next[row.busId] = savedBusForm(row);
      setBusForms(next);
      setSelectedBusIds(payload.review.buses.map((row) => row.busId));
      setInfo(payload.message || "RVR guardada.");
    } catch (err: any) {
      setError(err?.message ?? "Error guardando RVR.");
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
    return <div className="mobile-section-card mobile-section-card__body text-sm text-muted-foreground">Cargando RVR...</div>;
  }

  return (
    <div className="mobile-page-shell space-y-4">
      <header className="mobile-page-header">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-4 lg:px-6 lg:py-0">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 lg:text-4xl">Revisión visual remota (RVR)</h1>
          <p className="text-sm text-muted-foreground">{RVR_MAX_BUSES_PER_DAY} buses diarios priorizados (no transmite, alarma de cámara, preventivo, re-revisión a 15 días).</p>
        </div>
      </header>
      <div className="mobile-page-content max-w-[1600px] space-y-4 lg:px-6">
        {error ? <div className="mobile-section-card mobile-section-card__body border border-red-200 bg-red-50 text-sm text-red-700">{error}</div> : null}
        {info ? <div className="mobile-section-card mobile-section-card__body border border-emerald-200 bg-emerald-50 text-sm text-emerald-700">{info}</div> : null}

        <section className="mobile-section-card mobile-section-card__body space-y-3">
          <h2 className="text-base font-semibold">Planificador RVR diario</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="text-xs text-muted-foreground">Fecha<input type="date" className="app-field-control mt-1 h-10 w-full rounded-xl px-3 text-sm" value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label className="text-xs text-muted-foreground">Responsable<input type="text" className="app-field-control mt-1 h-10 w-full rounded-xl px-3 text-sm" value={userName} disabled /></label>
            <label className="text-xs text-muted-foreground">Horario<input type="text" className="app-field-control mt-1 h-10 w-full rounded-xl px-3 text-sm" value={topForm.scheduleWindow} onChange={(e) => setTopForm((prev) => ({ ...prev, scheduleWindow: e.target.value }))} /></label>
            <label className="text-xs text-muted-foreground"># buses<input type="text" className="app-field-control mt-1 h-10 w-full rounded-xl px-3 text-sm" value={`${selectedBusIds.length}/${RVR_MAX_BUSES_PER_DAY}`} disabled /></label>
          </div>

          <label className="text-xs text-muted-foreground">Resultado general<input type="text" className="app-field-control mt-1 h-10 w-full rounded-xl px-3 text-sm" value={topForm.generalResult} onChange={(e) => setTopForm((prev) => ({ ...prev, generalResult: e.target.value }))} /></label>
          <label className="text-xs text-muted-foreground">Hallazgos<textarea className="app-field-control mt-1 min-h-[72px] w-full rounded-xl p-3 text-sm" value={topForm.relevantFindings} onChange={(e) => setTopForm((prev) => ({ ...prev, relevantFindings: e.target.value }))} /></label>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <label className="text-xs text-muted-foreground">N.º ticket revisión remota<input type="text" className="app-field-control mt-1 h-10 w-full rounded-xl px-3 text-sm" placeholder="Ticket de la RVR" value={topForm.ticketUpk} onChange={(e) => setTopForm((prev) => ({ ...prev, ticketUpk: e.target.value }))} /></label>
            <label className="text-xs text-muted-foreground">¿Requiere correctivo?<select className="app-field-control mt-1 h-10 w-full rounded-xl px-3 text-sm" value={topForm.requiresCorrective ? "S" : "N"} onChange={(e) => setTopForm((prev) => ({ ...prev, requiresCorrective: e.target.value === "S" }))}><option value="N">No</option><option value="S">Sí</option></select></label>
            <label className="text-xs text-muted-foreground">Estado<select className="app-field-control mt-1 h-10 w-full rounded-xl px-3 text-sm" value={topForm.status} onChange={(e) => setTopForm((prev) => ({ ...prev, status: e.target.value === "COMPLETED" ? "COMPLETED" : "DRAFT" }))}><option value="DRAFT">Borrador</option><option value="COMPLETED">Completado</option></select></label>
          </div>
          <label className="text-xs text-muted-foreground">Evidencias (nota general)<textarea className="app-field-control mt-1 min-h-[64px] w-full rounded-xl p-3 text-sm" value={topForm.evidencesNotes} onChange={(e) => setTopForm((prev) => ({ ...prev, evidencesNotes: e.target.value }))} /></label>
          <div className="rounded-xl border border-border/60 p-3 text-xs text-muted-foreground">
            Buses (Interno/Placa):{" "}
            {selectedBuses.length
              ? selectedBuses.map((b) => `${b.busCode}${b.busPlate ? `/${b.busPlate}` : ""}`).join(", ")
              : "Sin selección"}
          </div>
        </section>

        <section className="mobile-section-card mobile-section-card__body">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Buses priorizados de hoy</h2>
            <button type="button" className="sts-btn-ghost h-9 px-3 text-xs disabled:opacity-60" onClick={generateToday} disabled={generating}>{generating ? "Generando..." : "Generar hoy"}</button>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {eligible.map((bus) => (
              <label key={bus.id} className={`flex gap-2 rounded-xl border p-3 text-sm ${selectedBusIds.includes(bus.id) ? "border-primary/40 bg-primary/5" : "border-border/60"}`}>
                <input type="checkbox" checked={selectedBusIds.includes(bus.id)} onChange={(e) => toggleBus(bus.id, e.target.checked)} className="mt-1" />
                <span className="min-w-0">
                  <span className="block font-semibold">{bus.code} <span className="font-normal text-muted-foreground">{bus.plate ?? "Sin placa"}</span></span>
                  {bus.reasonLabel ? <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">{bus.reasonLabel}</span> : null}
                  <span className="block text-xs text-muted-foreground">Últ. preventivo: {fmtDateTime(bus.lastPreventiveAt)}</span>
                  <span className="block text-xs text-muted-foreground">IP NVR: {bus.nvrIp || "No registrada"}</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        {correctiveQueue.length ? (
          <section className="mobile-section-card mobile-section-card__body">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Prioridad de correctivo</h2>
              <button
                type="button"
                className="sts-btn-ghost h-9 px-3 text-xs"
                onClick={() => window.open("/api/rvr/corrective-priority/export?format=xlsx", "_blank", "noopener,noreferrer")}
              >
                Exportar Excel
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Buses con falla técnica, en orden de importancia (no reporta, odómetro 0, coordenadas 0).</p>
            <div className="mt-3 space-y-2">
              {correctiveQueue.map((item) => (
                <div key={item.busId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 p-3 text-sm">
                  <div className="min-w-0">
                    <span className="font-semibold">{item.busCode}</span> <span className="text-muted-foreground">{item.busPlate ?? "Sin placa"}</span>
                    <span className="ml-2 inline-block rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">{item.reasonLabel}</span>
                    {item.hasOpenNovedad ? <span className="ml-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">novedad abierta</span> : null}
                    {item.detail ? <span className="block text-[11px] text-muted-foreground">{item.detail}</span> : null}
                  </div>
                  <button type="button" className="sts-btn-primary h-9 px-3 text-xs disabled:opacity-60" onClick={() => createCorrectivePriority(item)} disabled={creatingCorrBusId === item.busId}>{creatingCorrBusId === item.busId ? "Creando..." : "Crear correctivo"}</button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {selectedBuses.map((bus) => {
          const isOpen = openBusId === bus.busId;
          const camNovedades = bus.checklist.filter((r) => r.complies === "N").length;
          return (
          <section key={bus.busId} className="mobile-section-card mobile-section-card__body">
            <button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 text-left" onClick={() => setOpenBusId((prev) => (prev === bus.busId ? null : bus.busId))}>
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold">{bus.busCode} <span className="font-normal text-muted-foreground">{bus.busPlate ?? "Sin placa"}</span></span>
                {bus.priorityReason ? <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">{bus.priorityReason}</span> : null}
                {camNovedades ? <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">{camNovedades} cámara(s) con novedad</span> : null}
                {bus.correctiveCaseNo ? <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">Correctivo CASO-{String(bus.correctiveCaseNo).padStart(3, "0")}</span> : null}
              </span>
              <span className="text-xs font-medium text-primary">{isOpen ? "Cerrar ▲" : "Abrir ▼"}</span>
            </button>

            {isOpen ? (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">IP NVR: {bus.nvrIp || "No registrada"}</p>
                <div className="flex gap-2">
                  {bus.correctiveCaseId ? <Link href={`/cases/${bus.correctiveCaseId}`} className="sts-btn-ghost inline-flex h-9 items-center px-3 text-xs">Ver caso</Link> : null}
                  {bus.requiresCorrective ? <button type="button" className="sts-btn-primary h-9 px-3 text-xs disabled:opacity-60" onClick={() => createCorrective(bus)} disabled={creatingBusId === bus.busId}>{creatingBusId === bus.busId ? "Generando..." : "Generar correctivo"}</button> : null}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <label className="text-xs text-muted-foreground">N.º ticket revisión remota<input type="text" className="app-field-control mt-1 h-10 w-full rounded-xl px-3 text-sm" placeholder="Ticket de la RVR" value={bus.ticketUpk} onChange={(e) => patchBus(bus.busId, (prev) => ({ ...prev, ticketUpk: e.target.value }))} /></label>
                <label className="text-xs text-muted-foreground">¿Requiere correctivo?<select className="app-field-control mt-1 h-10 w-full rounded-xl px-3 text-sm" value={bus.requiresCorrective ? "S" : "N"} onChange={(e) => patchBus(bus.busId, (prev) => ({ ...prev, requiresCorrective: e.target.value === "S" }))}><option value="N">No</option><option value="S">Sí</option></select></label>
                <label className="text-xs text-muted-foreground">Resultado<input type="text" className="app-field-control mt-1 h-10 w-full rounded-xl px-3 text-sm" value={bus.generalResult} onChange={(e) => patchBus(bus.busId, (prev) => ({ ...prev, generalResult: e.target.value }))} /></label>
              </div>
              <label className="text-xs text-muted-foreground">Hallazgos<textarea className="app-field-control mt-1 min-h-[72px] w-full rounded-xl p-3 text-sm" value={bus.relevantFindings} onChange={(e) => patchBus(bus.busId, (prev) => ({ ...prev, relevantFindings: e.target.value }))} /></label>

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
                            aspects: { ...prev.aspects, [a.key]: e.target.value === "S" || e.target.value === "N" ? e.target.value : "" },
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
                <table className="min-w-[820px] w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cámara</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estado</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tipo de novedad</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Observación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bus.checklist.map((row, idx) => (
                      <tr key={row.camera} className="border-t border-border/50">
                        <td className="px-3 py-2 font-medium">{row.camera}</td>
                        <td className="px-3 py-2">
                          <select className="app-field-control h-9 w-28 rounded-lg px-2 text-sm" value={row.complies} onChange={(e) => patchBus(bus.busId, (prev) => {
                            const next = [...prev.checklist];
                            const nextComplies = e.target.value === "S" || e.target.value === "N" ? e.target.value : "";
                            next[idx] = {
                              ...next[idx],
                              complies: nextComplies,
                              observationCode: nextComplies === "N" ? next[idx].observationCode : "",
                            };
                            return { ...prev, checklist: next };
                          })}>
                            <option value="">--</option><option value="S">OK</option><option value="N">Novedad</option>
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
                          <input className="app-field-control h-9 w-full rounded-lg px-2 text-sm" value={row.observation} onChange={(e) => patchBus(bus.busId, (prev) => {
                            const next = [...prev.checklist];
                            next[idx] = { ...next[idx], observation: e.target.value };
                            return { ...prev, checklist: next };
                          })} />
                          {row.complies === "N" && row.observationCode ? (
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              Acción sugerida: {observationByCode.get(row.observationCode)?.suggestedAction || "Sin acción sugerida"}
                            </p>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-xl border border-border/60 p-3">
                <p className="text-xs font-medium text-muted-foreground">Evidencias</p>
                <input type="file" multiple className="app-field-control mt-2 h-10 w-full rounded-xl px-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1 file:text-xs file:text-white" onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  patchBus(bus.busId, (prev) => ({ ...prev, newFiles: [...prev.newFiles, ...files] }));
                  e.currentTarget.value = "";
                }} />
                {bus.newFiles.length ? <div className="mt-2 space-y-1">{bus.newFiles.map((f, idx) => <div key={`${f.name}-${idx}`} className="flex items-center justify-between gap-2 text-xs"><span className="truncate text-muted-foreground">{f.name}</span><button type="button" className="text-red-600 hover:underline" onClick={() => patchBus(bus.busId, (prev) => ({ ...prev, newFiles: prev.newFiles.filter((_, i) => i !== idx) }))}>Quitar</button></div>)}</div> : null}
                {bus.evidences.length ? <div className="mt-2 space-y-1">{bus.evidences.map((ev, idx) => <a key={`${ev.filePath}-${idx}`} href={`/api/uploads/${ev.filePath}`} target="_blank" rel="noreferrer" className="block truncate text-xs text-primary hover:underline">{ev.fileName}</a>)}</div> : null}
              </div>
            </div>
            ) : null}
          </section>
          );
        })}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="sts-btn-ghost h-10 px-4 text-sm"
            onClick={() => window.open(exportHref, "_blank", "noopener,noreferrer")}
          >
            Exportar novedades
          </button>
          <button type="button" className="sts-btn-ghost h-10 px-4 text-sm" onClick={() => window.location.reload()}>Recargar</button>
          <button type="button" className="sts-btn-primary h-10 px-5 text-sm disabled:opacity-60" onClick={save} disabled={saving}>{saving ? "Guardando..." : "Guardar RVR"}</button>
        </div>
      </div>
    </div>
  );
}

