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
  oldOnly?: boolean;
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

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function inputCls(value?: string) {
  return cx(
    "app-field-control h-9 w-full min-w-0 rounded-xl border px-3 text-sm transition-all focus-visible:outline-none",
    "placeholder:text-muted-foreground/70",
    String(value ?? "").trim().length > 0 && "border-emerald-500/45 bg-emerald-50/30"
  );
}

function textareaCls(value?: string) {
  return cx(
    "app-field-control min-h-[88px] w-full rounded-xl border px-3 py-2 text-sm transition-all focus-visible:outline-none",
    "placeholder:text-muted-foreground/70",
    String(value ?? "").trim().length > 0 && "border-emerald-500/45 bg-emerald-50/30"
  );
}

function progressPct(completed: number, total: number) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((completed / total) * 100)));
}

function StepProgress({
  label,
  completed,
  total,
}: {
  label: string;
  completed: number;
  total: number;
}) {
  const pct = progressPct(completed, total);
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="font-medium text-muted-foreground">{label}</span>
        <span className="font-semibold text-foreground">
          {completed}/{total}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function FileUploadField({
  id,
  files,
  required,
  onFiles,
  onClear,
}: {
  id: string;
  files: FileList | null | undefined;
  required: boolean;
  onFiles: (files: FileList | null) => void;
  onClear: () => void;
}) {
  const count = files?.length ?? 0;
  const firstName = count > 0 ? String(files?.item(0)?.name ?? "") : "";
  return (
    <div className="space-y-1.5">
      <input
        id={id}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => onFiles(e.currentTarget.files)}
      />
      <label
        htmlFor={id}
        className={cx(
          "group flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed px-3 py-2 transition-all",
          count > 0
            ? "border-emerald-500 bg-emerald-50/70 hover:bg-emerald-100/70"
            : "border-border/70 hover:border-primary/50 hover:bg-primary/5"
        )}
      >
        <span
          className={cx(
            "inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-[10px] font-semibold",
            count > 0 ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
          )}
        >
          {count > 0 ? "OK" : "UP"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">
            {count > 0 ? firstName : "Elegir archivos"}
          </span>
          <span className="block text-[11px] text-muted-foreground">
            {count > 0
              ? `${count} archivo(s) seleccionado(s)`
              : required
                ? "JPG/PNG (obligatorio)"
                : "JPG/PNG (opcional)"}
          </span>
        </span>
      </label>
      {count > 0 ? (
        <button
          type="button"
          className="text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
          onClick={onClear}
        >
          Quitar selección
        </button>
      ) : (
        <p className="text-[11px] text-muted-foreground">Ningún archivo seleccionado</p>
      )}
    </div>
  );
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
  "DISCOS_DUROS",
  "COLECTOR",
  "COLECTOR_DATOS",
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

const VIRTUAL_COLLECTOR_ID = "__virtual_colector__";

function normalizeTypeName(value: string) {
  return value
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function isCollectorType(rawType: string) {
  const key = normalizeTypeName(rawType);
  return key.includes("COLECTOR") || key.includes("COLLECTOR");
}

function canonicalTypeKey(rawType: string) {
  const key = normalizeTypeName(rawType);
  if (key.includes("COLLECTOR")) return key.replace("COLLECTOR", "COLECTOR");
  return key;
}

function shouldIncludeRenewalType(rawType: string) {
  const key = canonicalTypeKey(rawType);
  if (!key) return false;

  // Regla de negocio: "COLECTOR" sí entra al desmonte (con foto para acta).
  if (isCollectorType(rawType) || key.includes("COLECTOR")) return true;

  // Excluir tipos que no se diligencian en desmonte de renovación.
  if (key.includes("BATERIA")) return false;
  if (key.includes("CONTROLADOR") && key.includes("CARGA")) return false;
  if (key.includes("MODULO") && key.includes("4G")) return false;
  if (key.includes("MODEM") && key.includes("4G")) return false;
  if (key === "4G" || key.endsWith("_4G")) return false;

  return true;
}

function oldStepTypeLabel(rawType: string) {
  if (isCollectorType(rawType)) return "COLECTOR";
  return rawType;
}

function equipmentSortIndex(type: string) {
  const key = canonicalTypeKey(type);
  const idx = EQUIPMENT_ORDER.indexOf(key as (typeof EQUIPMENT_ORDER)[number]);
  return idx >= 0 ? idx : 9999;
}

function requiresOldPhoto(type: string) {
  return OLD_PHOTO_REQUIRED_TYPES.has(canonicalTypeKey(type));
}

function requiresNewPhoto(type: string) {
  return NEW_PHOTO_REQUIRED_TYPES.has(canonicalTypeKey(type));
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

function usesIpField(rawType: string) {
  const key = canonicalTypeKey(rawType);
  if (!key) return true;
  if (isDiskType(rawType)) return false;
  if (key.includes("BATERIA")) return false;
  if (key.includes("CONTROLADOR") && key.includes("CARGA")) return false;
  if (key.includes("MODULO") && (key.includes("4G") || key.includes("5G"))) return false;
  if (key.includes("MODEM") && (key.includes("4G") || key.includes("5G"))) return false;
  if (key === "4G" || key.endsWith("_4G")) return false;
  if (key === "5G" || key.endsWith("_5G")) return false;
  return true;
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
  const [currentStep, setCurrentStep] = React.useState(1);
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState<string | null>(null);

  const [equipmentRows, setEquipmentRows] = React.useState<EquipmentRow[]>([]);
  const [removedChecklist, setRemovedChecklist] = React.useState<Record<string, boolean>>({});
  const [finalChecklist, setFinalChecklist] = React.useState<Record<string, boolean>>({});
  const [oldPhotosByEquipment, setOldPhotosByEquipment] = React.useState<Record<string, FileList | null>>({});
  const [newPhotosByEquipment, setNewPhotosByEquipment] = React.useState<Record<string, FileList | null>>({});

  const r = props.initialReport as any;
  const oldStepEntries = React.useMemo(() => {
    const all = equipmentRows.map((row, idx) => ({ row, idx }));
    if (isProductImprovement) return all;
    return all.filter(({ row }) => shouldIncludeRenewalType(row.type));
  }, [equipmentRows, isProductImprovement]);
  const newStepEntries = React.useMemo(
    () => equipmentRows.filter((row) => !row.oldOnly),
    [equipmentRows]
  );
  const oldStepTotal = oldStepEntries.length;

  const oldCompletedCount = oldStepEntries.filter(({ row }) => {
    if (!isDiskType(row.type)) return String(row.oldSerial ?? "").trim().length > 0;
    const [s1, s2] = splitSerialPair(row.oldSerial);
    return Boolean(s1 && s2);
  }).length;
  const newCompletedCount = newStepEntries.filter((row) => {
    if (!isDiskType(row.type)) return String(row.newSerial ?? "").trim().length > 0;
    const [s1, s2] = splitSerialPair(row.newSerial);
    return Boolean(s1 && s2);
  }).length;
  const removedDoneCount = REMOVED_ITEMS.filter((item) => Boolean(removedChecklist[item])).length;
  const finalDoneCount = FINAL_CHECKLIST.filter((item) => Boolean(finalChecklist[item])).length;

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
  const observedNotes = form.watch("observations");
  const stepDefs = React.useMemo(() => {
    if (isProductImprovement) {
      return [
        {
          id: "step-old",
          label: "Paso 1 · Equipos actuales",
          complete: oldCompletedCount > 0 && oldCompletedCount >= oldStepTotal,
        },
        {
          id: "step-new",
          label: "Paso 2 · Equipos nuevos",
          complete: newCompletedCount > 0 && newCompletedCount >= newStepEntries.length,
        },
        {
          id: "step-notes",
          label: "Paso 3 · Observaciones",
          complete: String(observedNotes ?? "").trim().length > 0,
        },
      ];
    }
    return [
      {
        id: "step-remove",
        label: "Paso 1 · Desmonte",
        complete: removedDoneCount === REMOVED_ITEMS.length && REMOVED_ITEMS.length > 0,
      },
      {
        id: "step-old",
        label: "Paso 2 · Equipos antiguos",
        complete: oldCompletedCount > 0 && oldCompletedCount >= oldStepTotal,
      },
      {
        id: "step-new",
        label: "Paso 3 · Equipos nuevos",
        complete: newCompletedCount > 0 && newCompletedCount >= newStepEntries.length,
      },
      {
        id: "step-final",
        label: "Paso 4 · Checklist final",
        complete: finalDoneCount === FINAL_CHECKLIST.length && FINAL_CHECKLIST.length > 0,
      },
      {
        id: "step-close",
        label: "Paso 5 · Cierre",
        complete: String(observedNotes ?? "").trim().length > 0,
      },
    ];
  }, [
    isProductImprovement,
    oldCompletedCount,
    oldStepTotal,
    newCompletedCount,
    newStepEntries.length,
    observedNotes,
    removedDoneCount,
    finalDoneCount,
  ]);
  const completeSteps = stepDefs.filter((x) => x.complete).length;
  const stepCompletionPct = progressPct(completeSteps, stepDefs.length);

  const goToStep = React.useCallback(
    (step: number) => {
      if (step < 1 || step > stepDefs.length) return;
      setCurrentStep(step);
      if (typeof document === "undefined") return;
      const targetId = stepDefs[step - 1]?.id;
      if (!targetId) return;
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [stepDefs]
  );

  React.useEffect(() => {
    if (currentStep > stepDefs.length) {
      setCurrentStep(Math.max(1, stepDefs.length));
    }
  }, [currentStep, stepDefs.length]);

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
            oldOnly: Boolean(persisted?.oldOnly ?? false),
          } as EquipmentRow;
        })
        .sort((a: EquipmentRow, b: EquipmentRow) => {
          const diff = equipmentSortIndex(a.type) - equipmentSortIndex(b.type);
          return diff !== 0 ? diff : a.type.localeCompare(b.type, "es");
        });

      if (!isProductImprovement && !rows.some((row) => isCollectorType(row.type))) {
        const persistedCollector = persistedUpdates.find((row: any) =>
          isCollectorType(String(row?.type ?? ""))
        );
        const fallbackCollectorSerial = String(persistedCollector?.oldSerial ?? "");
        rows.push({
          busEquipmentId: VIRTUAL_COLLECTOR_ID,
          type: "COLECTOR",
          ipAddress: "",
          brand: "",
          model: "",
          oldSerial: fallbackCollectorSerial,
          newSerial: String(persistedCollector?.newSerial ?? persistedCollector?.serial ?? ""),
          oldOnly: true,
        });
        rows.sort((a: EquipmentRow, b: EquipmentRow) => {
          const diff = equipmentSortIndex(a.type) - equipmentSortIndex(b.type);
          return diff !== 0 ? diff : a.type.localeCompare(b.type, "es");
        });
      }
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
          equipmentUpdates: equipmentRows.map((row) => ({
            ...row,
            ipAddress: usesIpField(row.type) ? row.ipAddress : "",
          })),
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
  const canGoPrev = currentStep > 1;
  const canGoNext = currentStep < stepDefs.length;
  const canAdvance = canGoNext && Boolean(stepDefs[currentStep - 1]?.complete);

  return (
    <div className="space-y-6">
      <div className="sts-card p-4 md:p-5">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between">
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
            className="sts-btn-primary w-full text-sm disabled:opacity-50 sm:w-auto"
          >
            {loading ? "Cargando..." : saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
        {msg ? <div className="mt-3 rounded-md border p-3 text-sm">{msg}</div> : null}
      </div>

      <section className="sts-card p-4 md:p-5">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {stepDefs.map((step, idx) => {
              const stepNo = idx + 1;
              const active = currentStep === stepNo;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => goToStep(stepNo)}
                  className={cx(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : step.complete
                        ? "border-emerald-400/60 bg-emerald-50 text-emerald-700"
                        : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  )}
                >
                  <span
                    className={cx(
                      "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold",
                      active
                        ? "bg-primary text-primary-foreground"
                        : step.complete
                          ? "bg-emerald-600 text-white"
                          : "bg-muted text-muted-foreground"
                    )}
                  >
                    {stepNo}
                  </span>
                  <span>{step.label}</span>
                </button>
              );
            })}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${stepCompletionPct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Progreso general:{" "}
            <span className="font-semibold text-foreground">
              {completeSteps}/{stepDefs.length}
            </span>
          </p>
        </div>
      </section>

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
          <section id="step-remove" className="sts-card overflow-hidden">
            <div className="border-b border-border/50 bg-muted/30 p-4 md:p-5">
              <h4 className="text-sm font-semibold">Paso 1 · Desmonte de lo antiguo</h4>
              <p className="mt-1 text-xs text-muted-foreground">
                Marca cada componente desmontado para validar avance del cambio tecnológico.
              </p>
              <StepProgress label="Progreso del paso" completed={removedDoneCount} total={REMOVED_ITEMS.length} />
            </div>
            <div className="p-4 md:p-6">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {REMOVED_ITEMS.map((item) => {
                  const selected = Boolean(removedChecklist[item]);
                  return (
                    <label
                      key={item}
                      className={cx(
                        "flex cursor-pointer items-center gap-3 rounded-lg border-2 p-3 transition-all",
                        "hover:border-primary/50 hover:bg-primary/5",
                        selected ? "border-primary bg-primary/10" : "border-border bg-card"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) =>
                          setRemovedChecklist((prev) => ({ ...prev, [item]: e.target.checked }))
                        }
                        className="h-4 w-4 rounded border"
                      />
                      <span className="flex-1 text-sm font-medium">{item}</span>
                      {selected ? <span className="text-[11px] font-semibold text-primary">Listo</span> : null}
                    </label>
                  );
                })}
              </div>
            </div>
          </section>
        ) : null}

        <section id="step-old" className="sts-card overflow-hidden">
          <div className="border-b border-border/50 bg-muted/30 p-4 md:p-5">
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
            <StepProgress label="Avance desmonte" completed={oldCompletedCount} total={oldStepTotal} />
          </div>
          <div className="p-0">
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[980px] table-fixed">
              <colgroup>
                <col className="w-32" />
                <col />
                <col className="w-[22rem]" />
              </colgroup>
              <thead className="border-b border-border/50 bg-muted/45 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3 text-left font-semibold">Tipo</th>
                  <th className="p-3 text-left font-semibold">Serial antiguo</th>
                  <th className="p-3 text-left font-semibold">Foto serial antiguo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {oldStepEntries.map(({ row, idx }) => {
                  const [oldDisk1, oldDisk2] = splitSerialPair(row.oldSerial);
                  const oldRequired = isProductImprovement || requiresOldPhoto(row.type);
                  const oldFiles = oldPhotosByEquipment[row.busEquipmentId] ?? null;
                  const oldUploadId = `old-photo-${row.busEquipmentId}`;
                  return (
                    <tr key={row.busEquipmentId} className="align-top transition-colors hover:bg-muted/20">
                      <td className="p-3">
                        <span className="inline-flex items-center rounded-md border border-border/60 bg-muted px-2.5 py-1 text-xs font-medium">
                          {oldStepTypeLabel(row.type)}
                        </span>
                      </td>
                      <td className="p-3">
                        {isDiskType(row.type) ? (
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <input
                              className={inputCls(oldDisk1)}
                              placeholder="Serial disco 1"
                              value={oldDisk1}
                              onChange={(e) => updateRow(idx, { oldSerial: joinSerialPair(e.target.value, oldDisk2) })}
                            />
                            <input
                              className={inputCls(oldDisk2)}
                              placeholder="Serial disco 2"
                              value={oldDisk2}
                              onChange={(e) => updateRow(idx, { oldSerial: joinSerialPair(oldDisk1, e.target.value) })}
                            />
                          </div>
                        ) : (
                          <input
                            className={inputCls(row.oldSerial)}
                            placeholder="Escribe el serial antiguo..."
                            value={row.oldSerial}
                            onChange={(e) => updateRow(idx, { oldSerial: e.target.value })}
                          />
                        )}
                      </td>
                      <td className="p-3">
                        {oldRequired ? (
                          <FileUploadField
                            id={oldUploadId}
                            files={oldFiles}
                            required={oldRequired}
                            onFiles={(files) =>
                              setOldPhotosByEquipment((prev) => ({
                                ...prev,
                                [row.busEquipmentId]: files,
                              }))
                            }
                            onClear={() =>
                              setOldPhotosByEquipment((prev) => ({
                                ...prev,
                                [row.busEquipmentId]: null,
                              }))
                            }
                          />
                        ) : (
                          <div className="pt-2 text-xs text-muted-foreground">No requerido</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 p-4 lg:hidden">
            {oldStepEntries.map(({ row, idx }) => {
              const [oldDisk1, oldDisk2] = splitSerialPair(row.oldSerial);
              const oldRequired = isProductImprovement || requiresOldPhoto(row.type);
              const oldFiles = oldPhotosByEquipment[row.busEquipmentId] ?? null;
              const oldUploadId = `old-photo-mobile-${row.busEquipmentId}`;
              return (
                <article key={row.busEquipmentId} className="rounded-xl border border-border/60 bg-card p-3">
                  <p className="text-sm font-semibold">{oldStepTypeLabel(row.type)}</p>

                  <div className="mt-3 space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">Serial antiguo</label>
                    {isDiskType(row.type) ? (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <input
                          className={inputCls(oldDisk1)}
                          placeholder="Serial disco 1"
                          value={oldDisk1}
                          onChange={(e) => updateRow(idx, { oldSerial: joinSerialPair(e.target.value, oldDisk2) })}
                        />
                        <input
                          className={inputCls(oldDisk2)}
                          placeholder="Serial disco 2"
                          value={oldDisk2}
                          onChange={(e) => updateRow(idx, { oldSerial: joinSerialPair(oldDisk1, e.target.value) })}
                        />
                      </div>
                    ) : (
                      <input
                        className={inputCls(row.oldSerial)}
                        placeholder="Escribe el serial antiguo..."
                        value={row.oldSerial}
                        onChange={(e) => updateRow(idx, { oldSerial: e.target.value })}
                      />
                    )}
                  </div>

                  <div className="mt-3 space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">Foto serial antiguo</label>
                    {oldRequired ? (
                      <FileUploadField
                        id={oldUploadId}
                        files={oldFiles}
                        required={oldRequired}
                        onFiles={(files) =>
                          setOldPhotosByEquipment((prev) => ({
                            ...prev,
                            [row.busEquipmentId]: files,
                          }))
                        }
                        onClear={() =>
                          setOldPhotosByEquipment((prev) => ({
                            ...prev,
                            [row.busEquipmentId]: null,
                          }))
                        }
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground">No requerido</p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          </div>
        </section>

        <section id="step-new" className="sts-card overflow-hidden">
          <div className="border-b border-border/50 bg-muted/30 p-4 md:p-5">
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
            <StepProgress label="Avance instalación" completed={newCompletedCount} total={newStepEntries.length} />
          </div>
          <div className="p-0">
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[1180px] table-fixed">
              <colgroup>
                <col className="w-24" />
                <col />
                <col className="w-[15rem]" />
                {!isProductImprovement ? <col className="w-32" /> : null}
                {!isProductImprovement ? <col className="w-40" /> : null}
                {!isProductImprovement ? <col className="w-40" /> : null}
              </colgroup>
              <thead className="border-b border-border/50 bg-muted/45 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3 text-left font-semibold">Tipo</th>
                  <th className="p-3 text-left font-semibold">Serial nuevo</th>
                  <th className="p-3 text-left font-semibold">Foto</th>
                  {!isProductImprovement ? <th className="p-3 text-left font-semibold">IP</th> : null}
                  {!isProductImprovement ? <th className="p-3 text-left font-semibold">Marca</th> : null}
                  {!isProductImprovement ? <th className="p-3 text-left font-semibold">Modelo</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {newStepEntries.map((row) => {
                  const idx = equipmentRows.findIndex((x) => x.busEquipmentId === row.busEquipmentId);
                  if (idx < 0) return null;
                  const [newDisk1, newDisk2] = splitSerialPair(row.newSerial);
                  const newRequired = isProductImprovement || requiresNewPhoto(row.type);
                  const newFiles = newPhotosByEquipment[row.busEquipmentId] ?? null;
                  const newUploadId = `new-photo-${row.busEquipmentId}`;
                  return (
                    <tr key={row.busEquipmentId} className="align-top transition-colors hover:bg-muted/20">
                      <td className="p-3">
                        <span className="inline-flex items-center rounded-md border border-border/60 bg-muted px-2 py-1 text-xs font-medium">
                          {row.type}
                        </span>
                      </td>
                      <td className="p-3">
                        {isDiskType(row.type) ? (
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <InventorySerialCombobox
                              value={newDisk1}
                              className={inputCls(newDisk1)}
                              placeholder="Serial disco 1"
                              onChange={(value) => {
                                updateRow(idx, { newSerial: joinSerialPair(value, newDisk2) });
                                void tryAutofillRowModel(idx, value);
                              }}
                              onModelDetected={(model) => {
                                if (!String(row.model ?? "").trim()) updateRow(idx, { model });
                              }}
                            />
                            <InventorySerialCombobox
                              value={newDisk2}
                              className={inputCls(newDisk2)}
                              placeholder="Serial disco 2"
                              onChange={(value) => {
                                updateRow(idx, { newSerial: joinSerialPair(newDisk1, value) });
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
                            className={inputCls(row.newSerial)}
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
                      <td className="p-3">
                        {newRequired ? (
                          <FileUploadField
                            id={newUploadId}
                            files={newFiles}
                            required={newRequired}
                            onFiles={(files) =>
                              setNewPhotosByEquipment((prev) => ({
                                ...prev,
                                [row.busEquipmentId]: files,
                              }))
                            }
                            onClear={() =>
                              setNewPhotosByEquipment((prev) => ({
                                ...prev,
                                [row.busEquipmentId]: null,
                              }))
                            }
                          />
                        ) : (
                          <div className="pt-2 text-xs text-muted-foreground">No requerido</div>
                        )}
                      </td>
                      {!isProductImprovement ? (
                        <td className="p-3">
                          {usesIpField(row.type) ? (
                            <input
                              className={inputCls(row.ipAddress)}
                              placeholder="IP..."
                              value={row.ipAddress}
                              onChange={(e) => updateRow(idx, { ipAddress: e.target.value })}
                            />
                          ) : (
                            <div className="pt-2 text-xs text-muted-foreground">No aplica</div>
                          )}
                        </td>
                      ) : null}
                      {!isProductImprovement ? (
                        <td className="p-3">
                          <input
                            className={inputCls(row.brand)}
                            placeholder="Marca..."
                            value={row.brand}
                            onChange={(e) => updateRow(idx, { brand: e.target.value })}
                          />
                        </td>
                      ) : null}
                      {!isProductImprovement ? (
                        <td className="p-3">
                          <input
                            className={inputCls(row.model)}
                            placeholder="Modelo..."
                            value={row.model}
                            onChange={(e) => updateRow(idx, { model: e.target.value })}
                          />
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 p-4 lg:hidden">
            {newStepEntries.map((row) => {
              const idx = equipmentRows.findIndex((x) => x.busEquipmentId === row.busEquipmentId);
              if (idx < 0) return null;
              const [newDisk1, newDisk2] = splitSerialPair(row.newSerial);
              const newRequired = isProductImprovement || requiresNewPhoto(row.type);
              const newFiles = newPhotosByEquipment[row.busEquipmentId] ?? null;
              const newUploadId = `new-photo-mobile-${row.busEquipmentId}`;
              return (
                <article key={row.busEquipmentId} className="rounded-xl border border-border/60 bg-card p-3">
                  <p className="text-sm font-semibold">{row.type}</p>

                  <div className="mt-3 space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">Serial nuevo</label>
                    {isDiskType(row.type) ? (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <InventorySerialCombobox
                          value={newDisk1}
                          className={inputCls(newDisk1)}
                          placeholder="Serial disco 1"
                          onChange={(value) => {
                            updateRow(idx, { newSerial: joinSerialPair(value, newDisk2) });
                            void tryAutofillRowModel(idx, value);
                          }}
                          onModelDetected={(model) => {
                            if (!String(row.model ?? "").trim()) updateRow(idx, { model });
                          }}
                        />
                        <InventorySerialCombobox
                          value={newDisk2}
                          className={inputCls(newDisk2)}
                          placeholder="Serial disco 2"
                          onChange={(value) => {
                            updateRow(idx, { newSerial: joinSerialPair(newDisk1, value) });
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
                        className={inputCls(row.newSerial)}
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
                  </div>

                  <div className="mt-3 space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">Foto serial nuevo</label>
                    {newRequired ? (
                      <FileUploadField
                        id={newUploadId}
                        files={newFiles}
                        required={newRequired}
                        onFiles={(files) =>
                          setNewPhotosByEquipment((prev) => ({
                            ...prev,
                            [row.busEquipmentId]: files,
                          }))
                        }
                        onClear={() =>
                          setNewPhotosByEquipment((prev) => ({
                            ...prev,
                            [row.busEquipmentId]: null,
                          }))
                        }
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground">No requerido</p>
                    )}
                  </div>

                  {!isProductImprovement ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-muted-foreground">IP</label>
                        {usesIpField(row.type) ? (
                          <input
                            className={inputCls(row.ipAddress)}
                            placeholder="IP..."
                            value={row.ipAddress}
                            onChange={(e) => updateRow(idx, { ipAddress: e.target.value })}
                          />
                        ) : (
                          <p className="rounded-xl border px-3 py-2 text-xs text-muted-foreground">No aplica</p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-muted-foreground">Marca</label>
                        <input
                          className={inputCls(row.brand)}
                          placeholder="Marca..."
                          value={row.brand}
                          onChange={(e) => updateRow(idx, { brand: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-muted-foreground">Modelo</label>
                        <input
                          className={inputCls(row.model)}
                          placeholder="Modelo..."
                          value={row.model}
                          onChange={(e) => updateRow(idx, { model: e.target.value })}
                        />
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
          </div>
        </section>

        {!isProductImprovement ? (
          <section id="step-final" className="sts-card overflow-hidden">
            <div className="border-b border-border/50 bg-muted/30 p-4 md:p-5">
              <h4 className="text-sm font-semibold">Paso 4 · Checklist final instalación</h4>
              <p className="mt-1 text-xs text-muted-foreground">
                Verificación de codificación, IPs, almacenamiento y componentes de cierre.
              </p>
              <StepProgress label="Progreso del paso" completed={finalDoneCount} total={FINAL_CHECKLIST.length} />
            </div>
            <div className="p-4 md:p-6">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {FINAL_CHECKLIST.map((item) => {
                  const selected = Boolean(finalChecklist[item]);
                  return (
                    <label
                      key={item}
                      className={cx(
                        "flex cursor-pointer items-center gap-3 rounded-lg border-2 p-3 transition-all",
                        "hover:border-primary/50 hover:bg-primary/5",
                        selected ? "border-primary bg-primary/10" : "border-border bg-card"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) =>
                          setFinalChecklist((prev) => ({ ...prev, [item]: e.target.checked }))
                        }
                        className="h-4 w-4 rounded border"
                      />
                      <span className="flex-1 text-sm font-medium">{item}</span>
                      {selected ? <span className="text-[11px] font-semibold text-primary">OK</span> : null}
                    </label>
                  );
                })}
              </div>
            </div>
          </section>
        ) : null}

        {!isProductImprovement ? (
          <section id="step-close" className="sts-card overflow-hidden">
            <div className="border-b border-border/50 bg-muted/30 p-4 md:p-5">
              <h4 className="text-sm font-semibold">Paso 5 · Cierre</h4>
            </div>
            <div className="p-4 md:p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground">Observaciones</label>
                  <textarea
                    className={textareaCls(observedNotes)}
                    placeholder="Observaciones de cierre..."
                    {...form.register("observations")}
                  />
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {isProductImprovement ? (
          <section id="step-notes" className="sts-card overflow-hidden">
            <div className="border-b border-border/50 bg-muted/30 p-4 md:p-5">
              <h4 className="text-sm font-semibold">Paso 3 · Observaciones (opcional)</h4>
            </div>
            <div className="p-4 md:p-5">
              <textarea
                className={textareaCls(observedNotes)}
                placeholder="Observaciones..."
                {...form.register("observations")}
              />
            </div>
          </section>
        ) : null}

        <section className="sts-card p-4 md:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => goToStep(currentStep - 1)}
              disabled={!canGoPrev}
              className="sts-btn-ghost text-sm disabled:opacity-50"
            >
              Paso anterior
            </button>

            <div className="flex flex-wrap items-center justify-center gap-2">
              {stepDefs.map((step, idx) => (
                <button
                  key={`jump-${step.id}`}
                  type="button"
                  onClick={() => goToStep(idx + 1)}
                  className={cx(
                    "h-2.5 rounded-full transition-all",
                    currentStep === idx + 1
                      ? "w-12 bg-primary"
                      : step.complete
                        ? "w-8 bg-emerald-500"
                        : "w-8 bg-muted"
                  )}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => goToStep(currentStep + 1)}
              disabled={!canAdvance}
              className="sts-btn-primary text-sm disabled:opacity-50"
            >
              {canGoNext ? "Siguiente paso" : "Último paso"}
            </button>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Puedes guardar en cualquier momento. Esta navegación te ayuda a completar el flujo de forma ordenada.
          </p>
        </section>

        <button type="submit" className="hidden" />
      </form>
    </div>
  );
}
