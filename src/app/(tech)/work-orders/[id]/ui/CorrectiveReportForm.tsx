"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { ProcedureType, FailureType, DeviceLocation, CorrectiveReport } from "@prisma/client";
import { Select } from "@/components/Field";
import {
  lookupModelBySerial,
  normalizeSerialForLookup,
} from "@/lib/inventory-autofill-client";
import { InventorySerialCombobox } from "@/components/InventorySerialCombobox";
import { withPhotoWatermark } from "@/lib/photo-watermark-client";

type Props = {
  workOrderId: string;
  initialReport: CorrectiveReport | null;
  suggestedTicketNumber?: string;
  busCode?: string;
  caseRef?: string;
};

type Autofill = {
  busCode: string;
  plate: string | null;
  equipmentTypeName: string | null;
  equipmentSerial: string | null;
  equipmentLocation: string | null;
  equipmentBrand: string | null;
  equipmentModel: string | null;
};

type FormValues = {
  ticketNumber: string;
  workOrderNumber: string;

  busCode: string;
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
  dateDelivered: string;

  accessoriesSupplied: boolean;
  accessoriesWhich: string;

  physicalState: string;
  diagnosisPreset: string;
  diagnosisOther: string;
  failureType: FailureType | "";
  failureOther: string;

  solutionPreset: string;
  solutionOther: string;
  manufacturerEta: string;

  installDate: string;
  newBrand: string;
  newModel: string;
  newSerial: string;

  photoSerialCurrent?: FileList;
  photoSerialNew?: FileList;
};

function isoDate(d?: Date | null) {
  if (!d) return "";
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return "";
  return x.toISOString().slice(0, 10);
}

function classInput() {
  return "app-field-control h-9 w-full min-w-0 rounded-xl border px-3 text-sm focus-visible:outline-none";
}
function classTextArea() {
  return "app-field-control min-h-[88px] w-full rounded-xl border px-3 py-2 text-sm focus-visible:outline-none";
}

function normalizeEquipmentLocation(input: string | null | undefined): DeviceLocation | null {
  if (!input) return null;
  const s = String(input).trim().toUpperCase();
  if (Object.values(DeviceLocation).includes(s as DeviceLocation)) return s as DeviceLocation;
  if (s.startsWith("BV1")) return DeviceLocation.VAGON_1;
  if (s.startsWith("BV2")) return DeviceLocation.VAGON_2;
  if (s.startsWith("BV3")) return DeviceLocation.VAGON_3;
  if (s === "BO") return DeviceLocation.BO;
  if (s === "BFE") return DeviceLocation.BFE;
  if (s === "BTE") return DeviceLocation.BTE;
  return null;
}

function locationLabel(location: DeviceLocation | null) {
  if (!location) return "—";
  if (location === DeviceLocation.VAGON_1) return "Vagón 1";
  if (location === DeviceLocation.VAGON_2) return "Vagón 2";
  if (location === DeviceLocation.VAGON_3) return "Vagón 3";
  if (location === DeviceLocation.GABINETE_EQUIPOS) return "Gabinete equipos";
  if (location === DeviceLocation.FUELLE_V2_3) return "Fuelle V2-3";
  if (location === DeviceLocation.BO) return "BO";
  if (location === DeviceLocation.BFE) return "BFE";
  if (location === DeviceLocation.BTE) return "BTE";
  if (location === DeviceLocation.OTRO) return "Otro";
  return location;
}

function requiredIfOther(kind: "procedure" | "failure" | "location", isOther: boolean, otherValue: string) {
  if (!isOther) return null;
  if (otherValue.trim().length >= 2) return null;
  if (kind === "procedure") return "Debes especificar el tipo de procedimiento (OTRO).";
  if (kind === "failure") return "Debes especificar el tipo de falla (OTRO).";
  return "Debes especificar la ubicación (OTRO).";
}

const DIAGNOSIS_OPTIONS = [
  "Cámara con líneas",
  "Conector flojo",
  "No enciende",
  "Sin transmisión",
  "Imagen borrosa",
  "OTRO",
] as const;

const SOLUTION_OPTIONS = [
  "Ajuste de conexión",
  "Reemplazo de componente",
  "Reconfiguración",
  "Limpieza",
  "OTRO",
] as const;

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
    equipmentBrand: null,
    equipmentModel: null,
  });

  const r = props.initialReport;
  const initialDiagnosisPreset =
    r?.diagnosis && DIAGNOSIS_OPTIONS.includes(r.diagnosis as any) ? r.diagnosis : r?.diagnosis ? "OTRO" : "";
  const initialDiagnosisOther =
    r?.diagnosis && !DIAGNOSIS_OPTIONS.includes(r.diagnosis as any) ? r.diagnosis : "";
  const initialSolutionPreset =
    r?.solution && SOLUTION_OPTIONS.includes(r.solution as any) ? r.solution : r?.solution ? "OTRO" : "";
  const initialSolutionOther =
    r?.solution && !SOLUTION_OPTIONS.includes(r.solution as any) ? r.solution : "";

  const form = useForm<FormValues>({
    defaultValues: {
      ticketNumber: r?.ticketNumber ?? props.suggestedTicketNumber ?? "",
      workOrderNumber: r?.workOrderNumber ?? "",

      busCode: r?.busCode ?? "",
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
      dateDelivered: isoDate((r as any)?.dateDelivered),

      accessoriesSupplied: r?.accessoriesSupplied ?? false,
      accessoriesWhich: r?.accessoriesWhich ?? "",

      physicalState: r?.physicalState ?? "",
      diagnosisPreset: initialDiagnosisPreset,
      diagnosisOther: initialDiagnosisOther,
      failureType: (r?.failureType as any) ?? "",
      failureOther: r?.failureOther ?? "",

      solutionPreset: initialSolutionPreset,
      solutionOther: initialSolutionOther,
      manufacturerEta: r?.manufacturerEta ?? "",

      installDate: isoDate(r?.installDate),
      newBrand: r?.newBrand ?? "",
      newModel: r?.newModel ?? "",
      newSerial: r?.newSerial ?? "",
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
      const equipmentBrand = (data?.equipment?.brand ?? null) as string | null;
      const equipmentModel = (data?.equipment?.model ?? null) as string | null;

      setAutofill({
        busCode,
        plate,
        equipmentTypeName,
        equipmentSerial,
        equipmentLocation,
        equipmentBrand,
        equipmentModel,
      });

      // Solo autocompleta si el usuario no tiene valores
      const curr = form.getValues();
      const patch: Partial<FormValues> = {};

      if (!curr.busCode?.trim()) patch.busCode = busCode;
      if (!curr.plate?.trim() && plate) patch.plate = plate;

      if (!curr.deviceType?.trim() && equipmentTypeName) patch.deviceType = equipmentTypeName;
      if (!curr.brand?.trim() && equipmentBrand) patch.brand = equipmentBrand;
      if (!curr.model?.trim() && equipmentModel) patch.model = equipmentModel;
      if (!curr.serial?.trim() && equipmentSerial) patch.serial = equipmentSerial;
      if (!curr.location) {
        const inferred =
          normalizeEquipmentLocation(equipmentLocation) ??
          normalizeEquipmentLocation(equipmentTypeName) ??
          normalizeEquipmentLocation(equipmentSerial);
        if (inferred) patch.location = inferred;
      }

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
  const serialValue = form.watch("serial");
  const newSerialValue = form.watch("newSerial");
  const currentPhotoName = form.watch("photoSerialCurrent")?.[0]?.name ?? "";
  const newPhotoName = form.watch("photoSerialNew")?.[0]?.name ?? "";

  const isCambioComponente = String(procedureType ?? "") === "CAMBIO_COMPONENTE";
  const isProcedureOther = procedureType === ProcedureType.OTRO;
  const isFailureOther = failureType === FailureType.OTRO;
  const isLocationOther = location === DeviceLocation.OTRO;
  const displayLocation =
    normalizeEquipmentLocation(autofill.equipmentLocation) ??
    normalizeEquipmentLocation(autofill.equipmentTypeName) ??
    normalizeEquipmentLocation(autofill.equipmentSerial) ??
    (location ? location : null);

  React.useEffect(() => {
    if (isCambioComponente) return;
    form.setValue("installDate", "");
    form.setValue("newBrand", "");
    form.setValue("newModel", "");
    form.setValue("newSerial", "");
    form.setValue("photoSerialCurrent", undefined as any);
    form.setValue("photoSerialNew", undefined as any);
  }, [isCambioComponente, form]);

  React.useEffect(() => {
    const serialKey = normalizeSerialForLookup(serialValue);
    if (serialKey.length < 6) return;

    let active = true;
    const timer = setTimeout(async () => {
      const model = await lookupModelBySerial(serialKey);
      if (!active || !model) return;
      if (normalizeSerialForLookup(form.getValues("serial")) !== serialKey) return;
      if (String(form.getValues("model") ?? "").trim() === model) return;
      form.setValue("model", model, { shouldDirty: true });
    }, 220);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [serialValue, form]);

  React.useEffect(() => {
    if (!isCambioComponente) return;

    const serialKey = normalizeSerialForLookup(newSerialValue);
    if (serialKey.length < 6) return;

    let active = true;
    const timer = setTimeout(async () => {
      const model = await lookupModelBySerial(serialKey);
      if (!active || !model) return;
      if (normalizeSerialForLookup(form.getValues("newSerial")) !== serialKey) return;
      if (String(form.getValues("newModel") ?? "").trim() === model) return;
      form.setValue("newModel", model, { shouldDirty: true });
    }, 220);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [newSerialValue, isCambioComponente, form]);

  async function onSubmit(v: FormValues) {
    setSaving(true);
    setMsg(null);

    const diagnosis =
      v.diagnosisPreset === "OTRO" ? v.diagnosisOther.trim() : v.diagnosisPreset.trim();
    const solution =
      v.solutionPreset === "OTRO" ? v.solutionOther.trim() : v.solutionPreset.trim();

    const payload = {
      ...v,
      procedureType: v.procedureType || null,
      failureType: v.failureType || null,
      location: v.location || null,

      procedureOther: isProcedureOther ? v.procedureOther.trim() : "",
      failureOther: isFailureOther ? v.failureOther.trim() : "",
      locationOther: isLocationOther ? v.locationOther.trim() : "",

      ticketNumber: v.ticketNumber.trim(),
      workOrderNumber: v.workOrderNumber.trim(),
      busCode: v.busCode.trim(),
      plate: v.plate.trim(),
      deviceType: v.deviceType.trim(),
      brand: v.brand.trim(),
      model: v.model.trim(),
      serial: v.serial.trim(),
      accessoriesWhich: v.accessoriesWhich.trim(),
      physicalState: v.physicalState.trim(),
      diagnosis,
      solution,
      manufacturerEta: v.manufacturerEta.trim(),
      newBrand: v.newBrand.trim(),
      newModel: v.newModel.trim(),
      newSerial: v.newSerial.trim(),
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

    const currentFile = v.photoSerialCurrent?.[0];
    const newFile = v.photoSerialNew?.[0];
    if (currentFile || newFile) {
      const upload = async (kind: "current" | "new", file: File) => {
        const stampedPhoto = await withPhotoWatermark(file, {
          equipmentLabel:
            kind === "current"
              ? `${form.getValues("deviceType") || "Equipo"} · serial actual`
              : `${form.getValues("deviceType") || "Equipo"} · serial nuevo`,
          busCode: props.busCode || form.getValues("busCode") || null,
          caseRef: props.caseRef || null,
        });
        const formData = new FormData();
        formData.append("photoKind", kind);
        formData.append("photo", stampedPhoto);
        await fetch(`/api/work-orders/${props.workOrderId}/corrective-report`, {
          method: "PUT",
          body: formData,
        });
      };
      if (currentFile) await upload("current", currentFile);
      if (newFile) await upload("new", newFile);
    }

    setMsg("Guardado correctamente");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="sts-card p-4 md:p-5">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-semibold">Formato Correctivo (inline)</h3>
            <p className="text-xs text-muted-foreground">Estructura basada en CAP-FO-M-CR-002. Campos opcionales.</p>
          </div>
          <button
            type="button"
            onClick={form.handleSubmit(onSubmit)}
            disabled={saving || loading}
            className="sts-btn-primary w-full text-sm disabled:opacity-50 sm:w-auto"
          >
            {loading ? "Cargando..." : saving ? "Guardando..." : "Guardar"}
          </button>
        </div>

        {msg ? <div className="mt-3 rounded-md border p-3 text-sm">{msg}</div> : null}
      </div>

      <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
        {/* 1. DATOS DEL DISPOSITIVO / EQUIPO */}
        <section className="sts-card p-4 md:p-5">
          <h4 className="text-sm font-semibold">1. Datos del dispositivo / equipo</h4>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground">Número de ticket</label>
              <input className={classInput()} readOnly {...form.register("ticketNumber")} />
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
              {autofill.equipmentBrand ? (
                <p className="mt-1 text-[11px] text-muted-foreground">Sugerido: {autofill.equipmentBrand}</p>
              ) : null}
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Modelo</label>
              <input className={classInput()} {...form.register("model")} />
              {autofill.equipmentModel ? (
                <p className="mt-1 text-[11px] text-muted-foreground">Sugerido: {autofill.equipmentModel}</p>
              ) : null}
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">No. Serial</label>
              <InventorySerialCombobox
                value={serialValue}
                className={classInput()}
                onChange={(value) => form.setValue("serial", value, { shouldDirty: true })}
                onModelDetected={(model) => {
                  if (!String(form.getValues("model") ?? "").trim()) {
                    form.setValue("model", model, { shouldDirty: true });
                  }
                }}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Sugerido: {autofill.equipmentSerial ?? "—"}</p>
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">Tipo de procedimiento</label>
              <Select className={classInput()} {...form.register("procedureType")}>
                <option value="">— Selecciona —</option>
                <option value={ProcedureType.AJUSTE_FISICO}>Ajuste físico</option>
                <option value={ProcedureType.CAMBIO_COMPONENTE}>Cambio componente</option>
                <option value={ProcedureType.RECONFIGURACION}>Reconfiguración</option>
                <option value={ProcedureType.OTRO}>Otro</option>
              </Select>

              <input
                className={`${classInput()} mt-2`}
                placeholder={isProcedureOther ? "Especifica cuál (requerido)" : "(Opcional) Si es OTRO, escribe aquí"}
                {...form.register("procedureOther")}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">Ubicación del dispositivo en el biarticulado</label>
              {displayLocation ? (
                <input className={classInput()} readOnly value={locationLabel(displayLocation as DeviceLocation)} />
              ) : (
                <>
                  <Select className={classInput()} {...form.register("location")}>
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
                  </Select>

                  <input
                    className={`${classInput()} mt-2`}
                    placeholder={isLocationOther ? "Especifica cuál (requerido)" : "(Opcional) Si es OTRO, escribe aquí"}
                    {...form.register("locationOther")}
                  />
                </>
              )}
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Fecha desmonte</label>
              <input type="date" className={classInput()} {...form.register("dateDismount")} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Fecha entrega</label>
              <input type="date" className={classInput()} {...form.register("dateDelivered")} />
            </div>
          </div>
        </section>

        {/* 2. DESCRIPCIÓN DE LA FALLA (AQUÍ ESTABA TU BLOQUEO) */}
        <section className="sts-card p-4 md:p-5">
          <h4 className="text-sm font-semibold">2. Descripción de la falla</h4>

          <div className="mt-3 grid gap-3">
            {isCambioComponente ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3">
                  <input type="checkbox" {...form.register("accessoriesSupplied")} />
                  <label className="text-sm">Accesorios suministrados con el equipo</label>
                </div>
                <input className={classInput()} placeholder="¿Cuáles?" {...form.register("accessoriesWhich")} />
              </div>
            ) : null}

            <div>
              <label className="text-xs text-muted-foreground">Tipo de falla</label>
              <Select className={classInput()} {...form.register("failureType")}>
                <option value="">— Selecciona —</option>
                <option value={FailureType.HARDWARE_FISICA}>Hardware / Física</option>
                <option value={FailureType.SOFTWARE}>Software</option>
                <option value={FailureType.CONECTIVIDAD}>Conectividad</option>
                <option value={FailureType.OTRO}>Otro</option>
              </Select>

              <input
                className={`${classInput()} mt-2`}
                placeholder={isFailureOther ? "Especifica cuál (requerido)" : "(Opcional) Si es OTRO, escribe aquí"}
                {...form.register("failureOther")}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground">Estado físico del equipo</label>
                <textarea className={classTextArea()} {...form.register("physicalState")} />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Diagnóstico</label>
                <Select className={classInput()} {...form.register("diagnosisPreset")}>
                  <option value="">— Selecciona —</option>
                  {DIAGNOSIS_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
                {form.watch("diagnosisPreset") === "OTRO" ? (
                  <input
                    className={`${classInput()} mt-2`}
                    placeholder="Especifica el diagnóstico"
                    {...form.register("diagnosisOther")}
                  />
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground">Solución</label>
                <Select className={classInput()} {...form.register("solutionPreset")}>
                  <option value="">— Selecciona —</option>
                  {SOLUTION_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
                {form.watch("solutionPreset") === "OTRO" ? (
                  <input
                    className={`${classInput()} mt-2`}
                    placeholder="Especifica la solución"
                    {...form.register("solutionOther")}
                  />
                ) : null}
              </div>

              {isCambioComponente ? (
                <div>
                  <label className="text-xs text-muted-foreground">Tiempo solución dado por el fabricante</label>
                  <textarea className={classTextArea()} {...form.register("manufacturerEta")} />
                </div>
              ) : null}
            </div>

          </div>
        </section>

        {/* 3. CAMBIO DE COMPONENTE */}
        {isCambioComponente ? (
          <section className="sts-card p-4 md:p-5">
            <h4 className="text-sm font-semibold">3. Cambio de componente</h4>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground">Foto serial actual</label>
                <div className="mt-1 space-y-1.5">
                  <label
                    htmlFor={`photo-serial-current-${props.workOrderId}`}
                    className="flex h-24 w-full max-w-[240px] cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border/70 px-3 text-center text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5"
                  >
                    Cargar foto o archivo
                  </label>
                  <input
                    id={`photo-serial-current-${props.workOrderId}`}
                    type="file"
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
                    className="sr-only"
                    {...form.register("photoSerialCurrent")}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {currentPhotoName || "Ninguna foto o archivo seleccionado"}
                  </p>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Foto serial nuevo</label>
                <div className="mt-1 space-y-1.5">
                  <label
                    htmlFor={`photo-serial-new-${props.workOrderId}`}
                    className="flex h-24 w-full max-w-[240px] cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border/70 px-3 text-center text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5"
                  >
                    Cargar foto o archivo
                  </label>
                  <input
                    id={`photo-serial-new-${props.workOrderId}`}
                    type="file"
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
                    className="sr-only"
                    {...form.register("photoSerialNew")}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {newPhotoName || "Ninguna foto o archivo seleccionado"}
                  </p>
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Fecha instalación</label>
                <input type="date" className={classInput()} {...form.register("installDate")} />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Marca nueva</label>
                <input className={classInput()} {...form.register("newBrand")} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Modelo nuevo</label>
                <input className={classInput()} {...form.register("newModel")} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Serial nuevo (texto)</label>
                <InventorySerialCombobox
                  value={newSerialValue}
                  className={classInput()}
                  onChange={(value) => form.setValue("newSerial", value, { shouldDirty: true })}
                  onModelDetected={(model) => {
                    if (!String(form.getValues("newModel") ?? "").trim()) {
                      form.setValue("newModel", model, { shouldDirty: true });
                    }
                  }}
                />
              </div>
            </div>
          </section>
        ) : null}

        <button type="submit" className="hidden" />
      </form>
    </div>
  );
}
