"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { ProcedureType, FailureType, DeviceLocation, CorrectiveReport } from "@prisma/client";

type Props = {
  workOrderId: string;
  initialReport: CorrectiveReport | null;
};

type Autofill = {
  busCode: string;
  plate: string | null;
  equipmentTypeName: string | null;
  equipmentSerial: string | null;
  equipmentLocation: string | null;
};

type FormValues = {
  ticketNumber: string;
  workOrderNumber: string;

  busCode: string;
  productionSp: string;
  plate: string;

  deviceType: string;
  brand: string;
  model: string;
  serial: string;

  procedureType: ProcedureType | "";
  procedureOther: string;

  location: DeviceLocation | "";
  locationOther: string;

  dateDismount: string;
  dateDeliveredMfr: string;

  accessoriesSupplied: boolean;
  accessoriesWhich: string;

  physicalState: string;
  diagnosis: string;
  failureType: FailureType | "";
  failureOther: string;

  solution: string;
  manufacturerEta: string;

  installDate: string;
  newBrand: string;
  newModel: string;
  newSerial: string;
  inStock: "" | "true" | "false";

  removedBrand: string;
  removedModel: string;
  removedSerial: string;

  associatedCost: string;
};

function isoDate(d?: Date | null) {
  if (!d) return "";
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return "";
  return x.toISOString().slice(0, 10);
}

function classInput() {
  return "h-10 w-full rounded-md border px-3 text-sm outline-none focus:ring-2 focus:ring-black/10";
}
function classTextArea() {
  return "min-h-[88px] w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10";
}

function requiredIfOther(kind: "procedure" | "failure" | "location", isOther: boolean, otherValue: string) {
  if (!isOther) return null;
  if (otherValue.trim().length >= 2) return null;
  if (kind === "procedure") return "Debes especificar el tipo de procedimiento (OTRO).";
  if (kind === "failure") return "Debes especificar el tipo de falla (OTRO).";
  return "Debes especificar la ubicación (OTRO).";
}

export default function CorrectiveReportForm(props: Props) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState<string | null>(null);

  const [autofill, setAutofill] = React.useState<Autofill>({
    busCode: "",
    plate: null,
    equipmentTypeName: null,
    equipmentSerial: null,
    equipmentLocation: null,
  });

  const r = props.initialReport;

  const form = useForm<FormValues>({
    defaultValues: {
      ticketNumber: r?.ticketNumber ?? "",
      workOrderNumber: r?.workOrderNumber ?? "",

      busCode: r?.busCode ?? "",
      productionSp: r?.productionSp ?? "",
      plate: r?.plate ?? "",

      deviceType: r?.deviceType ?? "",
      brand: r?.brand ?? "",
      model: r?.model ?? "",
      serial: r?.serial ?? "",

      procedureType: (r?.procedureType as any) ?? "",
      procedureOther: r?.procedureOther ?? "",

      location: (r?.location as any) ?? "",
      locationOther: r?.locationOther ?? "",

      dateDismount: isoDate(r?.dateDismount),
      dateDeliveredMfr: isoDate(r?.dateDeliveredMfr),

      accessoriesSupplied: r?.accessoriesSupplied ?? false,
      accessoriesWhich: r?.accessoriesWhich ?? "",

      physicalState: r?.physicalState ?? "",
      diagnosis: r?.diagnosis ?? "",
      failureType: (r?.failureType as any) ?? "",
      failureOther: r?.failureOther ?? "",

      solution: r?.solution ?? "",
      manufacturerEta: r?.manufacturerEta ?? "",

      installDate: isoDate(r?.installDate),
      newBrand: r?.newBrand ?? "",
      newModel: r?.newModel ?? "",
      newSerial: r?.newSerial ?? "",
      inStock: r?.inStock === null || r?.inStock === undefined ? "" : r.inStock ? "true" : "false",

      removedBrand: r?.removedBrand ?? "",
      removedModel: r?.removedModel ?? "",
      removedSerial: r?.removedSerial ?? "",

      associatedCost: r?.associatedCost ? String(r.associatedCost) : "",
    },
    mode: "onSubmit",
  });

  // Cargar autofill desde backend y setear valores si están vacíos
  React.useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setMsg(null);

      const res = await fetch(`/api/work-orders/${props.workOrderId}/corrective-report`, { method: "GET" });
      const data = await res.json().catch(() => ({}));

      if (!alive) return;

      if (!res.ok) {
        setLoading(false);
        setMsg(data?.error ?? "No se pudo cargar el formato");
        return;
      }

      const busCode = String(data?.bus?.code ?? "").trim();
      const plate = (data?.bus?.plate ?? null) as string | null;

      const equipmentTypeName = (data?.equipment?.type ?? null) as string | null;
      const equipmentSerial = (data?.equipment?.serial ?? null) as string | null;
      const equipmentLocation = (data?.equipment?.location ?? null) as string | null;

      setAutofill({ busCode, plate, equipmentTypeName, equipmentSerial, equipmentLocation });

      // Solo autocompleta si el usuario no tiene valores
      const curr = form.getValues();
      const patch: Partial<FormValues> = {};

      if (!curr.busCode?.trim()) patch.busCode = busCode;
      if (!curr.plate?.trim() && plate) patch.plate = plate;

      if (!curr.deviceType?.trim() && equipmentTypeName) patch.deviceType = equipmentTypeName;
      if (!curr.serial?.trim() && equipmentSerial) patch.serial = equipmentSerial;

      if (Object.keys(patch).length) form.reset({ ...curr, ...patch });

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.workOrderId]);

  const procedureType = form.watch("procedureType");
  const failureType = form.watch("failureType");
  const location = form.watch("location");

  const isProcedureOther = procedureType === ProcedureType.OTRO;
  const isFailureOther = failureType === FailureType.OTRO;
  const isLocationOther = location === DeviceLocation.OTRO;

  async function onSubmit(v: FormValues) {
    setSaving(true);
    setMsg(null);

    const pErr = requiredIfOther("procedure", isProcedureOther, v.procedureOther);
    const fErr = requiredIfOther("failure", isFailureOther, v.failureOther);
    const lErr = requiredIfOther("location", isLocationOther, v.locationOther);

    const err = pErr ?? fErr ?? lErr;
    if (err) {
      setSaving(false);
      setMsg(err);
      return;
    }

    const payload = {
      ...v,
      procedureType: v.procedureType || null,
      failureType: v.failureType || null,
      location: v.location || null,

      procedureOther: isProcedureOther ? v.procedureOther.trim() : "",
      failureOther: isFailureOther ? v.failureOther.trim() : "",
      locationOther: isLocationOther ? v.locationOther.trim() : "",

      inStock: v.inStock === "" ? null : v.inStock === "true",

      ticketNumber: v.ticketNumber.trim(),
      workOrderNumber: v.workOrderNumber.trim(),
      busCode: v.busCode.trim(),
      productionSp: v.productionSp.trim(),
      plate: v.plate.trim(),
      deviceType: v.deviceType.trim(),
      brand: v.brand.trim(),
      model: v.model.trim(),
      serial: v.serial.trim(),
      accessoriesWhich: v.accessoriesWhich.trim(),
      physicalState: v.physicalState.trim(),
      diagnosis: v.diagnosis.trim(),
      solution: v.solution.trim(),
      manufacturerEta: v.manufacturerEta.trim(),
      newBrand: v.newBrand.trim(),
      newModel: v.newModel.trim(),
      newSerial: v.newSerial.trim(),
      removedBrand: v.removedBrand.trim(),
      removedModel: v.removedModel.trim(),
      removedSerial: v.removedSerial.trim(),
      associatedCost: v.associatedCost.trim(),
    };

    const res = await fetch(`/api/work-orders/${props.workOrderId}/corrective-report`, {
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
          <h3 className="text-base font-semibold">Formato Correctivo (inline)</h3>
          <p className="text-xs text-muted-foreground">Estructura basada en CAP-FO-M-CR-002.</p>
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
        {/* 1. DATOS DEL DISPOSITIVO / EQUIPO */}
        <section className="rounded-lg border p-4">
          <h4 className="text-sm font-semibold">1. Datos del dispositivo / equipo</h4>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground">Número de ticket</label>
              <input className={classInput()} {...form.register("ticketNumber")} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Orden de trabajo No.</label>
              <input className={classInput()} {...form.register("workOrderNumber")} />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">No. Biarticulado TM</label>
              <input className={classInput()} {...form.register("busCode")} />
              <p className="mt-1 text-[11px] text-muted-foreground">Sugerido: {autofill.busCode || "—"}</p>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">No. Producción SP</label>
              <input className={classInput()} {...form.register("productionSp")} />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Placa</label>
              <input className={classInput()} {...form.register("plate")} />
              <p className="mt-1 text-[11px] text-muted-foreground">Sugerido: {autofill.plate ?? "—"}</p>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Tipo dispositivo</label>
              <input className={classInput()} {...form.register("deviceType")} />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Sugerido: {autofill.equipmentTypeName ?? "—"} / Ubicación: {autofill.equipmentLocation ?? "—"}
              </p>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Marca</label>
              <input className={classInput()} {...form.register("brand")} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Modelo</label>
              <input className={classInput()} {...form.register("model")} />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground">No. Serial</label>
              <input className={classInput()} {...form.register("serial")} />
              <p className="mt-1 text-[11px] text-muted-foreground">Sugerido: {autofill.equipmentSerial ?? "—"}</p>
            </div>

            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground">Tipo de procedimiento</label>
              <select className={classInput()} {...form.register("procedureType")}>
                <option value="">— Selecciona —</option>
                <option value={ProcedureType.AJUSTE_FISICO}>Ajuste físico</option>
                <option value={ProcedureType.CAMBIO_COMPONENTE}>Cambio componente</option>
                <option value={ProcedureType.RECONFIGURACION}>Reconfiguración</option>
                <option value={ProcedureType.REVISION}>Revisión</option>
                <option value={ProcedureType.OTRO}>Otro</option>
              </select>

              <input
                className={`${classInput()} mt-2`}
                placeholder={isProcedureOther ? "Especifica cuál (requerido)" : "(Opcional) Si es OTRO, escribe aquí"}
                {...form.register("procedureOther")}
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground">Ubicación del dispositivo en el biarticulado</label>
              <select className={classInput()} {...form.register("location")}>
                <option value="">— Selecciona —</option>
                <option value={DeviceLocation.VAGON_1}>Vagón 1</option>
                <option value={DeviceLocation.VAGON_2}>Vagón 2</option>
                <option value={DeviceLocation.VAGON_3}>Vagón 3</option>
                <option value={DeviceLocation.BO}>BO</option>
                <option value={DeviceLocation.BFE}>BFE</option>
                <option value={DeviceLocation.BTE}>BTE</option>
                <option value={DeviceLocation.GABINETE_EQUIPOS}>Gabinete equipos</option>
                <option value={DeviceLocation.FUELLE_V2_3}>Fuelle V2-3</option>
                <option value={DeviceLocation.OTRO}>Otro</option>
              </select>

              <input
                className={`${classInput()} mt-2`}
                placeholder={isLocationOther ? "Especifica cuál (requerido)" : "(Opcional) Si es OTRO, escribe aquí"}
                {...form.register("locationOther")}
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Fecha desmonte</label>
              <input type="date" className={classInput()} {...form.register("dateDismount")} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Fecha entrega fabricante</label>
              <input type="date" className={classInput()} {...form.register("dateDeliveredMfr")} />
            </div>
          </div>
        </section>

        {/* 2. DESCRIPCIÓN DE LA FALLA (AQUÍ ESTABA TU BLOQUEO) */}
        <section className="rounded-lg border p-4">
          <h4 className="text-sm font-semibold">2. Descripción de la falla</h4>

          <div className="mt-3 grid gap-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <div className="flex items-center gap-3">
                <input type="checkbox" {...form.register("accessoriesSupplied")} />
                <label className="text-sm">Accesorios suministrados con el equipo</label>
              </div>
              <input className={classInput()} placeholder="¿Cuáles?" {...form.register("accessoriesWhich")} />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Estado físico del equipo</label>
              <textarea className={classTextArea()} {...form.register("physicalState")} />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Diagnóstico</label>
              <textarea className={classTextArea()} {...form.register("diagnosis")} />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Tipo de falla</label>
              <select className={classInput()} {...form.register("failureType")}>
                <option value="">— Selecciona —</option>
                <option value={FailureType.HARDWARE_FISICA}>Hardware / Física</option>
                <option value={FailureType.SOFTWARE}>Software</option>
                <option value={FailureType.CONECTIVIDAD}>Conectividad</option>
                <option value={FailureType.OTRO}>Otro</option>
              </select>

              <input
                className={`${classInput()} mt-2`}
                placeholder={isFailureOther ? "Especifica cuál (requerido)" : "(Opcional) Si es OTRO, escribe aquí"}
                {...form.register("failureOther")}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground">Solución</label>
                <textarea className={classTextArea()} {...form.register("solution")} />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Tiempo solución dado por el fabricante</label>
                <textarea className={classTextArea()} {...form.register("manufacturerEta")} />
              </div>
            </div>
          </div>
        </section>

        {/* 3. DATOS NUEVO INSTALADO */}
        <section className="rounded-lg border p-4">
          <h4 className="text-sm font-semibold">3. Datos del dispositivo/equipo (nuevo instalado)</h4>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground">Fecha instalación</label>
              <input type="date" className={classInput()} {...form.register("installDate")} />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Equipo en stock</label>
              <select className={classInput()} {...form.register("inStock")}>
                <option value="">—</option>
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Marca</label>
              <input className={classInput()} {...form.register("newBrand")} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Modelo</label>
              <input className={classInput()} {...form.register("newModel")} />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground">No. Serial</label>
              <input className={classInput()} {...form.register("newSerial")} />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground">Costo asociado</label>
              <input className={classInput()} placeholder="Ej: 120000.00" {...form.register("associatedCost")} />
            </div>
          </div>
        </section>

        {/* 4. DATOS RETIRADO */}
        <section className="rounded-lg border p-4">
          <h4 className="text-sm font-semibold">4. Datos del dispositivo/equipo (retirado)</h4>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground">Marca</label>
              <input className={classInput()} {...form.register("removedBrand")} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Modelo</label>
              <input className={classInput()} {...form.register("removedModel")} />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground">Serial</label>
              <input className={classInput()} {...form.register("removedSerial")} />
            </div>
          </div>
        </section>

        <button type="submit" className="hidden" />
      </form>
    </div>
  );
}
