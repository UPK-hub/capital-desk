"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CASE_TYPE_REGISTRY } from "@/lib/case-type-registry";
import { FormCard } from "@/components/FormCard";
import { Field, Input, Select, Textarea } from "@/components/Field";
import { DateTimeField } from "@/components/DateTimeField";
import { BusCombobox } from "@/components/BusCombobox";
import { BusEquipmentSelect } from "@/components/BusEquipmentSelect";
import { BusEquipmentMultiSelect } from "@/components/BusEquipmentMultiSelect";
import { StsTicketSeverity } from "@prisma/client";
type BusOption = { id: string; code: string; plate: string | null };
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

type NovedadItem = {
  key: string;
  bus: BusOption | null;
  busEquipmentIds: string[];
  catalogCode: string;
  affectedEquipment: AffectedEquipmentType | "";
  priority: PriorityOption;
  reportedNovelty: string;
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
};

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

  cameras: string;
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

  const [type, setType] = useState<keyof typeof CASE_TYPE_REGISTRY>(initialType);
  const config = CASE_TYPE_REGISTRY[type];
  const isRenewalTecnologica = type === "RENOVACION_TECNOLOGICA";
  const usesMultiEquipment = type === "PREVENTIVO" || type === "CORRECTIVO";

  const [bus, setBus] = useState<BusOption | null>(null);
  const [busEquipmentIds, setBusEquipmentIds] = useState<string[]>([]);

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
      bus: null,
      busEquipmentIds: [],
      catalogCode: "",
      affectedEquipment: "",
      priority: "MEDIA",
      reportedNovelty: "",
      observations: "",
      evidenceFile: null,
    },
  ]);

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
    radicadoConcesionarioDate: "",
    requesterName: "",
    requesterDocument: "",
    requesterRole: "",
    requesterPhone: "",
    requesterEmail: "",
    requesterEmails: ["", "", ""],
    vehicleId: "",
    eventStartAt: "",
    eventEndAt: "",
    cameras: "",
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
        const normalizedItems = novedadItems.map((item) => {
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

          return {
            localKey: item.key,
            busId: item.bus?.id ?? null,
            busCode: item.bus?.code ?? null,
            busPlate: item.bus?.plate ?? null,
            busEquipmentIds: item.busEquipmentIds,
            catalogCode: catalogCode || null,
            affectedEquipment: item.affectedEquipment || null,
            priority: resolvedPriority,
            reportedNovelty: resolvedReportedNovelty,
            observations: item.observations.trim(),
          };
        });

        if (!normalizedItems.length) {
          throw new Error("Debes agregar al menos un bus en la novedad.");
        }

        const invalidIdx = normalizedItems.findIndex((item) => {
          return (
            !item.busId ||
            !item.affectedEquipment ||
            !item.priority ||
            !item.reportedNovelty
          );
        });
        if (invalidIdx >= 0) {
          const bad = normalizedItems[invalidIdx];
          const missing: string[] = [];
          if (!bad.busId) missing.push("bus (selección en lista)");
          if (!bad.affectedEquipment) missing.push("equipo afectado");
          if (!bad.priority) missing.push("prioridad");
          if (!bad.reportedNovelty) missing.push("novedad (catálogo)");

          throw new Error(
            `Registro #${invalidIdx + 1}: completa ${missing.join(", ")}.`
          );
        }

        const fd = new FormData();
        fd.set(
          "payload",
          JSON.stringify({
            type,
            novedadItems: normalizedItems,
          })
        );
        for (const item of novedadItems) {
          if (item.evidenceFile) {
            fd.set(`evidence:${item.key}`, item.evidenceFile);
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
        bus: null,
        busEquipmentIds: [],
        catalogCode: "",
        affectedEquipment: "",
        priority: "MEDIA",
        reportedNovelty: "",
        observations: "",
        evidenceFile: null,
      },
    ]);
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
              {Object.values(CASE_TYPE_REGISTRY)
                .filter((c) => c.type !== "MEJORA_PRODUCTO")
                .map((c) => (
                <option key={c.type} value={c.type}>
                  {c.label}
                </option>
                ))}
            </Select>
          </Field>

          {type !== "NOVEDAD" ? (
            <>
              <Field label="Prioridad">
                <Select value={priority} onChange={(e) => setPriority(e.target.value as any)}>
                  <option value="BAJA">Baja</option>
                  <option value="MEDIA">Media</option>
                  <option value="ALTA">Alta</option>
                </Select>
              </Field>

              {/* Prioridad STS unificada con Prioridad */}

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

              {isRenewalTecnologica ? (
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
              )}
            </>
          ) : (
            <div className="md:col-span-2">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">Novedad masiva (múltiples buses)</p>
                <button type="button" className="sts-btn-ghost h-9 px-3 text-xs" onClick={addNovedadItem}>
                  Agregar bus
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
                        <Field label="Bus (código o placa)">
                          <BusCombobox
                            value={item.bus}
                            onChange={(b) =>
                              updateNovedadItem(item.key, { bus: b, busEquipmentIds: [] })
                            }
                          />
                        </Field>

                        <Field label="Placa (autocompleta)">
                          <Input value={item.bus?.plate ?? ""} placeholder="Se completa al elegir bus" disabled />
                        </Field>

                        <Field label="Equipo afectado">
                          <Select
                            value={item.affectedEquipment}
                            onChange={(e) =>
                              updateNovedadItem(item.key, {
                                affectedEquipment: e.target.value as AffectedEquipmentType | "",
                                catalogCode: "",
                                reportedNovelty: "",
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
                            value={noveltySelectValue}
                            onChange={(e) => {
                              const value = e.target.value;
                              if (!value) {
                                updateNovedadItem(item.key, {
                                  catalogCode: "",
                                  reportedNovelty: "",
                                });
                                return;
                              }

                              if (equipmentCatalog.length) {
                                const selected = equipmentCatalog.find((entry) => entry.code === value);
                                if (selected) {
                                  updateNovedadItem(item.key, {
                                    catalogCode: selected.code,
                                    reportedNovelty: selected.novelty,
                                    priority: mapCatalogPriorityToOption(selected.priorityValue),
                                  });
                                  return;
                                }
                              }

                              updateNovedadItem(item.key, {
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
                          </Select>
                        </Field>

                        <Field label="Código de novedad">
                          <Input
                            value={item.catalogCode}
                            placeholder="Se completa al elegir del catálogo"
                            disabled
                          />
                        </Field>

                        <Field label="Equipo(s) específico(s) del bus" hint="Opcional, para precisión de trazabilidad">
                          <BusEquipmentMultiSelect
                            busId={item.bus?.id ?? null}
                            value={item.busEquipmentIds}
                            onChange={(ids) => updateNovedadItem(item.key, { busEquipmentIds: ids })}
                            disabled={!item.bus?.id}
                          />
                        </Field>
                      </div>
                      {selectedCatalog ? (
                        <div className="mt-2 rounded-lg bg-muted/30 p-2 text-xs text-muted-foreground">
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
                  );
                })}
              </div>
              <div className="mt-2 rounded-lg bg-muted/30 p-2 text-xs text-muted-foreground">
                Al guardar: se registra histórico de novedades, se envía acuse automático y se genera correctivo por validar coordinador por cada novedad.
              </div>
            </div>
          )}
        </div>

        {type !== "NOVEDAD" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Título" hint="Autollenado por tipo, editable">
              <Input value={effectiveTitle} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Descripción" hint="Autollenado por tipo, editable">
              <Textarea rows={3} value={effectiveDescription} onChange={(e) => setDescription(e.target.value)} />
            </Field>
          </div>
        ) : null}
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

            <Field label="Radicado TMSA">
              <Input value={video.radicadoTMSA} onChange={(e) => setVideo((x) => ({ ...x, radicadoTMSA: e.target.value }))} />
            </Field>

            <Field label="Fecha radicado TMSA">
              <DateTimeField value={video.radicadoTMSADate} onChange={(v) => setVideo((x) => ({ ...x, radicadoTMSADate: v }))} />
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
              <Input value={video.cameras} onChange={(e) => setVideo((x) => ({ ...x, cameras: e.target.value }))} />
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
