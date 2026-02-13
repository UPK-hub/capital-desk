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

type ActivityRow = {
  area: "CCTV" | "NVR" | "ENERGIA";
  activity: string;
  maintenanceType: "" | "Preventivo" | "Correctivo";
  result?: "" | "FUNCIONAL" | "NO_FUNCIONAL";
  value?: string;
  valueRequired?: boolean;
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
  timeStart: string;
  timeEnd: string;
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

function inputCls() {
  return "app-field-control h-9 w-full min-w-0 rounded-xl border px-3 text-sm outline-none focus:ring-2 focus:ring-black/10";
}
function textareaCls() {
  return "app-field-control min-h-[88px] w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10";
}
function smallInputCls() {
  return "app-field-control h-8 w-full rounded-xl border px-2 text-xs outline-none focus:ring-2 focus:ring-black/10";
}

function defaultActivities(): ActivityRow[] {
  return [
    { area: "CCTV", activity: "Limpieza general", maintenanceType: "Preventivo" },
    { area: "CCTV", activity: "Verificar y limpiar conectores", maintenanceType: "Preventivo" },
    { area: "CCTV", activity: "Comprobación NVR (prueba de ping)", maintenanceType: "Preventivo" },
    { area: "CCTV", activity: "Verificar ángulos de cobertura", maintenanceType: "Preventivo" },
    { area: "CCTV", activity: "Pruebas de funcionamiento del CCTV", maintenanceType: "Preventivo", result: "" },

    { area: "NVR", activity: "Limpieza general", maintenanceType: "Preventivo" },
    { area: "NVR", activity: "Revisión del equipo NVR y parámetros de grabación", maintenanceType: "Preventivo" },
    { area: "NVR", activity: "Verificar óptima configuración (ahorrar espacio DD)", maintenanceType: "Preventivo" },
    { area: "NVR", activity: "Revisión transmisión video en tiempo real", maintenanceType: "Preventivo" },
    { area: "NVR", activity: "Revisión enlace remoto vía internet", maintenanceType: "Preventivo" },
    { area: "NVR", activity: "Revisión versiones de software", maintenanceType: "Preventivo" },
    { area: "NVR", activity: "Pruebas de funcionamiento", maintenanceType: "Preventivo", result: "" },

    { area: "ENERGIA", activity: "NVR encendida (voltaje hacia NVR desde tarjeta)", maintenanceType: "Preventivo", value: "", valueRequired: true },
    { area: "ENERGIA", activity: "Voltaje baterías respaldo (master apagado)", maintenanceType: "Preventivo", value: "", valueRequired: true },
    { area: "ENERGIA", activity: "Switch encendido (voltaje hacia Switch)", maintenanceType: "Preventivo", value: "", valueRequired: true },
    { area: "ENERGIA", activity: "Voltaje controlador de cargas", maintenanceType: "Preventivo", value: "", valueRequired: true },
  ];
}

function normalizeActivities(rows: ActivityRow[]): ActivityRow[] {
  return rows.map((r) => ({
    ...r,
    result: r.result === "NO_FUNCIONAL" ? "NO_FUNCIONAL" : "FUNCIONAL",
    valueRequired: r.valueRequired ?? /voltaje/i.test(r.activity),
  }));
}

const AREA_RENDER_ORDER: Record<ActivityRow["area"], number> = {
  NVR: 0,
  CCTV: 1,
  ENERGIA: 2,
};

export default function PreventiveReportForm(props: Props) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState<string | null>(null);

  const [autofill, setAutofill] = React.useState<Autofill>({
    biarticuladoNo: "",
    plate: null,
    equipmentLabel: "",
  });

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
      timeStart: r?.timeStart ?? "",
      timeEnd: r?.timeEnd ?? "",
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
      setAutofill({ biarticuladoNo, plate, equipmentLabel });

      const curr = form.getValues();
      const patch: Partial<FormValues> = {};

      if (!curr.biarticuladoNo?.trim()) patch.biarticuladoNo = biarticuladoNo;
      if (!curr.plate?.trim() && plate) patch.plate = plate;

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
        const areaA = watchedActivities?.[a]?.area ?? (activitiesFA.fields[a] as any)?.area ?? "CCTV";
        const areaB = watchedActivities?.[b]?.area ?? (activitiesFA.fields[b] as any)?.area ?? "CCTV";
        const rankA = AREA_RENDER_ORDER[areaA as ActivityRow["area"]] ?? 99;
        const rankB = AREA_RENDER_ORDER[areaB as ActivityRow["area"]] ?? 99;
        if (rankA !== rankB) return rankA - rankB;
        return a - b;
      });
  }, [activitiesFA.fields, watchedActivities]);

  async function onSubmit(v: FormValues) {
    setSaving(true);
    setMsg(null);

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
      timeStart: v.timeStart.trim(),
      timeEnd: v.timeEnd.trim(),
      responsibleUpk: v.responsibleUpk.trim(),
      responsibleCapitalBus: v.responsibleCapitalBus.trim(),
    };

    const res = await fetch(`/api/work-orders/${props.workOrderId}/preventive-report`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      setMsg(data?.error ?? "No se pudo guardar");
      return;
    }

    setMsg("Guardado correctamente");
    router.refresh();
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

        {/* ACTIVIDADES + VOLTAJES */}
        <section className="sts-card p-4 md:p-5">
          <h4 className="text-sm font-semibold">Actividades mantenimiento preventivo</h4>

          <div className="mt-3">
            <table className="w-full sts-table sts-table-compact">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 text-left">Área</th>
                  <th className="py-2 text-left">Actividad</th>
                  <th className="py-2 text-left">Tipo mantenimiento</th>
                  <th className="py-2 text-left">Resultado</th>
                  <th className="py-2 text-left">Valor</th>
                </tr>
              </thead>
              <tbody>
                {orderedActivityIndexes.map((idx) => {
                  const f = activitiesFA.fields[idx];
                  const result = form.watch(`activities.${idx}.result`);
                  const valueRequired = Boolean((f as any).valueRequired);

                  return (
                    <React.Fragment key={f.id}>
                      <tr className="border-b align-top">
                        <td className="py-2 pr-2">
                          <input className={inputCls()} readOnly {...form.register(`activities.${idx}.area`)} />
                        </td>
                        <td className="py-2 pr-2">
                          <input className={inputCls()} {...form.register(`activities.${idx}.activity`)} />
                        </td>
                        <td className="py-2 pr-2">
                          <Select className={inputCls()} {...form.register(`activities.${idx}.maintenanceType`)}>
                            <option value="">—</option>
                            <option value="Preventivo">Preventivo</option>
                            <option value="Correctivo">Correctivo</option>
                          </Select>
                        </td>
                        <td className="py-2 pr-2">
                          <Select className={inputCls()} {...form.register(`activities.${idx}.result`)}>
                            <option value="">—</option>
                            <option value="FUNCIONAL">Funcional</option>
                            <option value="NO_FUNCIONAL">No funcional</option>
                          </Select>
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            className={inputCls()}
                            placeholder={valueRequired ? "Ingresa voltaje" : "—"}
                            disabled={!valueRequired}
                            {...form.register(`activities.${idx}.value`)}
                          />
                        </td>
                      </tr>

                      {result === "NO_FUNCIONAL" ? (
                        <tr className="border-b last:border-b-0">
                          <td className="py-2 pr-2 text-xs text-muted-foreground">Observación</td>
                          <td className="py-2 pr-2" colSpan={4}>
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

          {/* Se elimina bloque de voltajes debajo de actividades */}
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
              <label className="text-xs text-muted-foreground">Hora inicio</label>
              <input type="time" className={inputCls()} {...form.register("timeStart")} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Hora fin</label>
              <input type="time" className={inputCls()} {...form.register("timeEnd")} />
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
