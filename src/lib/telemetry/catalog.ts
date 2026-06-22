// Catálogo oficial de eventos (EV1–EV18) y alarmas (ALA1–ALA7) según el
// "Diccionario de datos" de CapitalBus. Se usa para presentar la telemetría
// dividida por número de evento / número de alarma, en orden y completa.

export type TramaCatalogItem = { n: number; code: string; label: string };

export const EVENT_CATALOG: TramaCatalogItem[] = [
  { n: 1, code: "EV1", label: "Parada en estación" },
  { n: 2, code: "EV2", label: "Cambio de apertura o cierre de puertas" },
  { n: 3, code: "EV3", label: "Cambio de estado del sistema de ventilación" },
  { n: 4, code: "EV4", label: "Cambio de estado del sistema de iluminación" },
  { n: 5, code: "EV5", label: "Cambio de estado del sistema limpia parabrisas" },
  { n: 6, code: "EV6", label: "Encendido de vehículo" },
  { n: 7, code: "EV7", label: "Apagado del vehículo" },
  { n: 8, code: "EV8", label: "Cambio de conductor" },
  { n: 9, code: "EV9", label: "Activación de botón de pánico" },
  { n: 10, code: "EV10", label: "Accidente o colisión" },
  { n: 11, code: "EV11", label: "Por demanda" },
  { n: 12, code: "EV12", label: "Desconexión de energía principal del STS" },
  { n: 13, code: "EV13", label: "Evento de encendido del STS" },
  { n: 14, code: "EV14", label: "Evento de apagado del STS" },
  { n: 15, code: "EV15", label: "Inicio de operación" },
  { n: 16, code: "EV16", label: "Fin de operación" },
  { n: 17, code: "EV17", label: "Reconexión de energía principal del STS" },
  { n: 18, code: "EV18", label: "Silla vacía del conductor" },
];

export const ALARM_CATALOG: TramaCatalogItem[] = [
  { n: 1, code: "ALA1", label: "Aceleración brusca" },
  { n: 2, code: "ALA2", label: "Frenada brusca" },
  { n: 3, code: "ALA3", label: "Exceso de velocidad" },
  { n: 4, code: "ALA4", label: "Exceso de peso" },
  { n: 5, code: "ALA5", label: "Ausencia imagen cámara del conductor" },
  { n: 6, code: "ALA6", label: "Ausencia de imagen de cámara CCTV distinta a la del conductor" },
  { n: 7, code: "ALA7", label: "Giro brusco" },
];

export const ALARM_LEVELS: { code: string; label: string }[] = [
  { code: "N1", label: "Crítico superior" },
  { code: "N2", label: "Tolerable superior" },
  { code: "N3", label: "Normal (no genera alarma)" },
  { code: "N4", label: "Tolerable inferior" },
  { code: "N5", label: "Crítico inferior" },
];

/** Extrae el número de un código de evento/alarma: "EV13"|"EVE13" -> 13, "ALA3" -> 3. */
export function codeNumber(code?: string | null): number | null {
  const m = String(code ?? "").match(/(\d+)/);
  return m ? Number(m[1]) : null;
}
