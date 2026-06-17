"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CASE_TYPE_REGISTRY } from "@/lib/case-type-registry";
import { CAPABILITIES } from "@/lib/capabilities";
import { FormCard } from "@/components/FormCard";
import { Field, Input, Select, Textarea } from "@/components/Field";
import { DateTimeField } from "@/components/DateTimeField";
import { BusCombobox } from "@/components/BusCombobox";
import { BusEquipmentSelect } from "@/components/BusEquipmentSelect";
import { BusEquipmentMultiSelect } from "@/components/BusEquipmentMultiSelect";
import { StsTicketSeverity } from "@prisma/client";
type BusOption = { id: string; code: string; plate: string | null };
type PriorityOption = "BAJA" | "MEDIA" | "ALTA";
type AffectedEquipmentType = "NVR" | "CAMARAS" | "ROUTER_SIM" | "SWITCH_POE" | "GPS" | "CMS" | "IO_SENSORES";

const AFFECTED_EQUIPMENT_OPTIONS: Array<{ value: AffectedEquipmentType; label: string }> = [
  { value: "NVR", label: "NVR / Grabador" },
  { value: "CAMARAS", label: "Cámaras" },
  { value: "ROUTER_SIM", label: "Router / SIM (comunicaciones)" },
  { value: "SWITCH_POE", label: "Switch PoE" },
  { value: "GPS", label: "GPS" },
  { value: "CMS", label: "Centro de Gestión (CMS)" },
  { value: "IO_SENSORES", label: "Botón de pánico / Sensores" },
];

const NOVEDAD_OPTIONS_BY_EQUIPMENT: Record<AffectedEquipmentType, string[]> = {
  NVR: ["NVR no enciende", "NVR sin grabación", "NVR con falla de disco", "NVR reiniciando"],
  CAMARAS: ["Sin imagen", "Cámara borrosa", "Cámara con mancha", "Cámara desconectada"],
  ROUTER_SIM: ["Bus no reporta", "Sin datos de comunicación", "SIM sin servicio", "Intermitencia de enlace"],
  SWITCH_POE: ["Sin alimentación PoE", "Puerto sin enlace", "Switch sin energía", "Switch intermitente"],
  GPS: ["Sin posición GPS", "Posición errática", "GPS desconectado", "Sin actualización de ubicación"],
  CMS: ["Bus no visible en CMS", "Evento no registrado en CMS", "Datos incompletos en CMS", "Sin sincronización CMS"],
  IO_SENSORES: ["Botón de pánico no funciona", "Botón de pánico obturado", "Sensor no reporta", "Micrófono sin audio"],
};

// Patrón de regex (string, case-insensitive y sin acentos) para autoseleccionar el
// equipo específico del bus según el equipo afectado de la novedad.
// - CAMARAS no se autoselecciona (caso especial: se pide elegir la cámara).
// - CMS no tiene equipo físico, así que no autoselecciona.
const AFFECTED_EQUIPMENT_AUTOSELECT_PATTERN: Record<AffectedEquipmentType, string | null> = {
  NVR: "nvr",
  ROUTER_SIM: "modulo|router|sim|4g|5g|lte|modem",
  SWITCH_POE: "switch|poe",
  GPS: "gps",
  IO_SENSORES: "panico|boton|sensor|microfono",
  CMS: null,
  CAMARAS: null,
};

type NovedadItem = {
  key: string;
  buses: BusOption[];
  busEquipmentIds: string[];
  catalogCode: string;
  affectedEquipment: AffectedEquipmentType | "";
  priority: PriorityOption;
  reportedNovelty: string;
  custom: boolean;
  observations: string;
  evidenceFile: File | null;
};

type NovedadCatalogOption = {
  code: string;
  novelty: string;
  affectedEquipment: AffectedEquipmentType;
  priorityValue: number;
  priorityLabel: string;
  minimalEvidence: string;
  impact: string;
  standardObservation: string;
};

function formatBogotaDateTime(date: Date) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(date);
}

function applyObservationTemplate(
  template: string,
  context: { bus: BusOption | null; catalogCode: string; reportedNovelty: string }
) {
  const text = String(template ?? "").trim();
  if (!text) return "";
  const busCode = context.bus?.code?.trim() || "No disponible";
  const busPlate = context.bus?.plate?.trim() || "";
  const busText = busPlate ? `${busCode} (${busPlate})` : busCode;
  const dateTime = formatBogotaDateTime(new Date());

  return text
    .replace(/\{BUS\}/gi, busText)
    .replace(/\{FECHA_HORA\}/gi, dateTime)
    .replace(/\{CODIGO\}/gi, context.catalogCode || "N/A")
    .replace(/\{NOVEDAD\}/gi, context.reportedNovelty || "N/A");
}

type VideoForm = {
  origin: "TRANSMILENIO_SA" | "INTERVENTORIA" | "CAPITAL_BUS" | "OTRO";
  originOther?: string | null;

  requestType: string;
  radicadoTMSA: string;
  radicadoTMSADate: string;

  radicadoConcesionarioDate: string;

  requesterName: string;
  requesterDocument: string;
  requesterRole: string;
  requesterPhone: string;
  requesterEmail: string;
  requesterEmails: string[];

  vehicleId: string;

  eventStartAt: string;
  eventEndAt: string;

cameras: string[];
  cameraEquipmentIds: string[];
  deliveryMethod: "WINSCP" | "USB" | "ONEDRIVE";

  descriptionNovedad: string;
  finSolicitud: string[];
};

export default function NewCasePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedType = searchParams.get("type");
  const initialType =
    requestedType && requestedType in CASE_TYPE_REGISTRY
      ? (requestedType as keyof typeof CASE_TYPE_REGISTRY)
      : "CORRECTIVO";
  const fromNovedadId = searchParams.get("fromNovedad");
  const prefillBusId = searchParams.get("busId");

  const [type, setType] = useState<keyof typeof CASE_TYPE_REGISTRY>(initialType);
  const [isVideosOnlyUser, setIsVideosOnlyUser] = useState(false);
  const config = CASE_TYPE_REGISTRY[type];
  const isRenewalTecnologica = type === "RENOVACION_TECNOLOGICA";
  const usesMultiEquipment = type === "PREVENTIVO" || type === "CORRECTIVO";

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      try {
        const res = await fetch("/api/profile", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.user || cancelled) return;
        const caps = Array.isArray(data.user.capabilities) ? data.user.capabilities : [];
        const isVideosOnly =
          data.user.role === "BACKOFFICE" && caps.includes(CAPABILITIES.VIDEOS_ONLY);
        setIsVideosOnlyUser(isVideosOnly);
      } catch {
        // Best effort.
      }
    }
    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isVideosOnlyUser && type !== "SOLICITUD_DESCARGA_VIDEO") {
      setType("SOLICITUD_DESCARGA_VIDEO");
    }
  }, [isVideosOnlyUser, type]);

  const typeOptions = useMemo(
    () =>
      Object.values(CASE_TYPE_REGISTRY).filter((c) => {
        if (c.type === "MEJORA_PRODUCTO") return false;
        if (!isVideosOnlyUser) return true;
        return c.type === "SOLICITUD_DESCARGA_VIDEO";
      }),
    [isVideosOnlyUser]
  );

  const [bus, setBus] = useState<BusOption | null>(null);
  const [busEquipmentIds, setBusEquipmentIds] = useState<string[]>([]);
  // Aviso NO bloqueante: el bus tuvo un preventivo reciente (<30 días).
  const [recentPreventiveDays, setRecentPreventiveDays] = useState<number | null>(null);
  // Estado de preventivo del móvil (siempre que haya un bus seleccionado).
  const [preventiveStatus, setPreventiveStatus] = useState<{
    status: "al_dia" | "pendiente" | "no_aplica";
    message: string;
  } | null>(null);

  // Cuando el tipo es PREVENTIVO y hay un bus seleccionado, consulta si ese bus tuvo
  // un preventivo reciente para mostrar un aviso (no bloquea la creación).
  useEffect(() => {
    if (type !== "PREVENTIVO" || !bus?.id) {
      setRecentPreventiveDays(null);
      return;
    }
    let cancelled = false;
    setRecentPreventiveDays(null);
    async function checkRecentPreventive(busId: string) {
      try {
        const res = await fetch(
          `/api/cases/check-recent-preventive?busId=${encodeURIComponent(busId)}`,
          { cache: "no-store" }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        setRecentPreventiveDays(data?.recent ? Number(data.days) : null);
      } catch {
        // Best effort: si falla, no mostramos aviso.
      }
    }
    void checkRecentPreventive(bus.id);
    return () => {
      cancelled = true;
    };
  }, [type, bus?.id]);

  // Estado de preventivo del móvil: se muestra SIEMPRE que haya un bus
  // seleccionado, sin importar el tipo de caso.
  useEffect(() => {
    if (!bus?.id) {
      setPreventiveStatus(null);
      return;
    }
    let cancelled = false;
    setPreventiveStatus(null);
    async function loadPreventiveStatus(busId: string) {
      try {
        const res = await fetch(`/api/buses/${encodeURIComponent(busId)}/preventive-status`, {
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || cancelled || !data?.status) return;
        setPreventiveStatus({ status: data.status, message: String(data.message ?? "") });
      } catch {
        // Best effort: si falla, no mostramos el badge.
      }
    }
    void loadPreventiveStatus(bus.id);
    return () => {
      cancelled = true;
    };
  }, [bus?.id]);

  useEffect(() => {
    if (!prefillBusId) return;
    let cancelled = false;
    async function loadPrefillBus() {
      try {
        const res = await fetch(`/api/buses/${prefillBusId}`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.id || cancelled) return;
        setBus({ id: String(data.id), code: String(data.code ?? ""), plate: data.plate ?? null });
      } catch {
        // Best effort: si falla, el usuario selecciona el bus manualmente.
      }
    }
    void loadPrefillBus();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillBusId]);

  const suggested = useMemo(() => {
    const busCode = bus?.code;
    return {
      title: config.defaultTitle(busCode),
      description: config.defaultDescription(busCode),
    };
  }, [bus?.code, config]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<PriorityOption>("MEDIA");

  const [novedadItems, setNovedadItems] = useState<NovedadItem[]>([
    {
      key: `nvd-${Date.now()}`,
      buses: [],
      busEquipmentIds: [],
      catalogCode: "",
      affectedEquipment: "",
      priority: "MEDIA",
      reportedNovelty: "",
      custom: false,
      observations: "",
      evidenceFile: null,
    },
  ]);

  // Bus "pendiente" por registro: lo elige el combobox y se confirma con "Agregar bus".
  const [pendingBusByItem, setPendingBusByItem] = useState<Record<string, BusOption | null>>({});

  const [novedadCatalog, setNovedadCatalog] = useState<NovedadCatalogOption[]>([]);

  const catalogByEquipment = useMemo(() => {
    const grouped: Partial<Record<AffectedEquipmentType, NovedadCatalogOption[]>> = {};
    for (const item of novedadCatalog) {
      if (!grouped[item.affectedEquipment]) grouped[item.affectedEquipment] = [];
      grouped[item.affectedEquipment]!.push(item);
    }
    return grouped;
  }, [novedadCatalog]);

  function mapCatalogPriorityToOption(priorityValue: number): PriorityOption {
    if (priorityValue <= 2) return "ALTA";
    if (priorityValue >= 4) return "BAJA";
    return "MEDIA";
  }

  useEffect(() => {
    let cancelled = false;

    async function loadCatalog() {
      try {
        const res = await fetch("/api/novedades/catalog", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !Array.isArray(data?.items)) return;
        if (cancelled) return;
        setNovedadCatalog(
          data.items.map((item: any) => ({
            code: String(item.code ?? ""),
            novelty: String(item.novelty ?? ""),
            affectedEquipment: item.affectedEquipment as AffectedEquipmentType,
            priorityValue: Number(item.priorityValue ?? 3) || 3,
            priorityLabel: String(item.priorityLabel ?? ""),
            minimalEvidence: String(item.minimalEvidence ?? ""),
            impact: String(item.impact ?? ""),
            standardObservation: String(item.standardObservation ?? ""),
          }))
        );
      } catch {
        // Keep fallback options in UI if catalog endpoint fails.
      }
    }

    void loadCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

  const priorityToSeverity: Record<typeof priority, StsTicketSeverity> = {
    BAJA: StsTicketSeverity.LOW,
    MEDIA: StsTicketSeverity.MEDIUM,
    ALTA: StsTicketSeverity.HIGH,
  };

  const effectiveTitle = title || suggested.title;
  const effectiveDescription = description || suggested.description;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingEquipments, setLoadingEquipments] = useState(false);

  const [video, setVideo] = useState<VideoForm>({
    origin: "TRANSMILENIO_SA",
    originOther: null,
    requestType: "",
    radicadoTMSA: "",
    radicadoTMSADate: "",
   radicadoConcesionarioDate: new Date().toISOString().slice(0, 16),
    requesterName: "",
    requesterDocument: "",
    requesterRole: "",
    requesterPhone: "",
    requesterEmail: "",
    requesterEmails: ["", "", ""],
    vehicleId: "",
    eventStartAt: "",
    eventEndAt: "",
    cameras: [],
  cameraEquipmentIds: [],
    deliveryMethod: "WINSCP",
    descriptionNovedad: "",
    finSolicitud: [],
  });

  async function selectAllEquipments(busId: string) {
    setLoadingEquipments(true);
    try {
      const res = await fetch(`/api/buses/${busId}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const items = Array.isArray(data?.equipments) ? data.equipments : Array.isArray(data?.busEquipments) ? data.busEquipments : [];
      const activeIds = items.filter((e: any) => e?.active !== false).map((e: any) => String(e.id));
      setBusEquipmentIds(activeIds);
    } finally {
      setLoadingEquipments(false);
    }
  }

  async function submit() {
    setSaving(true);
    setError(null);

    try {
      if (type === "NOVEDAD") {
        // Validación por registro antes de expandir a items por bus.
        for (let idx = 0; idx < novedadItems.length; idx += 1) {
          const item = novedadItems[idx];
          const catalogCode = item.catalogCode.trim();
          const selectedCatalog =
            item.affectedEquipment && catalogCode
              ? (catalogByEquipment[item.affectedEquipment] ?? []).find(
                  (entry) => entry.code === catalogCode
                )
              : null;
          const resolvedReportedNovelty =
            item.reportedNovelty.trim() || selectedCatalog?.novelty?.trim() || "";

          const missing: string[] = [];
          if (!item.buses.length) missing.push("al menos un bus");
          if (!item.affectedEquipment) missing.push("equipo afectado");
          if (!item.priority) missing.push("prioridad");
          if (!resolvedReportedNovelty) missing.push("novedad (catálogo o texto libre)");

          if (missing.length) {
            throw new Error(`Registro #${idx + 1}: completa ${missing.join(", ")}.`);
          }

          // Cámaras con exactamente 1 bus: exige al menos una cámara seleccionada.
          // (Con varios buses no aplica el selector específico, por eso no se exige.)
          if (
            item.affectedEquipment === "CAMARAS" &&
            item.buses.length === 1 &&
            !item.busEquipmentIds.length
          ) {
            throw new Error(`Registro #${idx + 1}: selecciona al menos una cámara afectada.`);
          }
        }

        // Expandir cada registro a un item normalizado por cada bus.
        // Todos los items van en el mismo POST y, por tanto, en el mismo lote (batchRef
        // lo asigna el backend una sola vez por POST y lo reutiliza para cada caso).
        const normalizedItems = novedadItems.flatMap((item) => {
          const catalogCode = item.catalogCode.trim();
          const selectedCatalog =
            item.affectedEquipment && catalogCode
              ? (catalogByEquipment[item.affectedEquipment] ?? []).find(
                  (entry) => entry.code === catalogCode
                )
              : null;

          const resolvedReportedNovelty =
            item.reportedNovelty.trim() || selectedCatalog?.novelty?.trim() || "";
          const resolvedPriority = selectedCatalog
            ? mapCatalogPriorityToOption(selectedCatalog.priorityValue)
            : item.priority;
          // Los equipos específicos solo tienen sentido con exactamente un bus.
          const equipmentIds = item.buses.length === 1 ? item.busEquipmentIds : [];

          return item.buses.map((bus) => ({
            // localKey único por (registro, bus) para mapear evidencia 1:1 en el backend.
            localKey: `${item.key}::${bus.id}`,
            busId: bus.id,
            busCode: bus.code ?? null,
            busPlate: bus.plate ?? null,
            busEquipmentIds: equipmentIds,
            catalogCode: catalogCode || null,
            affectedEquipment: item.affectedEquipment || null,
            priority: resolvedPriority,
            reportedNovelty: resolvedReportedNovelty,
            observations: item.observations.trim(),
          }));
        });

        if (!normalizedItems.length) {
          throw new Error("Debes agregar al menos un bus en la novedad.");
        }

        const fd = new FormData();
        fd.set(
          "payload",
          JSON.stringify({
            type,
            novedadItems: normalizedItems,
          })
        );
        // La evidencia es por registro; se adjunta a cada caso del registro
        // enviándola bajo cada localKey expandido ("<key>::<busId>").
        for (const item of novedadItems) {
          if (!item.evidenceFile) continue;
          for (const bus of item.buses) {
            fd.set(`evidence:${item.key}::${bus.id}`, item.evidenceFile);
          }
        }

        const res = await fetch("/api/cases", {
          method: "POST",
          body: fd,
        });

        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || `${res.status} ${res.statusText}`);
        }

        const created = await res.json().catch(() => ({}));
        const createdBatchRef = typeof created?.batchRef === "string" ? created.batchRef : "";
        router.push(
          createdBatchRef
            ? `/novedades?batchRef=${encodeURIComponent(createdBatchRef)}`
            : "/novedades"
        );
        router.refresh();
        return;
      }

      if (!bus?.id) throw new Error("Debes seleccionar un bus.");
      if (config.requiresEquipment && !busEquipmentIds.length) {
        throw new Error("Debes seleccionar al menos un equipo del bus.");
      }

      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          busId: bus.id,
          busEquipmentIds: isRenewalTecnologica ? [] : busEquipmentIds,
          title: effectiveTitle,
          description: effectiveDescription,
          priority,
          stsSeverity: config.stsComponentCode ? priorityToSeverity[priority] : undefined,
          // enlace opcional a una novedad de origen
          fromNovedad:
            fromNovedadId && (type === "CORRECTIVO" || type === "PREVENTIVO")
              ? fromNovedadId
              : undefined,
          // inline create form
          videoDownloadRequest: config.hasInlineCreateForm ? video : undefined,
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `${res.status} ${res.statusText}`);
      }

      const created = await res.json();
      router.push(`/cases/${created.id}`);
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Error creando caso");
    } finally {
      setSaving(false);
    }
  }

  function addNovedadItem() {
    setNovedadItems((prev) => [
      ...prev,
      {
        key: `nvd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        buses: [],
        busEquipmentIds: [],
        catalogCode: "",
        affectedEquipment: "",
        priority: "MEDIA",
        reportedNovelty: "",
        custom: false,
        observations: "",
        evidenceFile: null,
      },
    ]);
  }

  function addBusToNovedadItem(key: string, bus: BusOption | null) {
    if (!bus?.id) return;
    setNovedadItems((prev) =>
      prev.map((item) => {
        if (item.key !== key) return item;
        if (item.buses.some((b) => b.id === bus.id)) return item;
        const nextBuses = [...item.buses, bus];
        // Los equipos específicos solo aplican con exactamente un bus.
        const nextEquipmentIds = nextBuses.length === 1 ? item.busEquipmentIds : [];
        return { ...item, buses: nextBuses, busEquipmentIds: nextEquipmentIds };
      })
    );
  }

  function removeBusFromNovedadItem(key: string, busId: string) {
    setNovedadItems((prev) =>
      prev.map((item) => {
        if (item.key !== key) return item;
        const nextBuses = item.buses.filter((b) => b.id !== busId);
        const nextEquipmentIds = nextBuses.length === 1 ? item.busEquipmentIds : [];
        return { ...item, buses: nextBuses, busEquipmentIds: nextEquipmentIds };
      })
    );
  }

  function removeNovedadItem(key: string) {
    setNovedadItems((prev) => (prev.length <= 1 ? prev : prev.filter((item) => item.key !== key)));
  }

  function updateNovedadItem(key: string, patch: Partial<NovedadItem>) {
    setNovedadItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, ...patch } : item))
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6">
      <div className="space-y-1">
        <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Crear caso</h1>
        <p className="text-base text-slate-600">
          Flujo unificado basado en registry. Buscado rápido por código o placa.
        </p>
      </div>

      {error ? (
        <div className="sts-card p-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      ) : null}

      <FormCard
        title="Datos del caso"
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => router.push("/cases")}
              className="sts-btn-ghost h-11 px-6 text-sm"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={submit}
              className="sts-btn-primary h-11 px-7 text-base disabled:opacity-60"
            >
              {saving ? "Guardando…" : "Crear caso"}
            </button>
          </div>
        }
      >
        {type !== "NOVEDAD" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-4">
              <Field label="Tipo de caso">
                <Select
                  value={type}
                  onChange={(e) => {
                    const v = e.target.value as any;
                    setType(v);
                    setBusEquipmentIds([]);
                    if (v === "PREVENTIVO" && bus?.id) {
                      void selectAllEquipments(bus.id);
                    }
                  }}
                >
                  {typeOptions.map((c) => (
                    <option key={c.type} value={c.type}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Bus (código o placa)">
                <BusCombobox
                  value={bus}
                  onChange={(b) => {
                    setBus(b);
                    setBusEquipmentIds([]);
                    // para video request: autollenar vehicleId con code si quieren
                    if (b?.code) setVideo((x) => ({ ...x, vehicleId: x.vehicleId || b.code }));
                    if (b?.id && type === "PREVENTIVO") {
                      void selectAllEquipments(b.id);
                    }
                  }}
                />
              </Field>

              {bus?.id && preventiveStatus ? (
                <div
                  className={
                    preventiveStatus.status === "pendiente"
                      ? "rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800"
                      : preventiveStatus.status === "al_dia"
                      ? "rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
                      : "rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
                  }
                >
                  <span className="font-medium">
                    {preventiveStatus.status === "pendiente"
                      ? "Le toca preventivo este mes"
                      : preventiveStatus.status === "al_dia"
                      ? "Al día / no requiere preventivo"
                      : "Aún no aplica preventivo"}
                  </span>
                  {preventiveStatus.message ? (
                    <span className="ml-1 text-xs opacity-80">· {preventiveStatus.message}</span>
                  ) : null}
                </div>
              ) : null}

              {type === "PREVENTIVO" && recentPreventiveDays !== null ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                  ⚠️ Este bus tuvo un preventivo hace {recentPreventiveDays} días (menos de 30).
                  Verifica si realmente corresponde crear otro.
                </div>
              ) : null}

              <Field label="Título" hint="Autollenado por tipo, editable">
                <Input value={effectiveTitle} onChange={(e) => setTitle(e.target.value)} />
              </Field>

              <Field label="Descripción" hint="Autollenado por tipo, editable">
                <Textarea rows={3} value={effectiveDescription} onChange={(e) => setDescription(e.target.value)} />
              </Field>
            </div>

            <div className="space-y-4">
              <Field label="Prioridad">
                <Select value={priority} onChange={(e) => setPriority(e.target.value as any)}>
                  <option value="BAJA">Baja</option>
                  <option value="MEDIA">Media</option>
                  <option value="ALTA">Alta</option>
                </Select>
              </Field>

              {/* Prioridad STS unificada con Prioridad */}

          {type !== "SOLICITUD_DESCARGA_VIDEO" && (isRenewalTecnologica ? (
                <Field
                  label="Equipo(s) del bus"
                  hint="En renovación tecnológica se vinculan automáticamente todos los equipos activos del bus."
                >
                  <div className="app-field-control flex h-10 items-center rounded-xl px-3 text-sm text-muted-foreground">
                    Automático por bus seleccionado
                  </div>
                </Field>
              ) : (
                <Field
                  label="Equipo(s) del bus"
                  hint={
                    type === "PREVENTIVO"
                      ? loadingEquipments
                        ? "Cargando equipos..."
                        : "Todos seleccionados por defecto (puedes deseleccionar)"
                      : config.requiresEquipment
                      ? "Requerido"
                      : "Opcional"
                  }
                >
                  {usesMultiEquipment ? (
                    <BusEquipmentMultiSelect
                      busId={bus?.id ?? null}
                      value={busEquipmentIds}
                      onChange={setBusEquipmentIds}
                      disabled={!bus?.id}
                    />
                  ) : (
                    <BusEquipmentSelect
                      busId={bus?.id ?? null}
                      value={busEquipmentIds[0] ?? null}
                      onChange={(id) => setBusEquipmentIds(id ? [id] : [])}
                      disabled={!bus?.id}
                    />
                  )}
                </Field>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Tipo de caso">
              <Select
                value={type}
                onChange={(e) => {
                  const v = e.target.value as any;
                  setType(v);
                  setBusEquipmentIds([]);
                  if (v === "PREVENTIVO" && bus?.id) {
                    void selectAllEquipments(bus.id);
                  }
                }}
              >
                {typeOptions.map((c) => (
                  <option key={c.type} value={c.type}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="md:col-span-2">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">Novedad masiva (múltiples buses)</p>
                <button type="button" className="sts-btn-ghost h-9 px-3 text-xs" onClick={addNovedadItem}>
                  Agregar otra novedad
                </button>
              </div>
              <div className="space-y-3">
                {novedadItems.map((item, idx) => {
                  const equipmentCatalog = item.affectedEquipment
                    ? catalogByEquipment[item.affectedEquipment] ?? []
                    : [];
                  const fallbackOptions = item.affectedEquipment
                    ? NOVEDAD_OPTIONS_BY_EQUIPMENT[item.affectedEquipment]
                    : [];
                  const selectedCatalog = equipmentCatalog.find(
                    (entry) => entry.code === item.catalogCode
                  );
                  const noveltySelectValue = equipmentCatalog.length
                    ? item.catalogCode
                    : item.reportedNovelty;
                  // Caso especial: cámaras NO se autoselecciona; se exige elegir cuál(es).
                  const isCamerasItem = item.affectedEquipment === "CAMARAS";
                  // Patrón de autoselección del equipo específico (null en CÁMARAS/CMS).
                  const autoSelectPattern = item.affectedEquipment
                    ? AFFECTED_EQUIPMENT_AUTOSELECT_PATTERN[item.affectedEquipment]
                    : null;

                  return (
                    <div key={item.key} className="rounded-xl border border-border/60 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-semibold text-muted-foreground">Registro #{idx + 1}</p>
                        <button
                          type="button"
                          className="text-xs text-muted-foreground underline disabled:opacity-40"
                          onClick={() => removeNovedadItem(item.key)}
                          disabled={novedadItems.length <= 1}
                        >
                          Quitar
                        </button>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="md:col-span-2">
                          <Field
                            label="Buses (código o placa)"
                            hint="Agrega uno o varios buses; la misma novedad se aplicará a todos."
                          >
                            <div className="flex items-end gap-2">
                              <div className="flex-1">
                                <BusCombobox
                                  value={pendingBusByItem[item.key] ?? null}
                                  onChange={(b) =>
                                    setPendingBusByItem((prev) => ({ ...prev, [item.key]: b }))
                                  }
                                />
                              </div>
                              <button
                                type="button"
                                className="sts-btn-ghost h-10 shrink-0 px-3 text-xs disabled:opacity-40"
                                disabled={!pendingBusByItem[item.key]?.id}
                                onClick={() => {
                                  const pending = pendingBusByItem[item.key] ?? null;
                                  addBusToNovedadItem(item.key, pending);
                                  setPendingBusByItem((prev) => ({ ...prev, [item.key]: null }));
                                }}
                              >
                                Agregar bus
                              </button>
                            </div>
                            {item.buses.length ? (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {item.buses.map((b) => (
                                  <span
                                    key={b.id}
                                    className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-1 text-xs"
                                  >
                                    <span className="font-medium">{b.code}</span>
                                    {b.plate ? (
                                      <span className="text-muted-foreground">({b.plate})</span>
                                    ) : null}
                                    <button
                                      type="button"
                                      className="ml-1 text-muted-foreground hover:text-foreground"
                                      aria-label={`Quitar bus ${b.code}`}
                                      onClick={() => removeBusFromNovedadItem(item.key, b.id)}
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-2 text-xs text-muted-foreground">
                                Aún no has agregado buses a esta novedad.
                              </p>
                            )}
                          </Field>
                        </div>

                        <Field
                          label="Equipo afectado"
                          hint="Queda atado a la novedad seleccionada del catálogo."
                        >
                          <Select
                            value={item.affectedEquipment}
                            onChange={(e) =>
                              // Al cambiar el equipo afectado se limpia la novedad seleccionada
                              // para evitar inconsistencias novedad↔equipo. También se limpian
                              // los equipos específicos para que la autoselección parta de cero
                              // (y para no arrastrar equipos de otro tipo, p. ej. al pasar a Cámaras).
                              updateNovedadItem(item.key, {
                                affectedEquipment: e.target.value as AffectedEquipmentType | "",
                                catalogCode: "",
                                reportedNovelty: "",
                                custom: false,
                                busEquipmentIds: [],
                              })
                            }
                          >
                            <option value="">Seleccionar equipo</option>
                            {AFFECTED_EQUIPMENT_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </Select>
                        </Field>

                        <Field label="Prioridad">
                          <Select
                            value={item.priority}
                            onChange={(e) =>
                              updateNovedadItem(item.key, { priority: e.target.value as PriorityOption })
                            }
                          >
                            <option value="BAJA">Baja</option>
                            <option value="MEDIA">Media</option>
                            <option value="ALTA">Alta</option>
                          </Select>
                        </Field>

                        <Field
                          label="Novedad (catálogo)"
                          hint={
                            equipmentCatalog.length
                              ? "Selecciona del catálogo para autocompletar prioridad."
                              : "Sin catálogo específico, usa opciones base."
                          }
                        >
                          <Select
                            value={item.custom ? "__OTRA__" : noveltySelectValue}
                            onChange={(e) => {
                              const value = e.target.value;
                              if (value === "__OTRA__") {
                                updateNovedadItem(item.key, {
                                  custom: true,
                                  catalogCode: "",
                                  reportedNovelty: "",
                                });
                                return;
                              }
                              if (!value) {
                                updateNovedadItem(item.key, {
                                  custom: false,
                                  catalogCode: "",
                                  reportedNovelty: "",
                                });
                                return;
                              }

                              if (equipmentCatalog.length) {
                                const selected = equipmentCatalog.find((entry) => entry.code === value);
                                if (selected) {
                                  const nextObservation = applyObservationTemplate(selected.standardObservation, {
                                    bus: item.buses[0] ?? null,
                                    catalogCode: selected.code,
                                    reportedNovelty: selected.novelty,
                                  });
                                  updateNovedadItem(item.key, {
                                    custom: false,
                                    catalogCode: selected.code,
                                    // Atar el equipo afectado al equipo de la novedad del catálogo.
                                    affectedEquipment: selected.affectedEquipment,
                                    reportedNovelty: selected.novelty,
                                    priority: mapCatalogPriorityToOption(selected.priorityValue),
                                    observations: nextObservation || item.observations,
                                  });
                                  return;
                                }
                              }

                              updateNovedadItem(item.key, {
                                custom: false,
                                catalogCode: "",
                                reportedNovelty: value,
                              });
                            }}
                            disabled={!item.affectedEquipment}
                          >
                            <option value="">
                              {item.affectedEquipment
                                ? "Seleccionar tipo de novedad"
                                : "Primero selecciona equipo"}
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
                            <option value="__OTRA__">Otra (no estandarizada)</option>
                          </Select>
                        </Field>

                        {item.custom ? (
                          <Field label="Describe la novedad (no estandarizada)">
                            <Input
                              value={item.reportedNovelty}
                              placeholder="Escribe la novedad..."
                              onChange={(e) => updateNovedadItem(item.key, { reportedNovelty: e.target.value })}
                            />
                          </Field>
                        ) : null}

                        <Field label="Código de novedad">
                          <Input
                            value={item.catalogCode}
                            placeholder="Se completa al elegir del catálogo"
                            disabled
                          />
                        </Field>

                        <div className="md:col-span-2 grid gap-3 md:grid-cols-2">
                          {item.buses.length === 1 ? (
                            <Field
                              label={
                                isCamerasItem
                                  ? "Cámara(s) afectada(s)"
                                  : "Equipo(s) específico(s) del bus"
                              }
                              hint={
                                isCamerasItem
                                  ? "Requerido: selecciona la(s) cámara(s) afectada(s)."
                                  : "Se marca automáticamente según la novedad; puedes ajustarlo (solo con un bus)."
                              }
                            >
                              {isCamerasItem ? (
                                <p className="mb-2 text-xs font-medium text-foreground">
                                  Selecciona la(s) cámara(s) afectada(s)
                                  <span className="text-red-600"> *</span>
                                </p>
                              ) : null}
                              <BusEquipmentMultiSelect
                                busId={item.buses[0]?.id ?? null}
                                value={item.busEquipmentIds}
                                onChange={(ids) => updateNovedadItem(item.key, { busEquipmentIds: ids })}
                                disabled={!item.buses[0]?.id}
                                filterCategory={isCamerasItem ? "CAMARAS" : undefined}
                                autoSelectPattern={isCamerasItem ? null : autoSelectPattern}
                              />
                            </Field>
                          ) : (
                            <Field
                              label="Equipo(s) específico(s) del bus"
                              hint="Disponible solo cuando la novedad tiene exactamente un bus."
                            >
                              <div className="app-field-control flex h-10 items-center rounded-xl px-3 text-xs text-muted-foreground">
                                {item.buses.length === 0
                                  ? "Agrega un bus para precisar equipos."
                                  : "No aplica con varios buses."}
                              </div>
                            </Field>
                          )}

                          <div className="space-y-3">
                            {selectedCatalog ? (
                              <div className="rounded-lg bg-muted/30 p-2 text-xs text-muted-foreground">
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

                            <Field label="Observaciones (opcional)">
                              <Textarea
                                rows={2}
                                value={item.observations}
                                onChange={(e) => updateNovedadItem(item.key, { observations: e.target.value })}
                                placeholder="Notas adicionales para coordinación o validación."
                              />
                            </Field>

                            <Field label="Evidencia de la novedad (opcional)">
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                className="block w-full text-xs"
                                onChange={(e) =>
                                  updateNovedadItem(item.key, {
                                    evidenceFile: e.target.files?.[0] ?? null,
                                  })
                                }
                              />
                              {item.evidenceFile ? (
                                <p className="mt-1 text-xs text-muted-foreground">{item.evidenceFile.name}</p>
                              ) : (
                                <p className="mt-1 text-xs text-muted-foreground">Sin evidencia adjunta.</p>
                              )}
                            </Field>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 rounded-lg bg-muted/30 p-2 text-xs text-muted-foreground">
                Al guardar: se registra histórico de novedades, se envía acuse automático y se genera correctivo por validar coordinador por cada novedad.
              </div>
            </div>
          </div>
        )}
      </FormCard>

      {config.hasInlineCreateForm ? (
        <FormCard title="Formulario solicitud descarga de video">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Procedencia requerimiento">
              <Select
                value={video.origin}
                onChange={(e) => setVideo((x) => ({ ...x, origin: e.target.value as any }))}
              >
                <option value="TRANSMILENIO_SA">TRANSMILENIO S.A</option>
                <option value="INTERVENTORIA">Interventoría</option>
                <option value="CAPITAL_BUS">CapitalBus</option>
                <option value="OTRO">Otro</option>
              </Select>
            </Field>

            <Field label="Otro (si aplica)">
              <Input
                value={video.originOther ?? ""}
                onChange={(e) => setVideo((x) => ({ ...x, originOther: e.target.value }))}
                disabled={video.origin !== "OTRO"}
              />
            </Field>

            <Field label="Tipo de requerimiento">
              <Input value={video.requestType} onChange={(e) => setVideo((x) => ({ ...x, requestType: e.target.value }))} />
            </Field>

            <Field label="Fecha radicado Concesionario">
              <DateTimeField
                value={video.radicadoConcesionarioDate}
                onChange={(v) => setVideo((x) => ({ ...x, radicadoConcesionarioDate: v }))}
              />
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Solicitante - Nombre">
              <Input value={video.requesterName} onChange={(e) => setVideo((x) => ({ ...x, requesterName: e.target.value }))} />
            </Field>
            <Field label="Solicitante - Documento">
              <Input value={video.requesterDocument} onChange={(e) => setVideo((x) => ({ ...x, requesterDocument: e.target.value }))} />
            </Field>
            <Field label="Solicitante - Cargo">
              <Input value={video.requesterRole} onChange={(e) => setVideo((x) => ({ ...x, requesterRole: e.target.value }))} />
            </Field>
            <Field label="Solicitante - Teléfono">
              <Input value={video.requesterPhone} onChange={(e) => setVideo((x) => ({ ...x, requesterPhone: e.target.value }))} />
            </Field>
            <Field label="Solicitante - Email">
              <Input value={video.requesterEmail} onChange={(e) => setVideo((x) => ({ ...x, requesterEmail: e.target.value }))} />
            </Field>
            <Field label="Correos para envio (1 a 3)">
              <div className="space-y-2">
                {video.requesterEmails.map((email, idx) => (
                  <Input
                    key={idx}
                    value={email}
                    placeholder={`Correo ${idx + 1}`}
                    onChange={(e) =>
                      setVideo((x) => {
                        const next = [...x.requesterEmails];
                        next[idx] = e.target.value;
                        return { ...x, requesterEmails: next };
                      })
                    }
                  />
                ))}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">Usa solo los correos necesarios, máximo 3.</p>
            </Field>
            <Field label="ID Vehículo">
              <Input value={video.vehicleId} onChange={(e) => setVideo((x) => ({ ...x, vehicleId: e.target.value }))} />
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Fecha/hora evento inicio">
              <DateTimeField value={video.eventStartAt} onChange={(v) => setVideo((x) => ({ ...x, eventStartAt: v }))} />
            </Field>
            <Field label="Fecha/hora evento fin">
              <DateTimeField value={video.eventEndAt} onChange={(v) => setVideo((x) => ({ ...x, eventEndAt: v }))} />
            </Field>

       <Field label="Cámaras solicitadas">
              <BusEquipmentMultiSelect
                busId={bus?.id ?? null}
                value={video.cameraEquipmentIds}
                onChange={(ids) => {
                  setVideo((x) => ({ ...x, cameraEquipmentIds: ids }));
                }}
                filterCategory="CAMARAS"
                disabled={!bus?.id}
              />
            </Field>
      
            <Field label="Medio de entrega">
              <Select
                value={video.deliveryMethod}
                onChange={(e) => setVideo((x) => ({ ...x, deliveryMethod: e.target.value as any }))}
              >
                <option value="WINSCP">WinSCP</option>
                <option value="USB">USB</option>
                <option value="ONEDRIVE">OneDrive</option>
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Descripción novedad">
              <Textarea
                rows={3}
                value={video.descriptionNovedad}
                onChange={(e) => setVideo((x) => ({ ...x, descriptionNovedad: e.target.value }))}
              />
            </Field>
            <Field label="Fin solicitud (separa con ; si hay varias)">
              <Textarea
                rows={3}
                value={video.finSolicitud.join("; ")}
                onChange={(e) =>
                  setVideo((x) => ({
                    ...x,
                    finSolicitud: e.target.value
                      .split(";")
                      .map((v) => v.trim())
                      .filter(Boolean),
                  }))
                }
              />
            </Field>
          </div>
        </FormCard>
      ) : null}
    </div>
  );
}
