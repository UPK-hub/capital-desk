// src/app/(tech)/work-orders/[id]/ui/PreventiveReportForm.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import type { PreventiveReport } from "@prisma/client";

type Props = {
  workOrderId: string;
  initialReport: PreventiveReport | null;
};

type Autofill = {
  biarticuladoNo: string;
  plate: string | null;
  equipmentLabel: string;
  equipments: Array<{
    id: string;
    type: string;
    serial: string | null;
    location: string | null;
  }>;
};

type DeviceRow = {
  description: string;
  brand: string;
  reference: string;
  location: string;
  portNvr: boolean;
  portSwitch: boolean;
  portCollector: boolean;
  portData: boolean;
  portEnergyCard: boolean;
  serial: string;
  ip: string;
  newSerial: string;
};

type ActivityRow = {
  area: "CCTV" | "NVR" | "COLECTOR" | "ENERGIA";
  activity: string;
  maintenanceType: "" | "Preventivo" | "Correctivo";
  value?: string;
  result?: "" | "BUENO" | "MALO" | "X";
};

type FormValues = {
  ticketNumber: string;
  workOrderNumber: string;

  biarticuladoNo: string;
  productionSp: string;
  mileage: string;
  plate: string;

  scheduledAt: string;
  executedAt: string;
  rescheduledAt: string;

  devicesInstalled: DeviceRow[];
  activities: ActivityRow[];

  voltageNvrFromCard: string;
  voltageCollectorFromCard: string;
  voltageBatteriesMasterOff: string;
  voltageCardMasterOn: string;
  voltageCardMasterOff: string;
  voltageSwitch: string;
  voltageCardBusOpen: string;
  commCableState: string;

  observations: string;
  timeStart: string;
  timeEnd: string;
  responsibleSkg: string;
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
  return "h-10 w-full rounded-md border px-3 text-sm outline-none focus:ring-2 focus:ring-black/10";
}
function textareaCls() {
  return "min-h-[88px] w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10";
}

function defaultDevices(): DeviceRow[] {
  const rows: Array<Pick<DeviceRow, "description" | "brand" | "location">> = [
    { description: "Cámara Conductor", brand: "Hikvision", location: "BO" },
    { description: "Cámara Delantera", brand: "Hikvision", location: "BFE" },
    { description: "Cámaras Vagón 1-1", brand: "Hikvision", location: "BV1-1" },
    { description: "Cámaras Vagón 1-2", brand: "Hikvision", location: "BV1-2" },
    { description: "Cámaras Vagón 1-3", brand: "Hikvision", location: "BV1-3" },
    { description: "Cámaras Vagón 1-4", brand: "Hikvision", location: "BV1-4" },
    { description: "Cámaras Vagón 2-1", brand: "Hikvision", location: "BV2-1" },
    { description: "Cámaras Vagón 2-2", brand: "Hikvision", location: "BV2-2" },
    { description: "Cámaras Vagón 3-1", brand: "Hikvision", location: "BV3-1" },
    { description: "Cámaras Vagón 3-2", brand: "Hikvision", location: "BV3-2" },
    { description: "Cámaras Vagón 3-3", brand: "Hikvision", location: "BV3-3" },
    { description: "Cámaras Vagón 3-4", brand: "Hikvision", location: "BV3-4" },
    { description: "Cámara Trasera", brand: "Hikvision", location: "BTE" },
    { description: "Grabador de video (NVR)", brand: "Hikvision", location: "Gabinete equipos" },
    { description: "Conversor analítica cámara conductor", brand: "Hikvision", location: "Gabinete equipos" },
    { description: "Switch", brand: "Sevencom", location: "Fuelle Vagón 2-3" },
    { description: "Colector de Datos", brand: "Nexcom", location: "Gabinete equipos" },
    { description: "Batería 1", brand: "Enercom", location: "" },
    { description: "Batería 2", brand: "Enercom", location: "" },
    { description: "Tarjeta de Energía", brand: "Enercom", location: "Gabinete equipos" },
  ];

  return rows.map((r) => ({
    description: r.description,
    brand: r.brand,
    reference: "",
    location: r.location,
    portNvr: false,
    portSwitch: false,
    portCollector: false,
    portData: false,
    portEnergyCard: false,
    serial: "",
    ip: "",
    newSerial: "",
  }));
}

function devicesFromEquipment(
  items: Array<{ id: string; type: string; serial: string | null; location: string | null }>
): DeviceRow[] {
  return items.map((it) => ({
    description: it.type || "Equipo",
    brand: "",
    reference: "",
    location: it.location ?? "",
    portNvr: false,
    portSwitch: false,
    portCollector: false,
    portData: false,
    portEnergyCard: false,
    serial: it.serial ?? "",
    ip: "",
    newSerial: "",
  }));
}

function defaultActivities(): ActivityRow[] {
  return [
    { area: "CCTV", activity: "Limpieza general", maintenanceType: "Preventivo" },
    { area: "CCTV", activity: "Verificar y limpiar conectores", maintenanceType: "Preventivo" },
    { area: "CCTV", activity: "Revisar voltaje de fuentes de alimentación cámaras, validar voltajes", maintenanceType: "Preventivo" },
    { area: "CCTV", activity: "Comprobación desde la NVR (desconectar Colector y prueba de ping)", maintenanceType: "Preventivo" },
    { area: "CCTV", activity: "Verificar ángulos de cobertura (interventoría y TMSA)", maintenanceType: "Preventivo" },
    { area: "CCTV", activity: "Pruebas de funcionamiento del CCTV", maintenanceType: "Preventivo", result: "" },

    { area: "NVR", activity: "Limpieza general", maintenanceType: "Preventivo" },
    { area: "NVR", activity: "Revisión del equipo NVR y parámetros de grabación", maintenanceType: "Preventivo" },
    { area: "NVR", activity: "Verificar óptima configuración (ahorrar espacio DD)", maintenanceType: "Preventivo" },
    { area: "NVR", activity: "Revisión transmisión video en tiempo real", maintenanceType: "Preventivo" },
    { area: "NVR", activity: "Revisión enlace remoto vía internet", maintenanceType: "Preventivo" },
    { area: "NVR", activity: "Revisión versiones de software", maintenanceType: "Preventivo" },
    { area: "NVR", activity: "Revisión fuente de poder", maintenanceType: "Preventivo" },
    { area: "NVR", activity: "Pruebas de funcionamiento", maintenanceType: "Preventivo", result: "" },

    { area: "COLECTOR", activity: "Limpieza general", maintenanceType: "Preventivo" },
    { area: "COLECTOR", activity: "Verificar firmware", maintenanceType: "Preventivo" },
    { area: "COLECTOR", activity: "Validación espacio de almacenamiento", maintenanceType: "Preventivo" },
    { area: "COLECTOR", activity: "Revisión transmisión videos (pánico/colisión) al Data Center", maintenanceType: "Preventivo" },
    { area: "COLECTOR", activity: "Control de versión de software", maintenanceType: "Preventivo" },
    { area: "COLECTOR", activity: "Revisión fuente de poder", maintenanceType: "Preventivo" },
    { area: "COLECTOR", activity: "Verificar comunicación con CAN Bus", maintenanceType: "Preventivo" },
    { area: "COLECTOR", activity: "Verificar funcionamiento", maintenanceType: "Preventivo", result: "" },

    { area: "ENERGIA", activity: "NVR Encendida (voltaje hacia NVR desde tarjeta)", maintenanceType: "Preventivo", value: "" },
    { area: "ENERGIA", activity: "Colector Encendido (voltaje hacia Colector desde tarjeta)", maintenanceType: "Preventivo", value: "" },
    { area: "ENERGIA", activity: "Voltaje baterías respaldo (master apagado)", maintenanceType: "Preventivo", value: "" },
    { area: "ENERGIA", activity: "Voltaje tarjeta (master encendido)", maintenanceType: "Preventivo", value: "" },
    { area: "ENERGIA", activity: "Voltaje tarjeta (master apagado)", maintenanceType: "Preventivo", value: "" },
    { area: "ENERGIA", activity: "Switch encendido (voltaje hacia Switch)", maintenanceType: "Preventivo", value: "" },
    { area: "ENERGIA", activity: "Voltaje tarjeta energía con switch bus abierto", maintenanceType: "Preventivo", value: "" },
    { area: "ENERGIA", activity: "Estado cable comunicación NVR ↔ Colector", maintenanceType: "Preventivo", result: "" },
  ];
}

export default function PreventiveReportForm(props: Props) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState<string | null>(null);

  const [autofill, setAutofill] = React.useState<Autofill>({
    biarticuladoNo: "",
    plate: null,
    equipmentLabel: "",
    equipments: [],
  });

  const r = props.initialReport;

  const form = useForm<FormValues>({
    defaultValues: {
      ticketNumber: r?.ticketNumber ?? "",
      workOrderNumber: r?.workOrderNumber ?? "",

      biarticuladoNo: r?.biarticuladoNo ?? "",
      productionSp: r?.productionSp ?? "",
      mileage: r?.mileage ?? "",
      plate: r?.plate ?? "",

      scheduledAt: isoDate(r?.scheduledAt),
      executedAt: isoDate(r?.executedAt),
      rescheduledAt: isoDate(r?.rescheduledAt),

      devicesInstalled: Array.isArray(r?.devicesInstalled) ? ((r!.devicesInstalled as unknown) as DeviceRow[]) : [],
      activities: Array.isArray(r?.activities) ? ((r!.activities as unknown) as ActivityRow[]) : defaultActivities(),

      voltageNvrFromCard: r?.voltageNvrFromCard ?? "",
      voltageCollectorFromCard: r?.voltageCollectorFromCard ?? "",
      voltageBatteriesMasterOff: r?.voltageBatteriesMasterOff ?? "",
      voltageCardMasterOn: r?.voltageCardMasterOn ?? "",
      voltageCardMasterOff: r?.voltageCardMasterOff ?? "",
      voltageSwitch: r?.voltageSwitch ?? "",
      voltageCardBusOpen: r?.voltageCardBusOpen ?? "",
      commCableState: r?.commCableState ?? "",

      observations: r?.observations ?? "",
      timeStart: r?.timeStart ?? "",
      timeEnd: r?.timeEnd ?? "",
      responsibleSkg: r?.responsibleSkg ?? "",
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
      const equipments = Array.isArray(data?.autofill?.equipments)
        ? data.autofill.equipments.map((it: any) => ({
            id: String(it.id),
            type: String(it.type ?? ""),
            serial: it.serial ?? null,
            location: it.location ?? null,
          }))
        : [];

      setAutofill({ biarticuladoNo, plate, equipmentLabel, equipments });

      const curr = form.getValues();
      const patch: Partial<FormValues> = {};

      if (!curr.biarticuladoNo?.trim()) patch.biarticuladoNo = biarticuladoNo;
      if (!curr.plate?.trim() && plate) patch.plate = plate;

      if (!curr.devicesInstalled?.length) {
        patch.devicesInstalled = equipments.length ? devicesFromEquipment(equipments) : defaultDevices();
      }

      if (Object.keys(patch).length) form.reset({ ...curr, ...patch });

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.workOrderId]);

  const devicesFA = useFieldArray({ control: form.control, name: "devicesInstalled" });
  const activitiesFA = useFieldArray({ control: form.control, name: "activities" });

  async function onSubmit(v: FormValues) {
    setSaving(true);
    setMsg(null);

    const payload = {
      ...v,
      ticketNumber: v.ticketNumber.trim(),
      workOrderNumber: v.workOrderNumber.trim(),

      biarticuladoNo: v.biarticuladoNo.trim(),
      productionSp: v.productionSp.trim(),
      mileage: v.mileage.trim(),
      plate: v.plate.trim(),

      scheduledAt: v.scheduledAt || null,
      executedAt: v.executedAt || null,
      rescheduledAt: v.rescheduledAt || null,

      devicesInstalled: v.devicesInstalled,
      activities: v.activities,

      voltageNvrFromCard: v.voltageNvrFromCard.trim() || null,
      voltageCollectorFromCard: v.voltageCollectorFromCard.trim() || null,
      voltageBatteriesMasterOff: v.voltageBatteriesMasterOff.trim() || null,
      voltageCardMasterOn: v.voltageCardMasterOn.trim() || null,
      voltageCardMasterOff: v.voltageCardMasterOff.trim() || null,
      voltageSwitch: v.voltageSwitch.trim() || null,
      voltageCardBusOpen: v.voltageCardBusOpen.trim() || null,
      commCableState: v.commCableState.trim() || null,

      observations: v.observations.trim(),
      timeStart: v.timeStart.trim(),
      timeEnd: v.timeEnd.trim(),
      responsibleSkg: v.responsibleSkg.trim(),
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
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Formato Preventivo (inline)</h3>
          <p className="text-xs text-muted-foreground">
            Estructura basada en CAP-FO-M-PV-001 (tabla dispositivos, actividades y voltajes). Campos opcionales.
          </p>
          {autofill.equipmentLabel ? (
            <p className="mt-1 text-[11px] text-muted-foreground">Equipo: {autofill.equipmentLabel}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={form.handleSubmit(onSubmit)}
          disabled={saving || loading}
          className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {loading ? "Cargando..." : saving ? "Guardando..." : "Guardar"}
        </button>
      </div>

      {msg ? <div className="mt-3 rounded-md border p-3 text-sm">{msg}</div> : null}

      <form className="mt-4 space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
        {/* DATOS DEL BIARTICULADO */}
        <section className="rounded-lg border p-4">
          <h4 className="text-sm font-semibold">Datos del biarticulado</h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground">Número de ticket</label>
              <input className={inputCls()} {...form.register("ticketNumber")} />
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
              <label className="text-xs text-muted-foreground">Número de producción SP</label>
              <input className={inputCls()} {...form.register("productionSp")} />
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
        <section className="rounded-lg border p-4">
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

        {/* TABLA DISPOSITIVOS */}
        <section className="rounded-lg border p-4">
          <h4 className="text-sm font-semibold">Dispositivos del STS instalados en el biarticulado</h4>

          <div className="mt-3 overflow-auto">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 text-left">Descripción</th>
                  <th className="py-2 text-left">Marca</th>
                  <th className="py-2 text-left">Referencia</th>
                  <th className="py-2 text-left">Ubicación</th>
                  <th className="py-2 text-center" colSpan={5}>
                    Puerto de conexión
                  </th>
                  <th className="py-2 text-left">Serial</th>
                  <th className="py-2 text-left">Dirección IP</th>
                  <th className="py-2 text-left">Serial equipo nuevo</th>
                </tr>
                <tr className="border-b text-[11px] text-muted-foreground">
                  <th></th>
                  <th></th>
                  <th></th>
                  <th></th>
                  <th className="py-1 text-center">NVR</th>
                  <th className="py-1 text-center">Switch</th>
                  <th className="py-1 text-center">Colector</th>
                  <th className="py-1 text-center">Datos</th>
                  <th className="py-1 text-center">Tarjeta energía</th>
                  <th></th>
                  <th></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {devicesFA.fields.map((f, idx) => (
                  <tr key={f.id} className="border-b last:border-b-0 align-top">
                    <td className="py-2 pr-2">
                      <input className={inputCls()} {...form.register(`devicesInstalled.${idx}.description`)} />
                    </td>
                    <td className="py-2 pr-2">
                      <input className={inputCls()} {...form.register(`devicesInstalled.${idx}.brand`)} />
                    </td>
                    <td className="py-2 pr-2">
                      <input className={inputCls()} {...form.register(`devicesInstalled.${idx}.reference`)} />
                    </td>
                    <td className="py-2 pr-2">
                      <input className={inputCls()} {...form.register(`devicesInstalled.${idx}.location`)} />
                    </td>

                    <td className="py-2 text-center">
                      <input type="checkbox" {...form.register(`devicesInstalled.${idx}.portNvr`)} />
                    </td>
                    <td className="py-2 text-center">
                      <input type="checkbox" {...form.register(`devicesInstalled.${idx}.portSwitch`)} />
                    </td>
                    <td className="py-2 text-center">
                      <input type="checkbox" {...form.register(`devicesInstalled.${idx}.portCollector`)} />
                    </td>
                    <td className="py-2 text-center">
                      <input type="checkbox" {...form.register(`devicesInstalled.${idx}.portData`)} />
                    </td>
                    <td className="py-2 text-center">
                      <input type="checkbox" {...form.register(`devicesInstalled.${idx}.portEnergyCard`)} />
                    </td>

                    <td className="py-2 pr-2">
                      <input className={inputCls()} {...form.register(`devicesInstalled.${idx}.serial`)} />
                    </td>
                    <td className="py-2 pr-2">
                      <input className={inputCls()} {...form.register(`devicesInstalled.${idx}.ip`)} />
                    </td>
                    <td className="py-2 pr-2">
                      <input className={inputCls()} {...form.register(`devicesInstalled.${idx}.newSerial`)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ACTIVIDADES + VOLTAJES */}
        <section className="rounded-lg border p-4">
          <h4 className="text-sm font-semibold">Actividades mantenimiento preventivo</h4>

          <div className="mt-3 overflow-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 text-left">Área</th>
                  <th className="py-2 text-left">Actividad</th>
                  <th className="py-2 text-left">Tipo mantenimiento</th>
                  <th className="py-2 text-left">Valor</th>
                  <th className="py-2 text-left">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {activitiesFA.fields.map((f, idx) => (
                  <tr key={f.id} className="border-b last:border-b-0 align-top">
                    <td className="py-2 pr-2">
                      <input className={inputCls()} readOnly {...form.register(`activities.${idx}.area`)} />
                    </td>
                    <td className="py-2 pr-2">
                      <input className={inputCls()} {...form.register(`activities.${idx}.activity`)} />
                    </td>
                    <td className="py-2 pr-2">
                      <select className={inputCls()} {...form.register(`activities.${idx}.maintenanceType`)}>
                        <option value="">—</option>
                        <option value="Preventivo">Preventivo</option>
                        <option value="Correctivo">Correctivo</option>
                      </select>
                    </td>
                    <td className="py-2 pr-2">
                      <input className={inputCls()} {...form.register(`activities.${idx}.value`)} />
                    </td>
                    <td className="py-2 pr-2">
                      <select className={inputCls()} {...form.register(`activities.${idx}.result`)}>
                        <option value="">—</option>
                        <option value="BUENO">BUENO</option>
                        <option value="MALO">MALO</option>
                        <option value="X">X</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="text-xs text-muted-foreground">NVR encendida (voltaje desde tarjeta)</label>
              <input className={inputCls()} {...form.register("voltageNvrFromCard")} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Colector encendido (voltaje desde tarjeta)</label>
              <input className={inputCls()} {...form.register("voltageCollectorFromCard")} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Baterías respaldo (master apagado)</label>
              <input className={inputCls()} {...form.register("voltageBatteriesMasterOff")} />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Tarjeta (master encendido)</label>
              <input className={inputCls()} {...form.register("voltageCardMasterOn")} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Tarjeta (master apagado)</label>
              <input className={inputCls()} {...form.register("voltageCardMasterOff")} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Switch encendido (voltaje hacia switch)</label>
              <input className={inputCls()} {...form.register("voltageSwitch")} />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Tarjeta energía (switch bus abierto)</label>
              <input className={inputCls()} {...form.register("voltageCardBusOpen")} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">Estado cable comunicación NVR ↔ Colector</label>
              <input className={inputCls()} placeholder="BUENO / MALO / X" {...form.register("commCableState")} />
            </div>
          </div>
        </section>

        {/* OBSERVACIONES + TIEMPO + RESPONSABLES */}
        <section className="rounded-lg border p-4">
          <h4 className="text-sm font-semibold">Cierre</h4>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">Observaciones</label>
              <textarea className={textareaCls()} {...form.register("observations")} />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Hora inicio</label>
              <input className={inputCls()} placeholder="HH:MM" {...form.register("timeStart")} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Hora fin</label>
              <input className={inputCls()} placeholder="HH:MM" {...form.register("timeEnd")} />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Responsable SKG</label>
              <input className={inputCls()} {...form.register("responsibleSkg")} />
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
