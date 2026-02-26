"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
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
  ticketRequestedAt?: string | null;
  isCorrectiveFromNovelty?: boolean;
  noveltyAutoFill?: {
    catalogCode?: string;
    affectedEquipment?: string;
    reportedNovelty?: string;
    impact?: string;
    quickCheck?: string;
    quickResult?: string;
    quickNotes?: string;
    quickSuggestedAction?: string;
    quickChecklistSummary?: string;
    quickEvidenceSummary?: string;
    quickSolvedResponse?: string;
    requiresOtResponse?: string;
    standardObservation?: string;
  } | null;
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

type TemplateFields = {
  reportDateTime: string;
  reportChannel: string;
  reportedBy: string;
  reportContact: string;
  productionSp: string;
  busType: string;
  yardLocation: string;
  routeService: string;
  interventionDateTime: string;
  interventionShift: string;
  affectedSystem: string;
  componentName: string;
  symptomNovelty: string;
  operationImpact: string;
  briefDescription: string;
  quickCheckResult: string;
  nextActionResponsible: string;
  requiresNightIntervention: string;
  nightBusStatus: string;
  quickChecklistSummary: string;
  quickEvidenceSummary: string;
  diagnosticStartAt: string;
  diagnosticEndAt: string;
  supportTechnician: string;
  rootCause: string;
  materialsUsed: string;
  evidenceTicketRef: string;
  evidenceBeforeAfter: string;
  evidenceLogs: string;
  evidenceOther: string;
  evidenceBeforeAfterFile: string;
  evidenceLogsFile: string;
  evidenceOtherFile: string;
  finalStatus: string;
  closureDateTime: string;
  clientConformity: string;
  receiverNameRole: string;
  closureNotes: string;
};

type FormValues = TemplateFields & {
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
  bodyworkDismountRequested: boolean;
  bodyworkDismountNotes: string;

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
  photoBodyworkDismount?: FileList;
  evidenceBeforeAfterUpload?: FileList;
  evidenceLogsUpload?: FileList;
  evidenceOtherUpload?: FileList;
};

const REPORT_CHANNEL_OPTIONS = [
  "Mesa de Ayuda",
  "Teléfono",
  "Correo",
  "Chat Mesa de Ayuda",
  "Otro",
] as const;

const SHIFT_OPTIONS = ["Día", "Noche"] as const;

const AFFECTED_SYSTEM_OPTIONS = [
  "CCTV (cámaras)",
  "NVR/Grabación",
  "Red/Conectividad",
  "Energía/PoE",
  "Centro de Monitoreo/VMS",
  "Otro",
] as const;

const IMPACT_OPTIONS = ["Crítico (seguridad/operación)", "Alto", "Medio", "Bajo", "Intermitente"] as const;
const QUICK_RESULT_OPTIONS = [
  "Solucionado en verificación rápida (remoto)",
  "Requiere revisión a profundidad (escalar)",
  "Programar intervención en sitio",
  "Programar intervención nocturna",
  "Escalar a fabricante/RMA",
] as const;

const NIGHT_STATUS_OPTIONS = [
  "No aplica",
  "Solicitado",
  "Autorizado",
  "Programado",
  "Ejecutado",
  "Rechazado",
] as const;

const FINAL_STATUS_OPTIONS = [
  "Cerrado",
  "En seguimiento",
  "Pendiente repuesto",
  "Pendiente programación",
  "Pendiente autorización cliente",
  "Escalado a fabricante",
] as const;

const CLIENT_CONFORMITY_OPTIONS = ["Conforme", "No conforme", "Pendiente"] as const;

const TEMPLATE_KEYS: Array<keyof TemplateFields> = [
  "reportDateTime",
  "reportChannel",
  "reportedBy",
  "reportContact",
  "productionSp",
  "busType",
  "yardLocation",
  "routeService",
  "interventionDateTime",
  "interventionShift",
  "affectedSystem",
  "componentName",
  "symptomNovelty",
  "operationImpact",
  "briefDescription",
  "quickCheckResult",
  "nextActionResponsible",
  "requiresNightIntervention",
  "nightBusStatus",
  "quickChecklistSummary",
  "quickEvidenceSummary",
  "diagnosticStartAt",
  "diagnosticEndAt",
  "supportTechnician",
  "rootCause",
  "materialsUsed",
  "evidenceTicketRef",
  "evidenceBeforeAfter",
  "evidenceLogs",
  "evidenceOther",
  "evidenceBeforeAfterFile",
  "evidenceLogsFile",
  "evidenceOtherFile",
  "finalStatus",
  "closureDateTime",
  "clientConformity",
  "receiverNameRole",
  "closureNotes",
];

function emptyTemplateFields(): TemplateFields {
  return {
    reportDateTime: "",
    reportChannel: "",
    reportedBy: "",
    reportContact: "",
    productionSp: "",
    busType: "",
    yardLocation: "",
    routeService: "",
    interventionDateTime: "",
    interventionShift: "",
    affectedSystem: "",
    componentName: "",
    symptomNovelty: "",
    operationImpact: "",
    briefDescription: "",
    quickCheckResult: "",
    nextActionResponsible: "",
    requiresNightIntervention: "",
    nightBusStatus: "",
    quickChecklistSummary: "",
    quickEvidenceSummary: "",
    diagnosticStartAt: "",
    diagnosticEndAt: "",
    supportTechnician: "",
    rootCause: "",
    materialsUsed: "",
    evidenceTicketRef: "",
    evidenceBeforeAfter: "",
    evidenceLogs: "",
    evidenceOther: "",
    evidenceBeforeAfterFile: "",
    evidenceLogsFile: "",
    evidenceOtherFile: "",
    finalStatus: "",
    closureDateTime: "",
    clientConformity: "",
    receiverNameRole: "",
    closureNotes: "",
  };
}

function parseTemplateData(raw: unknown): TemplateFields {
  const base = emptyTemplateFields();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const source = raw as Record<string, unknown>;
  for (const key of TEMPLATE_KEYS) {
    const value = String(source[key] ?? "").trim();
    if (value) base[key] = value;
  }
  return base;
}

function buildTemplateDataPayload(values: FormValues): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of TEMPLATE_KEYS) {
    const value = String(values[key] ?? "").trim();
    if (value) out[key] = value;
  }
  return out;
}

function isoDate(d?: Date | null) {
  if (!d) return "";
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return "";
  return x.toISOString().slice(0, 10);
}

function toDateInputValue(d: Date) {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return "";
  const year = x.getFullYear();
  const month = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDateTimeInputValue(d: Date) {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return "";
  const year = x.getFullYear();
  const month = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  const hours = String(x.getHours()).padStart(2, "0");
  const minutes = String(x.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function nowDateInput() {
  return toDateInputValue(new Date());
}

function nowDateTimeInput() {
  return toDateTimeInputValue(new Date());
}

function extractFileName(input: string | null | undefined) {
  return String(input ?? "").trim().split("/").pop() ?? "";
}

function inferAffectedSystem(affectedEquipment: string, reportedNovelty: string) {
  const text = `${affectedEquipment} ${reportedNovelty}`.toLowerCase();
  if (text.includes("cam") || text.includes("bfe") || text.includes("bo") || text.includes("bte") || text.includes("bv")) {
    return "CCTV (cámaras)";
  }
  if (text.includes("nvr") || text.includes("grab")) return "NVR/Grabación";
  if (text.includes("router") || text.includes("sim") || text.includes("red") || text.includes("wifi") || text.includes("lte")) {
    return "Red/Conectividad";
  }
  if (text.includes("poe") || text.includes("energ") || text.includes("bater") || text.includes("volt")) {
    return "Energía/PoE";
  }
  if (text.includes("cms") || text.includes("vms") || text.includes("centro")) return "Centro de Monitoreo/VMS";
  return "";
}

function normalizeImpactLabel(raw: string) {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  const lowered = value.toLowerCase();
  if (lowered.includes("crit") || lowered.includes("total")) return "Crítico (seguridad/operación)";
  if (lowered.includes("alto")) return "Alto";
  if (lowered.includes("medio")) return "Medio";
  if (lowered.includes("bajo")) return "Bajo";
  if (lowered.includes("intermit")) return "Intermitente";
  return IMPACT_OPTIONS.includes(value as any) ? value : "";
}

function normalizeQuickCheckLabel(raw: string) {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  const lowered = value.toLowerCase();
  if ((lowered.includes("solucion") || lowered.includes("resuelto")) && (lowered.includes("rápid") || lowered.includes("rapid") || lowered.includes("remot"))) {
    return "Solucionado en verificación rápida (remoto)";
  }
  if (lowered.includes("sitio")) return "Programar intervención en sitio";
  if (lowered.includes("nocturn")) return "Programar intervención nocturna";
  if (lowered.includes("fabricante") || lowered.includes("rma")) return "Escalar a fabricante/RMA";
  if (lowered.includes("escal") || lowered.includes("profund")) return "Requiere revisión a profundidad (escalar)";
  return QUICK_RESULT_OPTIONS.includes(value as any) ? value : "";
}

function normalizeQuickResultCode(raw: string) {
  const value = String(raw ?? "").trim().toUpperCase();
  if (value === "CONFIRMADA") return "Solucionado en verificación rápida (remoto)";
  if (value === "REQUIERE_REVISION") return "Requiere revisión a profundidad (escalar)";
  if (value === "DESCARTADA") return "Programar intervención en sitio";
  return "";
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

type UploadKind =
  | "current"
  | "new"
  | "bodywork"
  | "evidence_before_after"
  | "evidence_logs"
  | "evidence_other";

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
  const [uploadingPhoto, setUploadingPhoto] = React.useState(false);
  const [draftState, setDraftState] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const [uploadedFileNames, setUploadedFileNames] = React.useState<Partial<Record<UploadKind, string>>>({});

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
  const templateDefaults = parseTemplateData((r as any)?.templateData);
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
      ...templateDefaults,
      reportDateTime:
        templateDefaults.reportDateTime ||
        (props.ticketRequestedAt ? toDateTimeInputValue(new Date(props.ticketRequestedAt)) : ""),
      reportChannel: templateDefaults.reportChannel || "Mesa de Ayuda",
      reportedBy: templateDefaults.reportedBy || "Mesa de Ayuda CAPITALBUS",
      busType: templateDefaults.busType || "Biarticulado",
      yardLocation: templateDefaults.yardLocation || "Capitalbus",
      interventionDateTime: templateDefaults.interventionDateTime || nowDateTimeInput(),
      diagnosticStartAt: templateDefaults.diagnosticStartAt || nowDateTimeInput(),
      diagnosticEndAt: templateDefaults.diagnosticEndAt || nowDateTimeInput(),
      closureDateTime: templateDefaults.closureDateTime || nowDateTimeInput(),
      evidenceTicketRef:
        templateDefaults.evidenceTicketRef || props.caseRef || props.suggestedTicketNumber || "",
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

      dateDismount: isoDate(r?.dateDismount) || nowDateInput(),
      dateDelivered: isoDate((r as any)?.dateDelivered) || nowDateInput(),
      bodyworkDismountRequested: Boolean((r as any)?.bodyworkDismountRequested ?? false),
      bodyworkDismountNotes: ((r as any)?.bodyworkDismountNotes as string | null | undefined) ?? "",

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
  const isNoveltyCorrective = Boolean(props.isCorrectiveFromNovelty);
  const noveltyAutoFill = props.noveltyAutoFill ?? null;

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
      if (!curr.componentName?.trim() && equipmentTypeName) patch.componentName = equipmentTypeName;
      if (!curr.reportChannel?.trim()) patch.reportChannel = "Mesa de Ayuda";
      if (!curr.reportedBy?.trim()) patch.reportedBy = "Mesa de Ayuda CAPITALBUS";
      if (!curr.busType?.trim()) patch.busType = "Biarticulado";
      if (!curr.yardLocation?.trim()) patch.yardLocation = "Capitalbus";
      if (!curr.interventionDateTime?.trim()) patch.interventionDateTime = nowDateTimeInput();
      if (!curr.reportDateTime?.trim() && props.ticketRequestedAt) {
        patch.reportDateTime = toDateTimeInputValue(new Date(props.ticketRequestedAt));
      }
      if (!curr.diagnosticStartAt?.trim()) patch.diagnosticStartAt = nowDateTimeInput();
      if (!curr.diagnosticEndAt?.trim()) patch.diagnosticEndAt = nowDateTimeInput();
      if (!curr.closureDateTime?.trim()) patch.closureDateTime = nowDateTimeInput();
      if (!curr.dateDismount?.trim()) patch.dateDismount = nowDateInput();
      if (!curr.dateDelivered?.trim()) patch.dateDelivered = nowDateInput();
      if (!curr.evidenceTicketRef?.trim()) {
        patch.evidenceTicketRef = props.caseRef || props.suggestedTicketNumber || "";
      }

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

      if (isNoveltyCorrective && noveltyAutoFill) {
        const affectedEquipment = String(noveltyAutoFill.affectedEquipment ?? "").trim();
        const reportedNovelty = String(noveltyAutoFill.reportedNovelty ?? "").trim();
        const quickNotes = String(noveltyAutoFill.quickNotes ?? "").trim();
        const quickChecklistSummary = String(noveltyAutoFill.quickChecklistSummary ?? "").trim();
        const quickEvidenceSummary = String(noveltyAutoFill.quickEvidenceSummary ?? "").trim();
        if (!curr.componentName?.trim() && affectedEquipment) patch.componentName = affectedEquipment;
        if (!curr.symptomNovelty?.trim() && reportedNovelty) patch.symptomNovelty = reportedNovelty;
        if (!curr.briefDescription?.trim()) {
          const descriptionLines = [
            reportedNovelty,
            quickNotes ? `Verificación rápida: ${quickNotes}` : "",
          ]
            .filter(Boolean)
            .join("\n");
          if (descriptionLines) patch.briefDescription = descriptionLines;
        }
        if (!curr.affectedSystem?.trim()) {
          const inferredSystem = inferAffectedSystem(affectedEquipment, reportedNovelty);
          if (inferredSystem) patch.affectedSystem = inferredSystem;
        }
        if (!curr.operationImpact?.trim()) {
          const inferredImpact = normalizeImpactLabel(String(noveltyAutoFill.impact ?? ""));
          if (inferredImpact) patch.operationImpact = inferredImpact;
        }
        if (!curr.quickCheckResult?.trim()) {
          const quickFromResult = normalizeQuickResultCode(String(noveltyAutoFill.quickResult ?? ""));
          const quickRaw =
            quickFromResult ||
            String(noveltyAutoFill.quickSolvedResponse ?? "").trim() ||
            String(noveltyAutoFill.quickCheck ?? "").trim() ||
            String(noveltyAutoFill.requiresOtResponse ?? "").trim();
          const inferredQuick = normalizeQuickCheckLabel(quickRaw);
          if (inferredQuick) patch.quickCheckResult = inferredQuick;
        }
        if (!curr.nextActionResponsible?.trim()) {
          const nextAction =
            String(noveltyAutoFill.quickSuggestedAction ?? "").trim() ||
            String(noveltyAutoFill.requiresOtResponse ?? "").trim() ||
            String(noveltyAutoFill.standardObservation ?? "").trim();
          if (nextAction) patch.nextActionResponsible = nextAction;
        }
        if (!curr.quickChecklistSummary?.trim() && quickChecklistSummary) {
          patch.quickChecklistSummary = quickChecklistSummary;
        }
        if (!curr.quickEvidenceSummary?.trim() && quickEvidenceSummary) {
          patch.quickEvidenceSummary = quickEvidenceSummary;
        }
        const quickJoined = `${noveltyAutoFill.quickCheck ?? ""} ${noveltyAutoFill.requiresOtResponse ?? ""} ${noveltyAutoFill.quickSuggestedAction ?? ""} ${noveltyAutoFill.quickNotes ?? ""}`.toLowerCase();
        if (!curr.requiresNightIntervention?.trim() && quickJoined.includes("nocturn")) {
          patch.requiresNightIntervention = "Sí";
        }
        if (!curr.nightBusStatus?.trim() && (patch.requiresNightIntervention === "Sí" || curr.requiresNightIntervention === "Sí")) {
          patch.nightBusStatus = "Solicitado";
        }
      }

      if (Object.keys(patch).length) form.reset({ ...curr, ...patch });

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    props.workOrderId,
    props.ticketRequestedAt,
    props.caseRef,
    props.suggestedTicketNumber,
    isNoveltyCorrective,
    noveltyAutoFill,
  ]);

  const procedureType = form.watch("procedureType");
  const failureType = form.watch("failureType");
  const location = form.watch("location");
  const watchedValues = useWatch({ control: form.control });
  const serialValue = form.watch("serial");
  const newSerialValue = form.watch("newSerial");
  const bodyworkDismountRequested = form.watch("bodyworkDismountRequested");
  const currentPhotoName = form.watch("photoSerialCurrent")?.[0]?.name ?? "";
  const newPhotoName = form.watch("photoSerialNew")?.[0]?.name ?? "";
  const bodyworkPhotoName = form.watch("photoBodyworkDismount")?.[0]?.name ?? "";
  const evidenceBeforeAfterUploadName = form.watch("evidenceBeforeAfterUpload")?.[0]?.name ?? "";
  const evidenceLogsUploadName = form.watch("evidenceLogsUpload")?.[0]?.name ?? "";
  const evidenceOtherUploadName = form.watch("evidenceOtherUpload")?.[0]?.name ?? "";
  const busTypeValue = form.watch("busType");
  const yardLocationValue = form.watch("yardLocation");
  const storedTemplateData =
    (props.initialReport as any)?.templateData &&
    typeof (props.initialReport as any)?.templateData === "object" &&
    !Array.isArray((props.initialReport as any)?.templateData)
      ? ((props.initialReport as any).templateData as Record<string, any>)
      : {};
  const storedBodyworkEvidenceName =
    extractFileName(String((props.initialReport as any)?.photoBodyworkDismount ?? ""));
  const storedCurrentPhotoName = extractFileName(String((props.initialReport as any)?.photoSerialCurrent ?? ""));
  const storedNewPhotoName = extractFileName(String((props.initialReport as any)?.photoSerialNew ?? ""));
  const storedEvidenceBeforeAfterName = extractFileName(
    String(storedTemplateData.evidenceBeforeAfterFile ?? "")
  );
  const storedEvidenceLogsName = extractFileName(String(storedTemplateData.evidenceLogsFile ?? ""));
  const storedEvidenceOtherName = extractFileName(String(storedTemplateData.evidenceOtherFile ?? ""));

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
    if (bodyworkDismountRequested) return;
    form.setValue("bodyworkDismountNotes", "");
    form.setValue("photoBodyworkDismount", undefined as any);
  }, [bodyworkDismountRequested, form]);

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

  const buildPayload = React.useCallback(
    (v: FormValues, strict: boolean) => {
      const isProcedureOtherLocal = v.procedureType === ProcedureType.OTRO;
      const isFailureOtherLocal = v.failureType === FailureType.OTRO;
      const isLocationOtherLocal = v.location === DeviceLocation.OTRO;

      const diagnosis =
        v.diagnosisPreset === "OTRO" ? v.diagnosisOther.trim() : v.diagnosisPreset.trim();
      const solution =
        v.solutionPreset === "OTRO" ? v.solutionOther.trim() : v.solutionPreset.trim();

      const procedureOtherError = requiredIfOther("procedure", isProcedureOtherLocal, v.procedureOther);
      const failureOtherError = requiredIfOther("failure", isFailureOtherLocal, v.failureOther);
      const locationOtherError = requiredIfOther("location", isLocationOtherLocal, v.locationOther);
      if (strict && (procedureOtherError || failureOtherError || locationOtherError)) {
        throw new Error(procedureOtherError || failureOtherError || locationOtherError || "Faltan campos obligatorios.");
      }
      if (strict && v.bodyworkDismountRequested && !v.bodyworkDismountNotes.trim()) {
        throw new Error("Debes describir el desmonte cuando hay solicitud de carrocería.");
      }

      const templateData = buildTemplateDataPayload(v);
      if (!isNoveltyCorrective) {
        delete templateData.affectedSystem;
        delete templateData.componentName;
        delete templateData.symptomNovelty;
        delete templateData.operationImpact;
        delete templateData.briefDescription;
        delete templateData.quickCheckResult;
        delete templateData.nextActionResponsible;
        delete templateData.requiresNightIntervention;
        delete templateData.nightBusStatus;
        delete templateData.quickChecklistSummary;
        delete templateData.quickEvidenceSummary;
      }

      return {
        ...v,
        procedureType: v.procedureType || null,
        failureType: v.failureType || null,
        location: v.location || null,

        procedureOther: isProcedureOtherLocal ? v.procedureOther.trim() : "",
        failureOther: isFailureOtherLocal ? v.failureOther.trim() : "",
        locationOther: isLocationOtherLocal ? v.locationOther.trim() : "",

        ticketNumber: v.ticketNumber.trim(),
        workOrderNumber: v.workOrderNumber.trim(),
        busCode: v.busCode.trim(),
        plate: v.plate.trim(),
        deviceType: v.deviceType.trim(),
        brand: v.brand.trim(),
        model: v.model.trim(),
        serial: v.serial.trim(),
        bodyworkDismountRequested: Boolean(v.bodyworkDismountRequested),
        bodyworkDismountNotes: v.bodyworkDismountNotes.trim(),
        accessoriesWhich: v.accessoriesWhich.trim(),
        physicalState: v.physicalState.trim(),
        diagnosis,
        solution,
        manufacturerEta: v.manufacturerEta.trim(),
        newBrand: v.newBrand.trim(),
        newModel: v.newModel.trim(),
        newSerial: v.newSerial.trim(),
        templateData,
      };
    },
    [isNoveltyCorrective]
  );

  const saveJsonReport = React.useCallback(
    async (payload: ReturnType<typeof buildPayload>, draft = false) => {
      const res = await fetch(
        `/api/work-orders/${props.workOrderId}/corrective-report${draft ? "?draft=1" : ""}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "No se pudo guardar");
      return data;
    },
    [buildPayload, props.workOrderId]
  );

  const uploadPhoto = React.useCallback(
    async (kind: UploadKind, file: File) => {
      const stampedPhoto = await withPhotoWatermark(file, {
        equipmentLabel:
          kind === "current"
            ? `${form.getValues("deviceType") || "Equipo"} · serial actual`
            : kind === "new"
              ? `${form.getValues("deviceType") || "Equipo"} · serial nuevo`
              : kind === "bodywork"
                ? "Solicitud de desmonte por carrocería"
                : kind === "evidence_before_after"
                  ? "Evidencia antes/después"
                  : kind === "evidence_logs"
                    ? "Evidencia capturas/logs"
                    : "Evidencia adicional",
        busCode: props.busCode || form.getValues("busCode") || null,
        caseRef: props.caseRef || null,
      });
      const formData = new FormData();
      formData.append("photoKind", kind);
      formData.append("photo", stampedPhoto);
      const res = await fetch(`/api/work-orders/${props.workOrderId}/corrective-report`, {
        method: "PUT",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "No se pudo subir evidencia");
      setUploadedFileNames((prev) => ({ ...prev, [kind]: file.name }));
    },
    [form, props.busCode, props.caseRef, props.workOrderId]
  );

  const handleInstantUpload = React.useCallback(
    async (
      kind: UploadKind,
      field:
        | "photoSerialCurrent"
        | "photoSerialNew"
        | "photoBodyworkDismount"
        | "evidenceBeforeAfterUpload"
        | "evidenceLogsUpload"
        | "evidenceOtherUpload",
      files: FileList | null
    ) => {
      const file = files?.[0] ?? null;
      if (!file) return;
      setUploadingPhoto(true);
      try {
        await uploadPhoto(kind, file);
        form.setValue(field, undefined as any, { shouldDirty: true });
        setMsg("Evidencia guardada correctamente.");
      } catch (e: any) {
        setMsg(e?.message ?? "No se pudo subir evidencia");
      } finally {
        setUploadingPhoto(false);
      }
    },
    [form, uploadPhoto]
  );

  const autosaveFingerprint = React.useMemo(
    () =>
      JSON.stringify({
        values: watchedValues
          ? {
              ...watchedValues,
              photoSerialCurrent: undefined,
              photoSerialNew: undefined,
              photoBodyworkDismount: undefined,
              evidenceBeforeAfterUpload: undefined,
              evidenceLogsUpload: undefined,
              evidenceOtherUpload: undefined,
            }
          : null,
      }),
    [watchedValues]
  );
  const autosaveReadyRef = React.useRef(false);

  React.useEffect(() => {
    if (loading) return;
    if (!autosaveReadyRef.current) {
      autosaveReadyRef.current = true;
      return;
    }

    const timer = setTimeout(async () => {
      if (saving || uploadingPhoto) return;
      try {
        setDraftState("saving");
        const payload = buildPayload(form.getValues(), false);
        await saveJsonReport(payload, true);
        setDraftState("saved");
      } catch {
        setDraftState("error");
      }
    }, 1400);

    return () => clearTimeout(timer);
  }, [autosaveFingerprint, buildPayload, form, loading, saveJsonReport, saving, uploadingPhoto]);

  async function onSubmit(v: FormValues) {
    setSaving(true);
    setDraftState("idle");
    setMsg(null);
    try {
      const payload = buildPayload(v, true);
      await saveJsonReport(payload, false);

      const currentFile = v.photoSerialCurrent?.[0];
      const newFile = v.photoSerialNew?.[0];
      const bodyworkFile = v.photoBodyworkDismount?.[0];
      const evidenceBeforeAfterFile = v.evidenceBeforeAfterUpload?.[0];
      const evidenceLogsFile = v.evidenceLogsUpload?.[0];
      const evidenceOtherFile = v.evidenceOtherUpload?.[0];

      if (currentFile) await uploadPhoto("current", currentFile);
      if (newFile) await uploadPhoto("new", newFile);
      if (bodyworkFile) await uploadPhoto("bodywork", bodyworkFile);
      if (evidenceBeforeAfterFile) await uploadPhoto("evidence_before_after", evidenceBeforeAfterFile);
      if (evidenceLogsFile) await uploadPhoto("evidence_logs", evidenceLogsFile);
      if (evidenceOtherFile) await uploadPhoto("evidence_other", evidenceOtherFile);

      setMsg("Guardado correctamente");
      setDraftState("saved");
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "No se pudo guardar");
      setDraftState("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="sts-card p-4 md:p-5">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-semibold">Formato Correctivo (CAP-FO-M-CR-002)</h3>
            <p className="text-xs text-muted-foreground">Ajustado a formato STS (secciones 1–7).</p>
          </div>
          <button
            type="button"
            onClick={form.handleSubmit(onSubmit)}
            disabled={saving || loading || uploadingPhoto}
            className="sts-btn-primary w-full text-sm disabled:opacity-50 sm:w-auto"
          >
            {loading ? "Cargando..." : saving ? "Guardando..." : uploadingPhoto ? "Subiendo foto..." : "Guardar"}
          </button>
        </div>

        {msg ? <div className="mt-3 rounded-md border p-3 text-sm">{msg}</div> : null}
        {draftState !== "idle" ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {draftState === "saving"
              ? "Guardando borrador..."
              : draftState === "saved"
                ? "Borrador guardado automáticamente."
                : "No se pudo guardar el borrador automático."}
          </p>
        ) : null}
      </div>

      <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
        <section className="sts-card p-4 md:p-5">
          <h4 className="text-sm font-semibold">1. Datos del caso (Mesa de Ayuda)</h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground">Fecha y hora de reporte</label>
              <input type="datetime-local" className={classInput()} {...form.register("reportDateTime")} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Canal de reporte</label>
              <Select className={classInput()} {...form.register("reportChannel")}>
                <option value="">— Selecciona —</option>
                {REPORT_CHANNEL_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Reportado por (Nombre / Área)</label>
              <input className={classInput()} {...form.register("reportedBy")} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Contacto (tel / correo)</label>
              <input className={classInput()} {...form.register("reportContact")} />
            </div>
          </div>
        </section>

        {/* B. DATOS DEL DISPOSITIVO / EQUIPO */}
        <section className="sts-card p-4 md:p-5">
          <h4 className="text-sm font-semibold">2. Datos del bus y dispositivo</h4>

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
              <label className="text-xs text-muted-foreground">Producción (SP)</label>
              <input className={classInput()} {...form.register("productionSp")} />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Tipo de bus</label>
              <input className={classInput()} value={busTypeValue || "Biarticulado"} readOnly />
              <input type="hidden" {...form.register("busType")} />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Patio / Ubicación</label>
              <input className={classInput()} value={yardLocationValue || "Capitalbus"} readOnly />
              <input type="hidden" {...form.register("yardLocation")} />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Fecha y hora de intervención</label>
              <input type="datetime-local" className={classInput()} {...form.register("interventionDateTime")} />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Turno (Día / Noche)</label>
              <Select className={classInput()} {...form.register("interventionShift")}>
                <option value="">— Selecciona —</option>
                {SHIFT_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
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

        {isNoveltyCorrective ? (
          <>
            <section className="sts-card p-4 md:p-5">
              <h4 className="text-sm font-semibold">3. Pre-diagnóstico - Novedad reportada</h4>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-muted-foreground">Sistema afectado</label>
                  <Select className={classInput()} {...form.register("affectedSystem")}>
                    <option value="">— Selecciona —</option>
                    {AFFECTED_SYSTEM_OPTIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Equipo / Componente</label>
                  <input className={classInput()} {...form.register("componentName")} />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Síntoma / Novedad</label>
                  <input className={classInput()} {...form.register("symptomNovelty")} />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Impacto en operación</label>
                  <Select className={classInput()} {...form.register("operationImpact")}>
                    <option value="">— Selecciona —</option>
                    {IMPACT_OPTIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground">Descripción breve</label>
                  <textarea className={classTextArea()} {...form.register("briefDescription")} />
                </div>
              </div>
            </section>

            <section className="sts-card p-4 md:p-5">
              <h4 className="text-sm font-semibold">3. Pre-diagnóstico - Verificación rápida (primeros 5 min)</h4>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-muted-foreground">Resultado verificación rápida</label>
                  <Select className={classInput()} {...form.register("quickCheckResult")}>
                    <option value="">— Selecciona —</option>
                    {QUICK_RESULT_OPTIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Acción siguiente / responsable</label>
                  <input className={classInput()} {...form.register("nextActionResponsible")} />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">¿Requiere intervención nocturna?</label>
                  <Select className={classInput()} {...form.register("requiresNightIntervention")}>
                    <option value="">— Selecciona —</option>
                    <option value="Sí">Sí</option>
                    <option value="No">No</option>
                  </Select>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Estado solicitud bus noche</label>
                  <Select className={classInput()} {...form.register("nightBusStatus")}>
                    <option value="">— Selecciona —</option>
                    {NIGHT_STATUS_OPTIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground">
                    Paso a paso ejecutado (pre-formulario de novedad)
                  </label>
                  <textarea className={classTextArea()} {...form.register("quickChecklistSummary")} />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground">
                    Evidencia mínima registrada (pre-formulario de novedad)
                  </label>
                  <textarea className={classTextArea()} {...form.register("quickEvidenceSummary")} />
                </div>
              </div>
            </section>
          </>
        ) : (
          <section className="sts-card p-4 md:p-5">
            <h4 className="text-sm font-semibold">3. Pre-diagnóstico</h4>
            <p className="mt-2 text-sm text-muted-foreground">
              Esta sección se habilita cuando el correctivo proviene de una novedad.
            </p>
          </section>
        )}

        {/* E. DIAGNÓSTICO Y SOLUCIÓN */}
        <section className="sts-card p-4 md:p-5">
          <h4 className="text-sm font-semibold">4. Intervención correctiva (técnico)</h4>

          <div className="mt-3 grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground">Fecha/hora inicio diagnóstico</label>
                <input type="datetime-local" className={classInput()} {...form.register("diagnosticStartAt")} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Fecha/hora fin diagnóstico</label>
                <input type="datetime-local" className={classInput()} {...form.register("diagnosticEndAt")} />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">Técnico de apoyo (si aplica)</label>
                <input className={classInput()} {...form.register("supportTechnician")} />
              </div>
            </div>

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

            <div>
              <label className="text-xs text-muted-foreground">Causa raíz</label>
              <textarea className={classTextArea()} {...form.register("rootCause")} />
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

            <div>
              <label className="text-xs text-muted-foreground">Repuestos / materiales (si aplica)</label>
              <textarea className={classTextArea()} {...form.register("materialsUsed")} />
            </div>

          </div>
        </section>

        <section className="sts-card p-4 md:p-5">
          <h4 className="text-sm font-semibold">6. Registro fotográfico y evidencias</h4>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="hidden" {...form.register("evidenceBeforeAfterFile")} />
            <input type="hidden" {...form.register("evidenceLogsFile")} />
            <input type="hidden" {...form.register("evidenceOtherFile")} />
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">Ticket / Caso (ID) donde reposan evidencias</label>
              <input className={classInput()} {...form.register("evidenceTicketRef")} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Evidencia 1 (Fotos antes/después)</label>
              <div className="mt-1 space-y-1.5">
                <label
                  htmlFor={`evidence-before-after-${props.workOrderId}`}
                  className="flex h-24 w-full max-w-[260px] cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border/70 px-3 text-center text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5"
                >
                  Cargar foto o archivo
                </label>
                <input
                  id={`evidence-before-after-${props.workOrderId}`}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
                  className="sr-only"
                  {...form.register("evidenceBeforeAfterUpload", {
                    onChange: (e) => {
                      void handleInstantUpload(
                        "evidence_before_after",
                        "evidenceBeforeAfterUpload",
                        (e.target as HTMLInputElement).files
                      );
                    },
                  })}
                />
                <p className="text-[11px] text-muted-foreground">
                  {evidenceBeforeAfterUploadName ||
                    uploadedFileNames.evidence_before_after ||
                    (storedEvidenceBeforeAfterName
                      ? `Guardado: ${storedEvidenceBeforeAfterName}`
                      : "Ninguna foto o archivo seleccionado")}
                </p>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Evidencia 2 (Capturas VMS / Logs)</label>
              <div className="mt-1 space-y-1.5">
                <label
                  htmlFor={`evidence-logs-${props.workOrderId}`}
                  className="flex h-24 w-full max-w-[260px] cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border/70 px-3 text-center text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5"
                >
                  Cargar foto o archivo
                </label>
                <input
                  id={`evidence-logs-${props.workOrderId}`}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
                  className="sr-only"
                  {...form.register("evidenceLogsUpload", {
                    onChange: (e) => {
                      void handleInstantUpload(
                        "evidence_logs",
                        "evidenceLogsUpload",
                        (e.target as HTMLInputElement).files
                      );
                    },
                  })}
                />
                <p className="text-[11px] text-muted-foreground">
                  {evidenceLogsUploadName ||
                    uploadedFileNames.evidence_logs ||
                    (storedEvidenceLogsName ? `Guardado: ${storedEvidenceLogsName}` : "Ninguna foto o archivo seleccionado")}
                </p>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">Evidencia 3 (Otros)</label>
              <div className="mt-1 space-y-1.5">
                <label
                  htmlFor={`evidence-other-${props.workOrderId}`}
                  className="flex h-24 w-full max-w-[260px] cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border/70 px-3 text-center text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5"
                >
                  Cargar foto o archivo
                </label>
                <input
                  id={`evidence-other-${props.workOrderId}`}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
                  className="sr-only"
                  {...form.register("evidenceOtherUpload", {
                    onChange: (e) => {
                      void handleInstantUpload(
                        "evidence_other",
                        "evidenceOtherUpload",
                        (e.target as HTMLInputElement).files
                      );
                    },
                  })}
                />
                <p className="text-[11px] text-muted-foreground">
                  {evidenceOtherUploadName ||
                    uploadedFileNames.evidence_other ||
                    (storedEvidenceOtherName ? `Guardado: ${storedEvidenceOtherName}` : "Ninguna foto o archivo seleccionado")}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="sts-card p-4 md:p-5">
          <h4 className="text-sm font-semibold">Solicitud de desmonte por carrocería (opcional)</h4>

          <div className="mt-3 grid gap-3">
            <label className="inline-flex items-center gap-3 text-sm">
              <input type="checkbox" {...form.register("bodyworkDismountRequested")} />
              Solicitud de desmonte por parte de carrocería
            </label>

            {bodyworkDismountRequested ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground">Desmonte correctivo (detalle)</label>
                  <textarea
                    className={classTextArea()}
                    placeholder="Describe el desmonte solicitado por carrocería y la acción ejecutada."
                    {...form.register("bodyworkDismountNotes")}
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Evidencia del desmonte</label>
                  <div className="mt-1 space-y-1.5">
                    <label
                      htmlFor={`photo-bodywork-dismount-${props.workOrderId}`}
                      className="flex h-24 w-full max-w-[260px] cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border/70 px-3 text-center text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5"
                    >
                      Cargar foto o archivo
                    </label>
                    <input
                      id={`photo-bodywork-dismount-${props.workOrderId}`}
                      type="file"
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
                      className="sr-only"
                      {...form.register("photoBodyworkDismount", {
                        onChange: (e) => {
                          void handleInstantUpload(
                            "bodywork",
                            "photoBodyworkDismount",
                            (e.target as HTMLInputElement).files
                          );
                        },
                      })}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {bodyworkPhotoName ||
                        uploadedFileNames.bodywork ||
                        (storedBodyworkEvidenceName
                          ? `Guardado: ${storedBodyworkEvidenceName}`
                          : "Ninguna foto o archivo seleccionado")}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Activa esta opción solo cuando haya solicitud adicional de desmonte por parte de carrocería.
              </p>
            )}
          </div>
        </section>

        {/* Cambio de componente */}
        {isCambioComponente ? (
          <section className="sts-card p-4 md:p-5">
            <h4 className="text-sm font-semibold">5. Equipo reemplazado (si aplica)</h4>

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
                    {...form.register("photoSerialCurrent", {
                      onChange: (e) => {
                        void handleInstantUpload(
                          "current",
                          "photoSerialCurrent",
                          (e.target as HTMLInputElement).files
                        );
                      },
                    })}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {currentPhotoName ||
                      uploadedFileNames.current ||
                      (storedCurrentPhotoName ? `Guardado: ${storedCurrentPhotoName}` : "Ninguna foto o archivo seleccionado")}
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
                    {...form.register("photoSerialNew", {
                      onChange: (e) => {
                        void handleInstantUpload("new", "photoSerialNew", (e.target as HTMLInputElement).files);
                      },
                    })}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {newPhotoName ||
                      uploadedFileNames.new ||
                      (storedNewPhotoName ? `Guardado: ${storedNewPhotoName}` : "Ninguna foto o archivo seleccionado")}
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

        <section className="sts-card p-4 md:p-5">
          <h4 className="text-sm font-semibold">7. Cierre, conformidad y firmas</h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground">Estado final del correctivo</label>
              <Select className={classInput()} {...form.register("finalStatus")}>
                <option value="">— Selecciona —</option>
                {FINAL_STATUS_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Fecha y hora de cierre</label>
              <input type="datetime-local" className={classInput()} {...form.register("closureDateTime")} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Conformidad del cliente</label>
              <Select className={classInput()} {...form.register("clientConformity")}>
                <option value="">— Selecciona —</option>
                {CLIENT_CONFORMITY_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Nombre / Cargo quien recibe</label>
              <input className={classInput()} {...form.register("receiverNameRole")} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">Observaciones de cierre</label>
              <textarea className={classTextArea()} {...form.register("closureNotes")} />
            </div>
          </div>
        </section>

        <button type="submit" className="hidden" />
      </form>
    </div>
  );
}
