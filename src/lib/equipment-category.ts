// Detección de categoría de equipos de bus, compartida entre la UI web
// (BusEquipmentMultiSelect) y el backend (intake de novedades del bot), para que
// "qué es una cámara" sea EXACTAMENTE lo mismo en ambos lados y no se desincronice.
//
// Las cámaras de CapitalBus no siempre se llaman "Cámara": muchas se identifican
// por su código de posición (BFE, BTE, BO, BVn...) en el nombre del tipo o en la
// ubicación. Por eso el match considera nombre + ubicación.

export function normalizeEquipText(value?: string | null): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// Mismo patrón que usa la UI web para clasificar como cámara.
const CAMERA_RE = /(^|\s)(camara|camera|bfe|bte|bo|bv[_a-z0-9-]*)(\s|$)/;

/** ¿El equipo (por nombre de tipo y/o ubicación) es una cámara? */
export function isCameraEquipment(name?: string | null, location?: string | null): boolean {
  return CAMERA_RE.test(normalizeEquipText(`${name ?? ""} ${location ?? ""}`));
}
