import { CaseType } from "@prisma/client";

export type FormKind = "CORRECTIVE" | "PREVENTIVE" | "RENEWAL";

export type CaseTypeConfig = {
  type: CaseType;
  label: string;

  requiresWorkOrder: boolean;
  requiresEquipment: boolean;

  defaultTitle: (busCode?: string) => string;
  defaultDescription: (busCode?: string) => string;

  // Caso tipo video: formulario inline al crear Case
  hasInlineCreateForm?: boolean;

  // OT: formulario requerido para poder finalizar
  finishRequiresForm?: boolean;
  formKind?: FormKind;

  // STS mapping (by CaseType)
  stsComponentCode?: string;

  // SLA TransMilenio: minutos estándar para calcular inicio hacia atrás
  tmDurationMinutes?: number;
};

export const CASE_TYPE_REGISTRY: Record<CaseType, CaseTypeConfig> = {
  NOVEDAD: {
    type: "NOVEDAD",
    label: "Novedad",
    requiresWorkOrder: false,
    requiresEquipment: false,
    defaultTitle: (busCode) => `Novedad ${busCode ? `- ${busCode}` : ""}`.trim(),
    defaultDescription: (busCode) =>
      `Reporte de novedad${busCode ? ` en el bus ${busCode}` : ""}. Describe el hallazgo y contexto.`,
    finishRequiresForm: false,
    stsComponentCode: "CENTRAL_DEVICE",
  },

  CORRECTIVO: {
    type: "CORRECTIVO",
    label: "Correctivo",
    requiresWorkOrder: true,
    requiresEquipment: true,
    defaultTitle: (busCode) => `Correctivo ${busCode ? `- ${busCode}` : ""}`.trim(),
    defaultDescription: (busCode) =>
      `Falla correctiva${busCode ? ` en el bus ${busCode}` : ""}. Detalla síntomas, condiciones y prioridad.`,
    finishRequiresForm: true,
    formKind: "CORRECTIVE",
    stsComponentCode: "CCTV",
    tmDurationMinutes: 60,
  },

  PREVENTIVO: {
    type: "PREVENTIVO",
    label: "Preventivo",
    requiresWorkOrder: true,
    requiresEquipment: true,
    defaultTitle: (busCode) => `Preventivo ${busCode ? `- ${busCode}` : ""}`.trim(),
    defaultDescription: (busCode) =>
      `Actividad preventiva${busCode ? ` para el bus ${busCode}` : ""}. Indica alcance y periodicidad.`,
    finishRequiresForm: true,
    formKind: "PREVENTIVE",
    stsComponentCode: "CCTV",
    tmDurationMinutes: 60,
  },

  RENOVACION_TECNOLOGICA: {
    type: "RENOVACION_TECNOLOGICA",
    label: "Renovación tecnológica",
    requiresWorkOrder: true,
    requiresEquipment: false,
    defaultTitle: (busCode) => `Renovación tecnológica ${busCode ? `- ${busCode}` : ""}`.trim(),
    defaultDescription: (busCode) =>
      `Renovación tecnológica del sistema STS${busCode ? ` para el bus ${busCode}` : ""}. Incluye desmonte, instalación y checklist final.`,
    finishRequiresForm: true,
    formKind: "RENEWAL",
    stsComponentCode: "CENTRAL_DEVICE",
    tmDurationMinutes: 120,
  },

  MEJORA_PRODUCTO: {
    type: "MEJORA_PRODUCTO",
    label: "Mejora de producto",
    requiresWorkOrder: true,
    requiresEquipment: true,
    defaultTitle: (busCode) => `Mejora de producto ${busCode ? `- ${busCode}` : ""}`.trim(),
    defaultDescription: (busCode) =>
      `Mejora de producto${busCode ? ` en el bus ${busCode}` : ""}. Registra serial antiguo/nuevo, evidencia fotográfica y equipos intervenidos.`,
    finishRequiresForm: true,
    formKind: "RENEWAL",
    stsComponentCode: "CENTRAL_DEVICE",
    tmDurationMinutes: 120,
  },

  SOLICITUD_DESCARGA_VIDEO: {
    type: "SOLICITUD_DESCARGA_VIDEO",
    label: "Solicitud descarga de video",
    requiresWorkOrder: false,
    requiresEquipment: false,
    hasInlineCreateForm: true,
    defaultTitle: (busCode) => `Solicitud descarga de video ${busCode ? `- ${busCode}` : ""}`.trim(),
    defaultDescription: (busCode) =>
      `Solicitud de descarga de video${busCode ? ` para el bus ${busCode}` : ""}. Completa el formulario.`,
    finishRequiresForm: false,
    stsComponentCode: "CCTV",
  },
};
