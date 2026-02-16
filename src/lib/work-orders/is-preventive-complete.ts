import { PreventiveReport } from "@prisma/client";

function hasText(v?: string | null) {
  return (v ?? "").trim().length > 0;
}

function normalizePhotoPaths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((x) => String(x ?? "").trim()).filter(Boolean);
}

function findActivity(rows: any[], key: string, keyword: string) {
  const byKey = rows.find((r) => String(r?.key ?? "").trim() === key);
  if (byKey) return byKey;
  return rows.find((r) => String(r?.activity ?? "").toLowerCase().includes(keyword));
}

export function isPreventiveComplete(r: PreventiveReport | null | undefined) {
  const reasons: string[] = [];
  if (!r) reasons.push("No existe PreventiveReport.");
  if (r && !hasText(r.ticketNumber)) reasons.push("Falta número de ticket.");
  if (r && !r.executedAt) reasons.push("Falta fecha ejecutada.");
  if (r) {
    const activities = Array.isArray(r.activities) ? (r.activities as any[]) : [];
    if (!activities.length) reasons.push("Faltan actividades.");
    if (activities.length) {
      const nvrVms = findActivity(activities, "nvr_foto_vms", "foto vms");
      const nvrCabin = findActivity(activities, "nvr_foto_habitaculo", "habitaculo");
      const nvrCanbus = findActivity(activities, "nvr_data_canbus", "canbus");
      const battery = findActivity(activities, "bateria_voltaje", "voltaje bater");
      if (!normalizePhotoPaths(nvrVms?.photoPaths).length) reasons.push("Falta foto VMS.");
      if (!normalizePhotoPaths(nvrCabin?.photoPaths).length) reasons.push("Falta foto habitáculo.");
      if (!normalizePhotoPaths(nvrCanbus?.photoPaths).length) reasons.push("Falta foto data CANBUS.");
      if (!hasText(String(battery?.value ?? ""))) reasons.push("Falta valor voltaje baterías.");
      if (!normalizePhotoPaths(battery?.photoPaths).length) reasons.push("Falta foto voltaje baterías.");
    }
  }
  return { ok: reasons.length === 0, reasons };
}
