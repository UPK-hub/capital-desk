// src/app/(tech)/work-orders/[id]/ui/PreventiveReportForm.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import type { PreventiveReport } from "@prisma/client";
import { Select } from "@/components/Field";

type Props = {
  workOrderId: string;
  initialReport: PreventiveReport | null;
  suggestedTicketNumber?: string;
};

type Autofill = {
  biarticuladoNo: string;
  plate: string | null;
  equipmentLabel: string;
};

type ActivityArea = "CAMARAS" | "NVR" | "BATERIA";
type ActivityRow = {
  key: string;
  area: ActivityArea;
  activity: string;
  maintenanceType: "" | "Preventivo" | "Correctivo";
  result?: "" | "FUNCIONAL" | "NO_FUNCIONAL";
  value?: string;
  valueRequired?: boolean;
  photoRequired?: boolean;
  photoPaths?: string[];
  observation?: string;
};

type FormValues = {
  ticketNumber: string;
  workOrderNumber: string;

  biarticuladoNo: string;
  mileage: string;
  plate: string;

  scheduledAt: string;
  executedAt: string;
  rescheduledAt: string;

  activities: ActivityRow[];

  observations: string;
  responsibleUpk: string;
  responsibleCapitalBus: string;

  correctiveFormatsNote: string;
};

function isoDate(d?: Date | null) {
  if (!d) return "";
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return "";
  return x.toISOString().slice(0, 10);
}

function normalizePhotoPaths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((x) => String(x ?? "").trim()).filter(Boolean);
}

function hasText(value: unknown) {
  return String(value ?? "").trim().length > 0;
}

function inputCls() {
  return "app-field-control h-9 w-full min-w-0 rounded-xl border px-3 text-sm focus-visible:outline-none";
}
function textareaCls() {
  return "app-field-control min-h-[88px] w-full rounded-xl border px-3 py-2 text-sm focus-visible:outline-none";
}
function smallInputCls() {
  return "app-field-control h-8 w-full rounded-xl border px-2 text-xs focus-visible:outline-none";
}

function defaultActivities(): ActivityRow[] {
  return [
    { key: "nvr_ping", area: "NVR", activity: "Comprobación NVR (prueba de ping)", maintenanceType: "Preventivo" },
    { key: "nvr_config", area: "NVR", activity: "Verificar óptima configuración", maintenanceType: "Preventivo" },
    { key: "nvr_stream", area: "NVR", activity: "Revisión transmisión de video en tiempo real", maintenanceType: "Preventivo" },
    { key: "nvr_link", area: "NVR", activity: "Revisión enlace remoto vía internet", maintenanceType: "Preventivo" },
    { key: "nvr_funcionamiento", area: "NVR", activity: "Pruebas de funcionamiento NVR", maintenanceType: "Preventivo", result: "" },
    { key: "nvr_foto_vms", area: "NVR", activity: "Foto VMS", maintenanceType: "Preventivo", photoRequired: true },
    { key: "nvr_foto_habitaculo", area: "NVR", activity: "Foto habitáculo", maintenanceType: "Preventivo", photoRequired: true },
    {
      key: "nvr_data_canbus",
      area: "NVR",
      activity: "Generación de data (recepción de datos CANBUS)",
      maintenanceType: "Preventivo",
      photoRequired: true,
    },

    { key: "cctv_limpieza_general", area: "CAMARAS", activity: "Limpieza general", maintenanceType: "Preventivo" },
    { key: "cctv_conectores", area: "CAMARAS", activity: "Verificar y limpiar conectores", maintenanceType: "Preventivo" },
    { key: "cctv_ping", area: "CAMARAS", activity: "Comprobación NVR (prueba de ping)", maintenanceType: "Preventivo" },
    { key: "cctv_angulos", area: "CAMARAS", activity: "Verificar ángulos de cobertura", maintenanceType: "Preventivo" },
    { key: "cctv_funcionamiento", area: "CAMARAS", activity: "Pruebas de funcionamiento del CCTV", maintenanceType: "Preventivo", result: "" },

    {
      key: "bateria_voltaje",
      area: "BATERIA",
      activity: "Voltaje baterías",
      maintenanceType: "Preventivo",
      value: "",
      valueRequired: true,
      photoRequired: true,
    },
  ];
}

function inferKey(row: Partial<ActivityRow>, idx: number) {
  const key = String(row?.key ?? "").trim();
  if (key) return key;
  const label = String(row?.activity ?? "").trim().toLowerCase();
  if (label.includes("foto vms")) return "nvr_foto_vms";
  if (label.includes("habitaculo")) return "nvr_foto_habitaculo";
  if (label.includes("canbus") || label.includes("data")) return "nvr_data_canbus";
  if (label.includes("voltaje bater")) return "bateria_voltaje";
  return `actividad_${idx + 1}`;
}

function normalizeActivities(rows: ActivityRow[]): ActivityRow[] {
  const defaults = defaultActivities();
  const incoming = Array.isArray(rows) ? rows : [];
  const byKey = new Map<string, ActivityRow>();

  incoming.forEach((raw, idx) => {
    const key = inferKey(raw, idx);
    byKey.set(key, {
      ...raw,
      key,
      photoPaths: normalizePhotoPaths((raw as any)?.photoPaths),
    });
  });

  const mergedDefaults = defaults.map((d, idx) => {
    const fromSaved = byKey.get(d.key);
    return {
      ...d,
      ...fromSaved,
      key: d.key,
      area: d.area,
      activity: fromSaved?.activity ?? d.activity,
      maintenanceType: fromSaved?.maintenanceType ?? d.maintenanceType,
      result: fromSaved?.result === "NO_FUNCIONAL" ? "NO_FUNCIONAL" : "FUNCIONAL",
      value: fromSaved?.value ?? d.value ?? "",
      valueRequired: d.valueRequired ?? fromSaved?.valueRequired ?? /voltaje/i.test(d.activity),
      photoRequired: d.photoRequired ?? fromSaved?.photoRequired ?? false,
      photoPaths: normalizePhotoPaths((fromSaved as any)?.photoPaths),
      observation: fromSaved?.observation ?? "",
    } as ActivityRow;
  });

  const defaultKeys = new Set(defaults.map((d) => d.key));
  const extras = incoming
    .map((raw, idx) => {
      const key = inferKey(raw, idx);
      if (defaultKeys.has(key)) return null;
      return {
        ...raw,
        key,
        result: raw?.result === "NO_FUNCIONAL" ? "NO_FUNCIONAL" : "FUNCIONAL",
        valueRequired: raw?.valueRequired ?? /voltaje/i.test(raw?.activity ?? ""),
        photoRequired: raw?.photoRequired ?? false,
        photoPaths: normalizePhotoPaths((raw as any)?.photoPaths),
      } as ActivityRow;
    })
    .filter(Boolean) as ActivityRow[];

  return [...mergedDefaults, ...extras];
}

const AREA_RENDER_ORDER: Record<ActivityRow["area"], number> = {
  NVR: 0,
  CAMARAS: 1,
  BATERIA: 2,
};

export default function PreventiveReportForm(props: Props) {
  return (
    <PreventiveReportErrorBoundary>
      <PreventiveReportFormInner {...props} />
    </PreventiveReportErrorBoundary>
  );
}

class PreventiveReportErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: null };
  }

  static getDerivedStateFromError(error: unknown) {
    const msg = error instanceof Error ? error.message : "Error inesperado en el formulario preventivo.";
    return { hasError: true, message: msg };
  }

  componentDidCatch(error: unknown) {
    console.error("PreventiveReportForm crashed", error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="sts-card p-5">
        <h3 className="text-base font-semibold">Ocurrió un error en el formulario preventivo</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {this.state.message ?? "No se pudo renderizar el formulario."}
        </p>
        <button
          type="button"
          className="mt-4 sts-btn-primary text-sm"
          onClick={() => window.location.reload()}
        >
          Recargar página
        </button>
      </div>
    );
  }
}

function PreventiveReportFormInner(props: Props) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState<string | null>(null);

  const [autofill, setAutofill] = React.useState<Autofill>({
    biarticuladoNo: "",
    plate: null,
    equipmentLabel: "",
  });
  const [photoFilesByKey, setPhotoFilesByKey] = React.useState<Record<string, FileList | null>>({});

  const r = props.initialReport;

  const form = useForm<FormValues>({
    defaultValues: {
      ticketNumber: r?.ticketNumber ?? props.suggestedTicketNumber ?? "",
      workOrderNumber: r?.workOrderNumber ?? "",

      biarticuladoNo: r?.biarticuladoNo ?? "",
      mileage: r?.mileage ?? "",
      plate: r?.plate ?? "",

      scheduledAt: isoDate(r?.scheduledAt),
      executedAt: isoDate(r?.executedAt),
      rescheduledAt: isoDate(r?.rescheduledAt),

      activities: Array.isArray(r?.activities)
        ? normalizeActivities((r!.activities as unknown) as ActivityRow[])
        : normalizeActivities(defaultActivities()),

      observations: r?.observations ?? "",
      responsibleUpk: (r as any)?.responsibleUpk ?? "",
      responsibleCapitalBus: r?.responsibleCapitalBus ?? "",

      correctiveFormatsNote: "",
    },
  });

  // Cargar autofill desde GET /preventive-report y setear campos si están vacíos
  React.useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setMsg(null);

      const res = await fetch(`/api/work-orders/${props.workOrderId}/preventive-report`, { method: "GET" });
      const data = await res.json().catch(() => ({}));

      if (!alive) return;

      if (!res.ok) {
        setLoading(false);
        setMsg(data?.error ?? "No se pudo cargar el formato");
        return;
      }

      const biarticuladoNo = String(data?.autofill?.biarticuladoNo ?? "").trim();
      const plate = (data?.autofill?.plate ?? null) as string | null;
      const equipmentLabel = String(data?.autofill?.equipmentLabel ?? "").trim();
      const scheduledAtAutofill = data?.autofill?.scheduledAt ? isoDate(new Date(data.autofill.scheduledAt)) : "";
      const rescheduledAtAutofill = data?.autofill?.rescheduledAt ? isoDate(new Date(data.autofill.rescheduledAt)) : "";
      setAutofill({ biarticuladoNo, plate, equipmentLabel });

      const curr = form.getValues();
      const patch: Partial<FormValues> = {};

      if (!curr.biarticuladoNo?.trim()) patch.biarticuladoNo = biarticuladoNo;
      if (!curr.plate?.trim() && plate) patch.plate = plate;
      if (!curr.scheduledAt?.trim() && scheduledAtAutofill) patch.scheduledAt = scheduledAtAutofill;
      if (!curr.rescheduledAt?.trim() && rescheduledAtAutofill) patch.rescheduledAt = rescheduledAtAutofill;

      if (Object.keys(patch).length) form.reset({ ...curr, ...patch });

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.workOrderId]);

  const activitiesFA = useFieldArray({ control: form.control, name: "activities" });
  const watchedActivities = form.watch("activities");
  const orderedActivityIndexes = React.useMemo(() => {
    return activitiesFA.fields
      .map((_, idx) => idx)
      .sort((a, b) => {
        const areaA = watchedActivities?.[a]?.area ?? (activitiesFA.fields[a] as any)?.area ?? "CAMARAS";
        const areaB = watchedActivities?.[b]?.area ?? (activitiesFA.fields[b] as any)?.area ?? "CAMARAS";
        const rankA = AREA_RENDER_ORDER[areaA as ActivityRow["area"]] ?? 99;
        const rankB = AREA_RENDER_ORDER[areaB as ActivityRow["area"]] ?? 99;
        if (rankA !== rankB) return rankA - rankB;
        return a - b;
      });
  }, [activitiesFA.fields, watchedActivities]);

  async function uploadActivityPhotos(activityKey: string, files: FileList | null) {
    if (!files?.length) return 0;
    let count = 0;
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.set("activityKey", activityKey);
      fd.set("photo", file);
      const res = await fetch(`/api/work-orders/${props.workOrderId}/preventive-report`, {
        method: "PUT",
        body: fd,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "No se pudo subir evidencia");
      }
      const nextActivities = Array.isArray(data?.report?.activities)
        ? normalizeActivities(data.report.activities as ActivityRow[])
        : null;
      if (nextActivities) {
        form.setValue("activities", nextActivities, { shouldDirty: true });
      }
      count += 1;
    }
    return count;
  }

  async function onSubmit(v: FormValues) {
    setSaving(true);
    setMsg(null);
    try {
      const payload = {
        ...v,
        ticketNumber: v.ticketNumber.trim(),
        workOrderNumber: v.workOrderNumber.trim(),

        biarticuladoNo: v.biarticuladoNo.trim(),
        mileage: v.mileage.trim(),
        plate: v.plate.trim(),

        scheduledAt: v.scheduledAt || null,
        executedAt: v.executedAt || null,
        rescheduledAt: v.rescheduledAt || null,

        activities: v.activities,

        observations: v.observations.trim(),
        responsibleUpk: v.responsibleUpk.trim(),
        responsibleCapitalBus: v.responsibleCapitalBus.trim(),
      };

      const res = await fetch(`/api/work-orders/${props.workOrderId}/preventive-report`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data?.error ?? "No se pudo guardar");
        return;
      }

      let uploadedCount = 0;
      for (const row of v.activities) {
        const files = photoFilesByKey[row.key] ?? null;
        if (!files?.length) continue;
        uploadedCount += await uploadActivityPhotos(row.key, files);
      }

      setPhotoFilesByKey({});
      setMsg(uploadedCount > 0 ? `Guardado correctamente (${uploadedCount} foto(s) cargada(s)).` : "Guardado correctamente");
      try {
        router.refresh();
      } catch (err) {
        console.error("No se pudo refrescar la vista de OT", err);
      }
    } catch (e: any) {
      setMsg(e?.message ?? "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="sts-card p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Formato Preventivo (inline)</h3>
            <p className="text-xs text-muted-foreground">
              Estructura basada en CAP-FO-M-PV-001 (tabla dispositivos y actividades). Campos opcionales.
            </p>
            {autofill.equipmentLabel ? (
              <p className="mt-1 text-[11px] text-muted-foreground">Equipo: {autofill.equipmentLabel}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={form.handleSubmit(onSubmit)}
            disabled={saving || loading}
            className="sts-btn-primary text-sm disabled:opacity-50"
          >
            {loading ? "Cargando..." : saving ? "Guardando..." : "Guardar"}
          </button>
        </div>

        {msg ? <div className="mt-3 rounded-md border p-3 text-sm">{msg}</div> : null}
      </div>

      <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
        {/* DATOS DEL BIARTICULADO */}
        <section className="sts-card p-4 md:p-5">
          <h4 className="text-sm font-semibold">Datos del biarticulado</h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground">Número de ticket</label>
              <input className={inputCls()} readOnly {...form.register("ticketNumber")} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Orden de trabajo No.</label>
              <input className={inputCls()} {...form.register("workOrderNumber")} />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">No. Biarticulado TM</label>
              <input className={inputCls()} {...form.register("biarticuladoNo")} />
              <p className="mt-1 text-[11px] text-muted-foreground">Sugerido: {autofill.biarticuladoNo || "—"}</p>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Kilometraje</label>
              <input className={inputCls()} {...form.register("mileage")} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Placa</label>
              <input className={inputCls()} {...form.register("plate")} />
              <p className="mt-1 text-[11px] text-muted-foreground">Sugerido: {autofill.plate ?? "—"}</p>
            </div>
          </div>
        </section>

        {/* PROGRAMACIÓN */}
        <section className="sts-card p-4 md:p-5">
          <h4 className="text-sm font-semibold">Programación del mantenimiento</h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="text-xs text-muted-foreground">Fecha programada</label>
              <input type="date" className={inputCls()} {...form.register("scheduledAt")} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Fecha ejecutada</label>
              <input type="date" className={inputCls()} {...form.register("executedAt")} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Fecha reprogramación</label>
              <input type="date" className={inputCls()} {...form.register("rescheduledAt")} />
            </div>
          </div>
        </section>

        {/* TABLA DISPOSITIVOS (removida por solicitud) */}

        {/* ACTIVIDADES + EVIDENCIAS */}
        <section className="sts-card p-4 md:p-5">
          <h4 className="text-sm font-semibold">Tareas del preventivo (NVR → Cámaras → Batería)</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Evidencia obligatoria para cierre: VMS, habitáculo, CANBUS y batería (foto + valor escrito).
          </p>

          <div className="mt-3 hidden md:block overflow-x-auto">
            <table className="w-full min-w-[980px] table-fixed">
              <thead className="border-b border-border/50 bg-muted/20 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-14 p-3 text-left">OK</th>
                  <th className="w-24 p-3 text-left">Área</th>
                  <th className="p-3 text-left">Tarea</th>
                  <th className="w-40 p-3 text-left">Tipo</th>
                  <th className="w-44 p-3 text-left">Estado</th>
                  <th className="w-36 p-3 text-left">Valor</th>
                  <th className="w-56 p-3 text-left">Evidencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {orderedActivityIndexes.map((idx) => {
                  const field = activitiesFA.fields[idx] as any;
                  const rowKey = String(form.watch(`activities.${idx}.key`) ?? field.key ?? "");
                  const result = String(form.watch(`activities.${idx}.result`) ?? "");
                  const value = String(form.watch(`activities.${idx}.value`) ?? "");
                  const valueRequired = Boolean(field.valueRequired);
                  const photoRequired = Boolean(field.photoRequired);
                  const existingPhotos = normalizePhotoPaths(form.watch(`activities.${idx}.photoPaths`) as any);
                  const pendingPhotos = photoFilesByKey[rowKey];
                  const hasPhoto = existingPhotos.length > 0 || Boolean(pendingPhotos?.length);
                  const done = result === "FUNCIONAL" && (!valueRequired || hasText(value)) && (!photoRequired || hasPhoto);

                  return (
                    <React.Fragment key={field.id}>
                      <tr className="align-top hover:bg-muted/30">
                        <td className="p-3">
                          <input type="hidden" {...form.register(`activities.${idx}.key`)} />
                          <input type="checkbox" checked={done} readOnly className="h-4 w-4 rounded border" />
                        </td>
                        <td className="p-3">
                          <input className={inputCls()} readOnly {...form.register(`activities.${idx}.area`)} />
                        </td>
                        <td className="p-3">
                          <input className={inputCls()} {...form.register(`activities.${idx}.activity`)} />
                        </td>
                        <td className="p-3">
                          <Select className="app-field-control h-9 w-full rounded-xl border px-3 text-sm" {...form.register(`activities.${idx}.maintenanceType`)}>
                            <option value="">—</option>
                            <option value="Preventivo">Preventivo</option>
                            <option value="Correctivo">Correctivo</option>
                          </Select>
                        </td>
                        <td className="p-3">
                          <Select className="app-field-control h-9 w-full rounded-xl border px-3 text-sm" {...form.register(`activities.${idx}.result`)}>
                            <option value="">—</option>
                            <option value="FUNCIONAL">Funcional</option>
                            <option value="NO_FUNCIONAL">No funcional</option>
                          </Select>
                        </td>
                        <td className="p-3">
                          <input
                            className={inputCls()}
                            placeholder={valueRequired ? "Ej: 24.5 V" : "—"}
                            disabled={!valueRequired}
                            {...form.register(`activities.${idx}.value`)}
                          />
                        </td>
                        <td className="p-3">
                          {photoRequired ? (
                            <div className="space-y-1.5">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  const files = e.currentTarget.files;
                                  setPhotoFilesByKey((prev) => ({
                                    ...prev,
                                    [rowKey]: files,
                                  }));
                                }}
                                className="block w-full text-xs"
                              />
                              {existingPhotos.length ? (
                                <p className="text-[11px] text-muted-foreground">Guardadas: {existingPhotos.length}</p>
                              ) : (
                                <p className="text-[11px] text-amber-700">Pendiente foto.</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">No aplica</span>
                          )}
                        </td>
                      </tr>
                      {result === "NO_FUNCIONAL" ? (
                        <tr className="bg-muted/20">
                          <td className="p-3 text-xs text-muted-foreground" colSpan={2}>
                            Observación
                          </td>
                          <td className="p-3" colSpan={5}>
                            <input
                              className={smallInputCls()}
                              placeholder="Describe la novedad"
                              {...form.register(`activities.${idx}.observation`)}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 space-y-3 md:hidden">
            {orderedActivityIndexes.map((idx) => {
              const field = activitiesFA.fields[idx] as any;
              const rowKey = String(form.watch(`activities.${idx}.key`) ?? field.key ?? "");
              const result = String(form.watch(`activities.${idx}.result`) ?? "");
              const valueRequired = Boolean(field.valueRequired);
              const photoRequired = Boolean(field.photoRequired);
              const existingPhotos = normalizePhotoPaths(form.watch(`activities.${idx}.photoPaths`) as any);
              const pendingPhotos = photoFilesByKey[rowKey];
              const hasPhoto = existingPhotos.length > 0 || Boolean(pendingPhotos?.length);
              const value = String(form.watch(`activities.${idx}.value`) ?? "");
              const done = result === "FUNCIONAL" && (!valueRequired || hasText(value)) && (!photoRequired || hasPhoto);

              return (
                <div key={field.id} className="rounded-xl border border-border/60 bg-card p-3 space-y-2">
                  <input type="hidden" {...form.register(`activities.${idx}.key`)} />
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">{String(form.watch(`activities.${idx}.area`) ?? field.area)}</p>
                      <p className="text-sm font-medium">{String(form.watch(`activities.${idx}.activity`) ?? field.activity)}</p>
                    </div>
                    <input type="checkbox" checked={done} readOnly className="mt-0.5 h-4 w-4 rounded border" />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-muted-foreground">Tipo</label>
                      <Select className="app-field-control h-9 w-full rounded-xl border px-3 text-sm" {...form.register(`activities.${idx}.maintenanceType`)}>
                        <option value="">—</option>
                        <option value="Preventivo">Preventivo</option>
                        <option value="Correctivo">Correctivo</option>
                      </Select>
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground">Estado</label>
                      <Select className="app-field-control h-9 w-full rounded-xl border px-3 text-sm" {...form.register(`activities.${idx}.result`)}>
                        <option value="">—</option>
                        <option value="FUNCIONAL">Funcional</option>
                        <option value="NO_FUNCIONAL">No funcional</option>
                      </Select>
                    </div>
                  </div>

                  {valueRequired ? (
                    <div>
                      <label className="text-[11px] text-muted-foreground">Valor (escrito)</label>
                      <input className={inputCls()} placeholder="Ej: 24.5 V" {...form.register(`activities.${idx}.value`)} />
                    </div>
                  ) : null}

                  {photoRequired ? (
                    <div>
                      <label className="text-[11px] text-muted-foreground">Evidencia</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const files = e.currentTarget.files;
                          setPhotoFilesByKey((prev) => ({
                            ...prev,
                            [rowKey]: files,
                          }));
                        }}
                        className="mt-1 block w-full text-xs"
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {existingPhotos.length ? `Guardadas: ${existingPhotos.length}` : "Pendiente foto."}
                      </p>
                    </div>
                  ) : null}

                  {result === "NO_FUNCIONAL" ? (
                    <div>
                      <label className="text-[11px] text-muted-foreground">Observación</label>
                      <input
                        className={smallInputCls()}
                        placeholder="Describe la novedad"
                        {...form.register(`activities.${idx}.observation`)}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <p className="mt-2 text-[11px] text-muted-foreground">Las evidencias se cargan al guardar.</p>
        </section>

        {/* OBSERVACIONES + TIEMPO + RESPONSABLES */}
        <section className="sts-card p-4 md:p-5">
          <h4 className="text-sm font-semibold">Cierre</h4>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">Observaciones</label>
              <textarea className={textareaCls()} {...form.register("observations")} />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Responsable UPK</label>
              <input className={inputCls()} {...form.register("responsibleUpk")} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Responsable Capital Bus</label>
              <input className={inputCls()} {...form.register("responsibleCapitalBus")} />
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">Nota: consecutivos formatos correctivos / tickets asociados (si aplica)</label>
              <textarea className={textareaCls()} {...form.register("correctiveFormatsNote")} />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Si hubo correctivos durante el preventivo, aquí dejas el consecutivo de formatos y tickets asociados.
              </p>
            </div>
          </div>
        </section>

        <button type="submit" className="hidden" />
      </form>
    </div>
  );
}
