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

// Sustento técnico: por qué la descarga falla y por qué el material NO está disponible de forma definitiva.
export const ROOT_CAUSE_TECHNICAL: Record<string, string> = {
  "Cámara desconectada por movimiento":
    "Por vibración o movimiento del vehículo, el conector o el cableado de la cámara se desacopló e interrumpió la señal de video hacia el NVR. El canal no registró imagen válida durante la ventana solicitada, por lo que el material de esa cámara no está disponible de forma definitiva para ese periodo.",
  "Cámara encendida pero sin imagen (imagen negra)":
    "El módulo de imagen/sensor de la cámara presenta falla y entrega imagen negra. Aunque el canal pudo permanecer activo, no capturó imagen útil; el video de esa cámara no es recuperable para la ventana solicitada.",
  "Desconexión de cámara":
    "La cámara perdió comunicación con el NVR (canal sin señal de video). Al no recibir señal, el NVR no generó grabación en ese canal durante la ventana; el material no existe de forma definitiva.",
  "NVR apagado por falla en conexión +15/+30":
    "La pérdida de alimentación en las líneas +15/+30 dejó el NVR fuera de operación. Sin energía, el equipo no registró ningún canal durante la ventana solicitada; no hay grabación disponible para descargar.",
  "NVR apagado por portafusible quemado":
    "El portafusible en falla cortó la alimentación del NVR y lo dejó apagado. Durante ese periodo el NVR no almacenó video de ningún canal; el material no está disponible de forma definitiva.",
  "Ausencia de grabación – tramo no está":
    "El NVR/HDD no contiene el tramo solicitado (por programación de grabación o por sobrescritura/disponibilidad del almacenamiento). El segmento no existe en el dispositivo y no es recuperable.",
};

export function technicalForRootCause(rootCause?: string | null): string {
  if (rootCause && ROOT_CAUSE_TECHNICAL[rootCause]) return ROOT_CAUSE_TECHNICAL[rootCause];
  return "La cámara no entregó material para la ventana solicitada; se requiere diagnóstico técnico en sitio para confirmar la causa.";
}
