"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import type { RenewalTechReport } from "@prisma/client";
import { lookupModelBySerial, normalizeSerialForLookup } from "@/lib/inventory-autofill-client";
import { InventorySerialCombobox } from "@/components/InventorySerialCombobox";

type EquipmentRow = {
  busEquipmentId: string;
  type: string;
  ipAddress: string;
  brand: string;
  model: string;
  oldSerial: string;
  newSerial: string;
};

type Props = {
  workOrderId: string;
  initialReport: RenewalTechReport | null;
  suggestedTicketNumber?: string;
  caseType?: string;
};

type FormValues = {
  ticketNumber: string;
  workOrderNumber: string;
  busCode: string;
  plate: string;
  verificationDate: string;
  linkSmartHelios: string;
  ipSimcard: string;
  observations: string;
};

function inputCls() {
  return "app-field-control h-10 w-full min-w-0 rounded-xl border px-3 text-base md:text-sm focus-visible:outline-none";
}

function textareaCls() {
  return "app-field-control min-h-[88px] w-full rounded-xl border px-3 py-2 text-base md:text-sm focus-visible:outline-none";
}

const REMOVED_ITEMS = [
  "13 CAMARAS",
  "1 NVR",
  "CABLES",
  "ANTENAS",
  "COLECTOR",
  "DISCOS DUROS",
  "TARJETA",
  "GABINETE",
  "BATERIAS",
] as const;

const FINAL_CHECKLIST = [
  "13 CAMARAS (CODIFICAR - IP)",
  "NVR (MODULO, ANTENAS, SD, IP)",
  "DISCOS (SERIAL)",
  "CONTROLADOR",
  "GABINETE",
  "BATERIA (CODIFICAR)",
  "SIM (IP ANTENAS)",
  "RELEVOS",
  "FUSIBLES",
] as const;

const EQUIPMENT_ORDER = [
  "BO",
  "BF",
  "BFE",
  "BV1_1",
  "BV1_2",
  "BV1_3",
  "BV1_4",
  "BV2_1",
  "BV2_2",
  "BV3_1",
  "BV3_2",
  "BV3_3",
  "BV3_4",
  "BT",
  "BTE",
  "NVR",
  "COLECTOR",
  "COLECTOR_DATOS",
  "DISCOS_DUROS",
  "BATERIAS",
  "CONTROLADOR_DE_CARGA",
] as const;

const OLD_PHOTO_REQUIRED_TYPES = new Set([
  "BO",
  "BF",
  "BFE",
  "BV1_1",
  "BV1_2",
  "BV1_3",
  "BV1_4",
  "BV2_1",
  "BV2_2",
  "BV3_1",
  "BV3_2",
  "BV3_3",
  "BV3_4",
  "BT",
  "BTE",
  "NVR",
  "COLECTOR",
  "COLECTOR_DATOS",
]);

const NEW_PHOTO_REQUIRED_TYPES = new Set([
  "BO",
  "BF",
  "BFE",
  "BV1_1",
  "BV1_2",
  "BV1_3",
  "BV1_4",
  "BV2_1",
  "BV2_2",
  "BV3_1",
  "BV3_2",
  "BV3_3",
  "BV3_4",
  "BT",
  "BTE",
  "NVR",
]);

function normalizeTypeName(value: string) {
  return value
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function equipmentSortIndex(type: string) {
  const key = normalizeTypeName(type);
  const idx = EQUIPMENT_ORDER.indexOf(key as (typeof EQUIPMENT_ORDER)[number]);
  return idx >= 0 ? idx : 9999;
}

function requiresOldPhoto(type: string) {
  return OLD_PHOTO_REQUIRED_TYPES.has(normalizeTypeName(type));
}

function requiresNewPhoto(type: string) {
  return NEW_PHOTO_REQUIRED_TYPES.has(normalizeTypeName(type));
}

const DISK_TYPE_KEYS = new Set([
  "DISCOS_DUROS",
  "DISCOS_DURO",
  "DISCO_DURO",
  "DISCOS",
  "DISCO",
]);

function isDiskType(type: string) {
  return DISK_TYPE_KEYS.has(normalizeTypeName(type));
}

function splitSerialPair(value: string | null | undefined): [string, string] {
  const raw = String(value ?? "").trim();
  if (!raw) return ["", ""];
  const parts = raw
    .split(/[\/|,;\n]+/g)
    .map((x) => x.trim())
    .filter(Boolean);
  return [parts[0] ?? "", parts[1] ?? ""];
}

function joinSerialPair(first: string | null | undefined, second: string | null | undefined): string {
  const a = String(first ?? "").trim();
  const b = String(second ?? "").trim();
  if (a && b) return `${a} / ${b}`;
  return a || b || "";
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function RenewalTechReportForm(props: Props) {
  const router = useRouter();
  const isProductImprovement = props.caseType === "MEJORA_PRODUCTO";
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState<string | null>(null);

  const [equipmentRows, setEquipmentRows] = React.useState<EquipmentRow[]>([]);
  const [removedChecklist, setRemovedChecklist] = React.useState<Record<string, boolean>>({});
  const [finalChecklist, setFinalChecklist] = React.useState<Record<string, boolean>>({});
  const [oldPhotosByEquipment, setOldPhotosByEquipment] = React.useState<Record<string, FileList | null>>({});
  const [newPhotosByEquipment, setNewPhotosByEquipment] = React.useState<Record<string, FileList | null>>({});

  const r = props.initialReport as any;
  const oldCompletedCount = equipmentRows.filter((row) => {
    if (!isDiskType(row.type)) return String(row.oldSerial ?? "").trim().length > 0;
    const [s1, s2] = splitSerialPair(row.oldSerial);
    return Boolean(s1 && s2);
  }).length;
  const newCompletedCount = equipmentRows.filter((row) => {
    if (!isDiskType(row.type)) return String(row.newSerial ?? "").trim().length > 0;
    const [s1, s2] = splitSerialPair(row.newSerial);
    return Boolean(s1 && s2);
  }).length;

  const form = useForm<FormValues>({
    defaultValues: {
      ticketNumber: r?.ticketNumber ?? props.suggestedTicketNumber ?? "",
      workOrderNumber: r?.workOrderNumber ?? "",
      busCode: r?.busCode ?? "",
      plate: r?.plate ?? "",
      verificationDate: (r?.newInstallation as any)?.verificationDate ?? todayIsoDate(),
      linkSmartHelios: r?.linkSmartHelios ?? "",
      ipSimcard: r?.ipSimcard ?? "",
      observations: r?.observations ?? "",
    },
  });

  const tryAutofillRowModel = React.useCallback(async (rowIndex: number, serialInput: string) => {
    const serialKey = normalizeSerialForLookup(serialInput);
    if (serialKey.length < 6) return;

    const model = await lookupModelBySerial(serialKey);
    if (!model) return;

    setEquipmentRows((prev) =>
      prev.map((row, idx) => {
        if (idx !== rowIndex) return row;
        const currentNormalized = normalizeSerialForLookup(row.newSerial);
        if (currentNormalized !== serialKey) {
          const [disk1, disk2] = splitSerialPair(row.newSerial);
          const disk1Norm = normalizeSerialForLookup(disk1);
          const disk2Norm = normalizeSerialForLookup(disk2);
          if (disk1Norm !== serialKey && disk2Norm !== serialKey) return row;
        }
        if (String(row.model ?? "").trim() === model) return row;
        return { ...row, model };
      })
    );
  }, []);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setMsg(null);
      const res = await fetch(`/api/work-orders/${props.workOrderId}/renewal-report`, { method: "GET" });
      const data = await res.json().catch(() => ({}));
      if (!alive) return;

      if (!res.ok) {
        setMsg(data?.error ?? "No se pudo cargar el formato");
        setLoading(false);
        return;
      }

      const curr = form.getValues();
      form.reset({
        ...curr,
        busCode: curr.busCode || data?.autofill?.busCode || "",
        plate: curr.plate || data?.autofill?.plate || "",
        verificationDate:
          data?.report?.newInstallation?.verificationDate ||
          curr.verificationDate ||
          todayIsoDate(),
        linkSmartHelios: curr.linkSmartHelios || data?.autofill?.linkSmartHelios || "",
        ipSimcard: curr.ipSimcard || data?.autofill?.ipSimcard || "",
      });

      const persistedUpdates = Array.isArray(data?.report?.newInstallation?.equipmentUpdates)
        ? data.report.newInstallation.equipmentUpdates
        : [];
      const updatesById = new Map<string, any>(
        persistedUpdates.map((x: any) => [String(x.busEquipmentId), x])
      );
      const rows = (Array.isArray(data?.autofill?.busEquipments) ? data.autofill.busEquipments : [])
        .map((eq: any) => {
          const persisted = updatesById.get(String(eq.id));
          const fallbackSerial = String(eq.serial ?? "");
          return {
            busEquipmentId: String(eq.id),
            type: String(eq.equipmentType?.name ?? ""),
            ipAddress: String(persisted?.ipAddress ?? eq.ipAddress ?? ""),
            brand: String(persisted?.brand ?? eq.brand ?? ""),
            model: String(persisted?.model ?? eq.model ?? ""),
            oldSerial: String(persisted?.oldSerial ?? fallbackSerial),
            newSerial: String(persisted?.newSerial ?? persisted?.serial ?? fallbackSerial),
          } as EquipmentRow;
        })
        .sort((a: EquipmentRow, b: EquipmentRow) => {
          const diff = equipmentSortIndex(a.type) - equipmentSortIndex(b.type);
          return diff !== 0 ? diff : a.type.localeCompare(b.type, "es");
        });
      setEquipmentRows(rows);

      const persistedRemoved = (data?.report?.removedChecklist ?? {}) as Record<string, boolean>;
      const persistedFinal = (data?.report?.finalChecklist ?? {}) as Record<string, boolean>;
      const removedState: Record<string, boolean> = {};
      const finalState: Record<string, boolean> = {};
      for (const item of REMOVED_ITEMS) removedState[item] = Boolean(persistedRemoved[item]);
      for (const item of FINAL_CHECKLIST) finalState[item] = Boolean(persistedFinal[item]);
      setRemovedChecklist(removedState);
      setFinalChecklist(finalState);

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.workOrderId]);

  async function uploadPhotos(
    bucket: "old" | "new",
    files: FileList | null,
    busEquipmentId?: string
  ) {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.set("bucket", bucket);
      if (busEquipmentId) fd.set("busEquipmentId", busEquipmentId);
      fd.set("photo", file);
      const res = await fetch(`/api/work-orders/${props.workOrderId}/renewal-report`, {
        method: "PUT",
        body: fd,
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `Error subiendo foto (${bucket})`);
      }
    }
  }

  async function onSubmit(v: FormValues) {
    setSaving(true);
    setMsg(null);
    try {
      const payload = {
        ...v,
        ticketNumber: v.ticketNumber.trim(),
        workOrderNumber: v.workOrderNumber.trim(),
        busCode: v.busCode.trim(),
        plate: v.plate.trim(),
        linkSmartHelios: v.linkSmartHelios.trim(),
        ipSimcard: v.ipSimcard.trim(),
        observations: v.observations.trim(),
        removedChecklist,
        finalChecklist,
        newInstallation: {
          verificationDate: v.verificationDate || null,
          equipmentUpdates: equipmentRows,
        },
      };

      const res = await fetch(`/api/work-orders/${props.workOrderId}/renewal-report`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "No se pudo guardar");

      for (const row of equipmentRows) {
        await uploadPhotos(
          "old",
          isProductImprovement || requiresOldPhoto(row.type)
            ? oldPhotosByEquipment[row.busEquipmentId] ?? null
            : null,
          row.busEquipmentId
        );
        await uploadPhotos(
          "new",
          isProductImprovement || requiresNewPhoto(row.type)
            ? newPhotosByEquipment[row.busEquipmentId] ?? null
            : null,
          row.busEquipmentId
        );
      }

      setMsg("Guardado correctamente");
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  function updateRow(idx: number, patch: Partial<EquipmentRow>) {
    setEquipmentRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  return (
    <div className="space-y-6">
      <div className="sts-card p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">
              {isProductImprovement
                ? "Formato Mejora de Producto (inline)"
                : "Formato Renovación Tecnológica (inline)"}
            </h3>
            {isProductImprovement ? (
              <p className="text-xs text-muted-foreground">
                Cambio de equipos seleccionados con serial antiguo/nuevo, evidencia fotográfica y acta Word.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Desmonte de componentes anteriores, instalación nueva, checklist de IPs y acta de cambios.
              </p>
            )}
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
        <section className="sts-card p-4 md:p-5">
          <h4 className="text-sm font-semibold">Datos base del bus</h4>
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
              <label className="text-xs text-muted-foreground">Bus</label>
              <input className={inputCls()} {...form.register("busCode")} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Placa</label>
              <input className={inputCls()} {...form.register("plate")} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Fecha de verificación</label>
              <input type="date" className={inputCls()} {...form.register("verificationDate")} />
            </div>
            {!isProductImprovement ? (
              <>
                <div>
                  <label className="text-xs text-muted-foreground">Link SmartHelios</label>
                  <input className={inputCls()} placeholder="https://..." {...form.register("linkSmartHelios")} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">IP de la SIMCARD</label>
                  <input className={inputCls()} placeholder="x.x.x.x" {...form.register("ipSimcard")} />
                </div>
              </>
            ) : null}
          </div>
        </section>

        {!isProductImprovement ? (
          <section className="sts-card p-4 md:p-5">
            <h4 className="text-sm font-semibold">Paso 1 · Desmonte de lo antiguo</h4>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {REMOVED_ITEMS.map((item) => (
                <label key={item} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(removedChecklist[item])}
                    onChange={(e) =>
                      setRemovedChecklist((prev) => ({ ...prev, [item]: e.target.checked }))
                    }
                  />
                  {item}
                </label>
              ))}
            </div>
          </section>
        ) : null}

        <section className="sts-card p-4 md:p-5">
          <h4 className="text-sm font-semibold">
            {isProductImprovement
              ? "Paso 1 · Equipos actuales (serial y foto antiguo)"
              : "Paso 2 · Desmonte de equipos antiguos"}
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            {isProductImprovement
              ? "Registra serial antiguo y foto de serial antiguo por cada equipo seleccionado."
              : "Primero completa todo lo antiguo (serial y foto de serial desinstalado) por cada equipo."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isProductImprovement
              ? "En mejora de producto, la foto de serial antiguo es obligatoria por equipo."
              : "La foto se solicita solo en los equipos que la plantilla del acta requiere."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Avance desmonte:{" "}
            <span className="font-medium">
              {oldCompletedCount}/{equipmentRows.length}
            </span>
          </p>
          <div className="mt-3 overflow-auto">
            <table className="w-full sts-table sts-table-compact">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 text-left">Tipo</th>
                  <th className="py-2 text-left">Serial antiguo</th>
                  <th className="py-2 text-left">Foto serial antiguo</th>
                </tr>
              </thead>
              <tbody>
                {equipmentRows.map((row, idx) => (
                  <tr key={row.busEquipmentId} className="border-b">
                    <td className="py-2">{row.type}</td>
                    <td className="py-2">
                      {isDiskType(row.type) ? (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <input
                            className={inputCls()}
                            placeholder="Serial disco 1"
                            value={splitSerialPair(row.oldSerial)[0]}
                            onChange={(e) => {
                              const [, second] = splitSerialPair(row.oldSerial);
                              updateRow(idx, { oldSerial: joinSerialPair(e.target.value, second) });
                            }}
                          />
                          <input
                            className={inputCls()}
                            placeholder="Serial disco 2"
                            value={splitSerialPair(row.oldSerial)[1]}
                            onChange={(e) => {
                              const [first] = splitSerialPair(row.oldSerial);
                              updateRow(idx, { oldSerial: joinSerialPair(first, e.target.value) });
                            }}
                          />
                        </div>
                      ) : (
                        <input
                          className={inputCls()}
                          value={row.oldSerial}
                          onChange={(e) => updateRow(idx, { oldSerial: e.target.value })}
                        />
                      )}
                    </td>
                    <td className="py-2">
                      {isProductImprovement || requiresOldPhoto(row.type) ? (
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className={inputCls()}
                          onChange={(e) =>
                            setOldPhotosByEquipment((prev) => ({
                              ...prev,
                              [row.busEquipmentId]: e.target.files,
                            }))
                          }
                        />
                      ) : (
                        <div className="text-xs text-muted-foreground">No requerido</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="sts-card p-4 md:p-5">
          <h4 className="text-sm font-semibold">
            {isProductImprovement
              ? "Paso 2 · Equipos nuevos (serial y foto nuevo)"
              : "Paso 3 · Instalación de equipos nuevos"}
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            {isProductImprovement
              ? "Registra serial nuevo y foto de serial nuevo por cada equipo seleccionado."
              : "Después del desmonte, registra serial nuevo, foto serial nuevo, IP y datos del equipo instalado."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isProductImprovement
              ? "En mejora de producto, la foto de serial nuevo es obligatoria por equipo."
              : "La foto se solicita solo donde la plantilla del acta tiene campo de foto nuevo."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Avance instalación:{" "}
            <span className="font-medium">
              {newCompletedCount}/{equipmentRows.length}
            </span>
          </p>
          <div className="mt-3 overflow-auto">
            <table className="w-full sts-table sts-table-compact">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 text-left">Tipo</th>
                  <th className="py-2 text-left">Serial nuevo</th>
                  <th className="py-2 text-left">Foto serial nuevo</th>
                  {!isProductImprovement ? <th className="py-2 text-left">IP</th> : null}
                  {!isProductImprovement ? <th className="py-2 text-left">Marca</th> : null}
                  {!isProductImprovement ? <th className="py-2 text-left">Modelo</th> : null}
                </tr>
              </thead>
              <tbody>
                {equipmentRows.map((row, idx) => (
                  <tr key={row.busEquipmentId} className="border-b">
                    <td className="py-2">{row.type}</td>
                    <td className="py-2">
                      {isDiskType(row.type) ? (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <InventorySerialCombobox
                            value={splitSerialPair(row.newSerial)[0]}
                            className={inputCls()}
                            placeholder="Serial disco 1"
                            onChange={(value) => {
                              const [, second] = splitSerialPair(row.newSerial);
                              updateRow(idx, { newSerial: joinSerialPair(value, second) });
                              void tryAutofillRowModel(idx, value);
                            }}
                            onModelDetected={(model) => {
                              if (!String(row.model ?? "").trim()) updateRow(idx, { model });
                            }}
                          />
                          <InventorySerialCombobox
                            value={splitSerialPair(row.newSerial)[1]}
                            className={inputCls()}
                            placeholder="Serial disco 2"
                            onChange={(value) => {
                              const [first] = splitSerialPair(row.newSerial);
                              updateRow(idx, { newSerial: joinSerialPair(first, value) });
                              void tryAutofillRowModel(idx, value);
                            }}
                            onModelDetected={(model) => {
                              if (!String(row.model ?? "").trim()) updateRow(idx, { model });
                            }}
                          />
                        </div>
                      ) : (
                        <InventorySerialCombobox
                          value={row.newSerial}
                          className={inputCls()}
                          onChange={(value) => {
                            updateRow(idx, { newSerial: value });
                            void tryAutofillRowModel(idx, value);
                          }}
                          onModelDetected={(model) => {
                            if (!String(row.model ?? "").trim()) {
                              updateRow(idx, { model });
                            }
                          }}
                        />
                      )}
                    </td>
                    <td className="py-2">
                      {isProductImprovement || requiresNewPhoto(row.type) ? (
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className={inputCls()}
                          onChange={(e) =>
                            setNewPhotosByEquipment((prev) => ({
                              ...prev,
                              [row.busEquipmentId]: e.target.files,
                            }))
                          }
                        />
                      ) : (
                        <div className="text-xs text-muted-foreground">No requerido</div>
                      )}
                    </td>
                    {!isProductImprovement ? (
                      <td className="py-2">
                        <input
                          className={inputCls()}
                          value={row.ipAddress}
                          onChange={(e) => updateRow(idx, { ipAddress: e.target.value })}
                        />
                      </td>
                    ) : null}
                    {!isProductImprovement ? (
                      <td className="py-2">
                        <input
                          className={inputCls()}
                          value={row.brand}
                          onChange={(e) => updateRow(idx, { brand: e.target.value })}
                        />
                      </td>
                    ) : null}
                    {!isProductImprovement ? (
                      <td className="py-2">
                        <input
                          className={inputCls()}
                          value={row.model}
                          onChange={(e) => updateRow(idx, { model: e.target.value })}
                        />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {!isProductImprovement ? (
          <section className="sts-card p-4 md:p-5">
            <h4 className="text-sm font-semibold">Checklist final instalación</h4>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {FINAL_CHECKLIST.map((item) => (
                <label key={item} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(finalChecklist[item])}
                    onChange={(e) =>
                      setFinalChecklist((prev) => ({ ...prev, [item]: e.target.checked }))
                    }
                  />
                  {item}
                </label>
              ))}
            </div>
          </section>
        ) : null}

        {!isProductImprovement ? (
          <section className="sts-card p-4 md:p-5">
            <h4 className="text-sm font-semibold">Cierre</h4>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">Observaciones</label>
                <textarea className={textareaCls()} {...form.register("observations")} />
              </div>
            </div>
          </section>
        ) : null}

        {isProductImprovement ? (
          <section className="sts-card p-4 md:p-5">
            <h4 className="text-sm font-semibold">Observaciones (opcional)</h4>
            <div className="mt-3">
              <textarea className={textareaCls()} {...form.register("observations")} />
            </div>
          </section>
        ) : null}

        <button type="submit" className="hidden" />
      </form>
    </div>
  );
}
