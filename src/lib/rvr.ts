export const RVR_MAX_BUSES_PER_DAY = 30;

export const RVR_CAMERA_ORDER = [
  "BFE",
  "BO",
  "BV1-1",
  "BV1-2",
  "BV1-3",
  "BV1-4",
  "BV2-1",
  "BV2-2",
  "BV3-1",
  "BV3-2",
  "BV3-3",
  "BV3-4",
  "BTE",
] as const;

export type RvrCameraName = (typeof RVR_CAMERA_ORDER)[number];

export type RvrChecklistRow = {
  camera: RvrCameraName;
  complies: "S" | "N" | "";
  observation: string;
  observationCode: string;
};

export function createDefaultRvrChecklist(): RvrChecklistRow[] {
  return RVR_CAMERA_ORDER.map((camera) => ({
    camera,
    complies: "",
    observation: "",
    observationCode: "",
  }));
}

export function normalizeRvrChecklist(input: unknown): RvrChecklistRow[] {
  const defaults = createDefaultRvrChecklist();
  if (!Array.isArray(input)) return defaults;

  const byCamera = new Map<
    string,
    { complies: "S" | "N" | ""; observation: string; observationCode: string }
  >();
  for (const row of input) {
    const camera = String((row as any)?.camera ?? "")
      .trim()
      .toUpperCase();
    if (!camera) continue;
    const compliesRaw = String((row as any)?.complies ?? "")
      .trim()
      .toUpperCase();
    const complies = compliesRaw === "S" || compliesRaw === "N" ? compliesRaw : "";
    const observation = String((row as any)?.observation ?? "").trim();
    const observationCode = String((row as any)?.observationCode ?? "")
      .trim()
      .toUpperCase();
    byCamera.set(camera, { complies, observation, observationCode });
  }

  return defaults.map((row) => {
    const found = byCamera.get(row.camera.toUpperCase());
    if (!found) return row;
    return {
      camera: row.camera,
      complies: found.complies,
      observation: found.observation,
      observationCode: found.observationCode,
    };
  });
}

// Aspectos que valida la revisión remota, por bus (además del detalle por cámara).
export const RVR_BUS_ASPECTS = [
  { key: "transmite", label: "Está transmitiendo" },
  { key: "accesoRemoto", label: "Permite acceso remoto" },
  { key: "p20", label: "Genera P20 correctamente" },
  { key: "p60", label: "Genera P60 correctamente" },
  { key: "coordenadas", label: "Coordenadas correctas" },
] as const;

export type RvrAspectKey = (typeof RVR_BUS_ASPECTS)[number]["key"];
export type RvrAspects = Record<RvrAspectKey, "S" | "N" | "">;

export function createDefaultRvrAspects(): RvrAspects {
  const out = {} as RvrAspects;
  for (const a of RVR_BUS_ASPECTS) out[a.key] = "";
  return out;
}

export function normalizeRvrAspects(input: unknown): RvrAspects {
  const out = createDefaultRvrAspects();
  if (input && typeof input === "object") {
    for (const a of RVR_BUS_ASPECTS) {
      const v = String((input as any)[a.key] ?? "").trim().toUpperCase();
      out[a.key] = v === "S" || v === "N" ? (v as "S" | "N") : "";
    }
  }
  return out;
}

export function asDateInput(value: Date): string {
  const yyyy = value.getUTCFullYear();
  const mm = String(value.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(value.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function parseDateInput(value: string | null | undefined): Date | null {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function pickNvrIpFromEquipments(
  equipments: Array<{
    ipAddress?: string | null;
    equipmentType?: { name?: string | null } | null;
    location?: string | null;
  }>
) {
  const nvr = equipments.find((equipment) => {
    const typeName = String(equipment.equipmentType?.name ?? "").toUpperCase();
    const location = String(equipment.location ?? "").toUpperCase();
    return typeName.includes("NVR") || location.includes("NVR");
  });
  return String(nvr?.ipAddress ?? "").trim() || null;
}
