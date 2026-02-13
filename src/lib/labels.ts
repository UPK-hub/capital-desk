const toTitle = (value: string) =>
  value
    .toLowerCase()
    .split(" ")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");

export const caseStatusLabels: Record<string, string> = {
  NUEVO: "Nuevo",
  OT_ASIGNADA: "OT asignada",
  EN_EJECUCION: "En ejecución",
  RESUELTO: "Resuelto",
  CERRADO: "Cerrado",
};

export const caseTypeLabels: Record<string, string> = {
  NOVEDAD: "Novedad",
  CORRECTIVO: "Correctivo",
  PREVENTIVO: "Preventivo",
  RENOVACION_TECNOLOGICA: "Renovación tecnológica",
  MEJORA_PRODUCTO: "Mejora de producto",
  SOLICITUD_DESCARGA_VIDEO: "Solicitud descarga video",
};

export const workOrderStatusLabels: Record<string, string> = {
  CREADA: "Creada",
  ASIGNADA: "Asignada",
  EN_CAMPO: "En campo",
  EN_VALIDACION: "En validacion",
  FINALIZADA: "Finalizada",
};

export const stsStatusLabels: Record<string, string> = {
  OPEN: "Abierta",
  IN_PROGRESS: "En curso",
  WAITING_VENDOR: "En espera proveedor",
  RESOLVED: "Resuelta",
  CLOSED: "Cerrada",
};

export const stsSeverityLabels: Record<string, string> = {
  EMERGENCY: "Emergencia",
  HIGH: "Alta",
  MEDIUM: "Media",
  LOW: "Baja",
};

export const stsChannelLabels: Record<string, string> = {
  PHONE: "Teléfono",
  EMAIL: "Correo",
  CHAT: "Chat",
  OTHER: "Otro",
};

export const stsMetricLabels: Record<string, string> = {
  SUPPORT_RESPONSE: "Respuesta soporte",
  AVAILABILITY: "Disponibilidad",
  PREVENTIVE_MAINTENANCE: "Mantenimiento preventivo",
  TRANSMISSION: "Transmisión",
  DATA_CAPTURE: "Captura de datos",
  RECORDING: "Grabación",
  IMAGE_QUALITY_RECORDED: "Calidad video grabado",
  IMAGE_QUALITY_TRANSMITTED: "Calidad video transmitido",
  PANIC_ALARM_GENERATION: "Alarmas botón pánico",
};

export const videoCaseStatusLabels: Record<string, string> = {
  EN_ESPERA: "En espera",
  EN_CURSO: "En curso",
  COMPLETADO: "Completado",
};

export const videoDownloadStatusLabels: Record<string, string> = {
  DESCARGA_REALIZADA: "Descarga realizada",
  DESCARGA_FALLIDA: "Descarga fallida",
  BUS_NO_EN_PATIO: "Bus no en patio",
  PENDIENTE: "Pendiente",
};

export const videoOriginLabels: Record<string, string> = {
  TRANSMILENIO_SA: "Transmilenio S.A.",
  INTERVENTORIA: "Interventoría",
  CAPITAL_BUS: "Capital Bus",
  OTRO: "Otro",
};

export const videoDeliveryLabels: Record<string, string> = {
  WINSCP: "WinSCP",
  USB: "USB",
  ONEDRIVE: "OneDrive",
};

export const videoAttachmentLabels: Record<string, string> = {
  VIDEO: "Video",
  OTRO: "Otro",
};

export function labelFromMap(value: string | null | undefined, map: Record<string, string>) {
  if (!value) return "";
  return map[value] ?? toTitle(value.replace(/_/g, " "));
}
