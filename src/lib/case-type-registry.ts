import { CaseType } from "@prisma/client";

export type FormKind = "CORRECTIVE" | "PREVENTIVE";

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
  },

  MEJORA_PRODUCTO: {
    type: "MEJORA_PRODUCTO",
    label: "Mejora de producto",
    requiresWorkOrder: true,
    requiresEquipment: false,
    defaultTitle: (busCode) => `Mejora de producto ${busCode ? `- ${busCode}` : ""}`.trim(),
    defaultDescription: (busCode) =>
      `Solicitud de mejora${busCode ? ` relacionada al bus ${busCode}` : ""}. Describe oportunidad y evidencia.`,
    finishRequiresForm: false,
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
  },
};
