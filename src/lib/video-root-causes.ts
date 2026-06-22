// Causas raíz para descargas de video fallidas.
// Lista compartida por la UI (selector), el API (validación) y el informe PDF.
export const VIDEO_ROOT_CAUSES = [
  "Cámara desconectada por movimiento",
  "Cámara encendida pero sin imagen (imagen negra)",
  "Desconexión de cámara",
  "NVR apagado por falla en conexión +15/+30",
  "NVR apagado por portafusible quemado",
  "Ausencia de grabación – tramo no está",
] as const;

export type VideoRootCause = (typeof VIDEO_ROOT_CAUSES)[number];

export function isValidRootCause(value: unknown): value is VideoRootCause {
  return typeof value === "string" && (VIDEO_ROOT_CAUSES as readonly string[]).includes(value);
}

// Acción concreta que se realizará para subsanar cada causa raíz (usada en el informe PDF).
export const ROOT_CAUSE_ACTIONS: Record<string, string> = {
  "Cámara desconectada por movimiento":
    "Reajuste y fijación de la cámara y sus soportes, revisión del conector y prueba de imagen tras la corrección.",
  "Cámara encendida pero sin imagen (imagen negra)":
    "Diagnóstico del módulo de imagen/lente y del cableado de video; reemplazo de la cámara si la falla persiste.",
  "Desconexión de cámara":
    "Revisión y reconexión del cableado de la cámara, prueba de continuidad y verificación de transmisión al NVR.",
  "NVR apagado por falla en conexión +15/+30":
    "Revisión de la conexión de alimentación +15/+30 del NVR, restablecimiento y verificación de encendido y grabación.",
  "NVR apagado por portafusible quemado":
    "Reemplazo del portafusible quemado y verificación de la alimentación del NVR; prueba de grabación.",
  "Ausencia de grabación – tramo no está":
    "Validación de la programación de grabación, estado del NVR/HDD y disponibilidad del tramo; re-descarga al confirmar grabación.",
};

export function actionForRootCause(rootCause?: string | null): string {
  if (rootCause && ROOT_CAUSE_ACTIONS[rootCause]) return ROOT_CAUSE_ACTIONS[rootCause];
  return "Diagnóstico técnico en sitio para determinar y ejecutar la corrección.";
}
