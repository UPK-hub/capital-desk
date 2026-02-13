"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import type { RenewalTechReport } from "@prisma/client";

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
};

type FormValues = {
  ticketNumber: string;
  workOrderNumber: string;
  busCode: string;
  plate: string;
  verificationDate: string;
  linkSmartHelios: string;
  ipSimcard: string;
  timeStart: string;
  timeEnd: string;
  observations: string;
};

function inputCls() {
  return "app-field-control h-9 w-full min-w-0 rounded-xl border px-3 text-sm outline-none focus:ring-2 focus:ring-black/10";
}

function textareaCls() {
  return "app-field-control min-h-[88px] w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10";
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

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function RenewalTechReportForm(props: Props) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState<string | null>(null);

  const [equipmentRows, setEquipmentRows] = React.useState<EquipmentRow[]>([]);
  const [removedChecklist, setRemovedChecklist] = React.useState<Record<string, boolean>>({});
  const [finalChecklist, setFinalChecklist] = React.useState<Record<string, boolean>>({});
  const [photosChecklist, setPhotosChecklist] = React.useState<FileList | null>(null);
  const [oldPhotosByEquipment, setOldPhotosByEquipment] = React.useState<Record<string, FileList | null>>({});
  const [newPhotosByEquipment, setNewPhotosByEquipment] = React.useState<Record<string, FileList | null>>({});

  const r = props.initialReport as any;

  const form = useForm<FormValues>({
    defaultValues: {
      ticketNumber: r?.ticketNumber ?? props.suggestedTicketNumber ?? "",
      workOrderNumber: r?.workOrderNumber ?? "",
      busCode: r?.busCode ?? "",
      plate: r?.plate ?? "",
      verificationDate: (r?.newInstallation as any)?.verificationDate ?? todayIsoDate(),
      linkSmartHelios: r?.linkSmartHelios ?? "",
      ipSimcard: r?.ipSimcard ?? "",
      timeStart: r?.timeStart ?? "",
      timeEnd: r?.timeEnd ?? "",
      observations: r?.observations ?? "",
    },
  });

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
    bucket: "old" | "new" | "checklist",
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
        await uploadPhotos("old", oldPhotosByEquipment[row.busEquipmentId] ?? null, row.busEquipmentId);
        await uploadPhotos("new", newPhotosByEquipment[row.busEquipmentId] ?? null, row.busEquipmentId);
      }
      await uploadPhotos("checklist", photosChecklist);

      setMsg("Guardado correctamente");
      router.refresh();
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
            <h3 className="text-base font-semibold">Formato Renovación Tecnológica (inline)</h3>
            <p className="text-xs text-muted-foreground">
              Desmonte de componentes anteriores, instalación nueva, checklist de IPs y acta de cambios.
            </p>
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
            <div>
              <label className="text-xs text-muted-foreground">Link SmartHelios</label>
              <input className={inputCls()} placeholder="https://..." {...form.register("linkSmartHelios")} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">IP de la SIMCARD</label>
              <input className={inputCls()} placeholder="x.x.x.x" {...form.register("ipSimcard")} />
            </div>
          </div>
        </section>

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

        <section className="sts-card p-4 md:p-5">
          <h4 className="text-sm font-semibold">Paso 2 · Instalación nueva y alimentación por equipo</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Orden de llenado por equipo: serial desinstalado, serial instalado, foto serial antiguo, foto serial nuevo, IP y datos del equipo.
          </p>
          <div className="mt-3 overflow-auto">
            <table className="w-full sts-table sts-table-compact">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 text-left">Tipo</th>
                  <th className="py-2 text-left">Serial antiguo</th>
                  <th className="py-2 text-left">Serial nuevo</th>
                  <th className="py-2 text-left">Foto serial antiguo</th>
                  <th className="py-2 text-left">Foto serial nuevo</th>
                  <th className="py-2 text-left">IP</th>
                  <th className="py-2 text-left">Marca</th>
                  <th className="py-2 text-left">Modelo</th>
                </tr>
              </thead>
              <tbody>
                {equipmentRows.map((row, idx) => (
                  <tr key={row.busEquipmentId} className="border-b">
                    <td className="py-2">{row.type}</td>
                    <td className="py-2">
                      <input
                        className={inputCls()}
                        value={row.oldSerial}
                        onChange={(e) =>
                          setEquipmentRows((prev) => prev.map((r, i) => (i === idx ? { ...r, oldSerial: e.target.value } : r)))
                        }
                      />
                    </td>
                    <td className="py-2">
                      <input
                        className={inputCls()}
                        value={row.newSerial}
                        onChange={(e) =>
                          setEquipmentRows((prev) => prev.map((r, i) => (i === idx ? { ...r, newSerial: e.target.value } : r)))
                        }
                      />
                    </td>
                    <td className="py-2">
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
                    </td>
                    <td className="py-2">
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
                    </td>
                    <td className="py-2">
                      <input
                        className={inputCls()}
                        value={row.ipAddress}
                        onChange={(e) =>
                          setEquipmentRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ipAddress: e.target.value } : r)))
                        }
                      />
                    </td>
                    <td className="py-2">
                      <input
                        className={inputCls()}
                        value={row.brand}
                        onChange={(e) =>
                          setEquipmentRows((prev) => prev.map((r, i) => (i === idx ? { ...r, brand: e.target.value } : r)))
                        }
                      />
                    </td>
                    <td className="py-2">
                      <input
                        className={inputCls()}
                        value={row.model}
                        onChange={(e) =>
                          setEquipmentRows((prev) => prev.map((r, i) => (i === idx ? { ...r, model: e.target.value } : r)))
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

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
          <div className="mt-3">
            <label className="text-xs text-muted-foreground">Fotos checklist final</label>
            <input type="file" accept="image/*" multiple className={inputCls()} onChange={(e) => setPhotosChecklist(e.target.files)} />
          </div>
        </section>

        <section className="sts-card p-4 md:p-5">
          <h4 className="text-sm font-semibold">Cierre</h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground">Hora inicio (interno)</label>
              <input type="time" className={inputCls()} {...form.register("timeStart")} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Hora cierre (interno)</label>
              <input type="time" className={inputCls()} {...form.register("timeEnd")} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">Observaciones</label>
              <textarea className={textareaCls()} {...form.register("observations")} />
            </div>
          </div>
        </section>

        <button type="submit" className="hidden" />
      </form>
    </div>
  );
}
