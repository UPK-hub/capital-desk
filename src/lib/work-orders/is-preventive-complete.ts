import { PreventiveReport } from "@prisma/client";

function hasText(v?: string | null) {
  return (v ?? "").trim().length > 0;
}

function hasNumeric(v: unknown) {
  const raw = String(v ?? "").trim().replace(",", ".");
  if (!raw) return false;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0;
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
      const nvrPing = findActivity(activities, "nvr_ping", "ping");
      const nvrConfig = findActivity(activities, "nvr_config", "configur");
      const nvrBatch = findActivity(activities, "nvr_batch_foto", "batch");
      const nvrWifi = findActivity(activities, "nvr_wifi_foto", "wifi");
      const nvrLte = findActivity(activities, "nvr_lte_foto", "lte");
      const nvrTapa = findActivity(activities, "nvr_tapa_foto", "tapa");
      const nvrPlayback = findActivity(activities, "nvr_playback_foto", "playback");
      const nvrVms = findActivity(activities, "nvr_foto_vms", "foto vms");
      const nvrCabin = findActivity(activities, "nvr_foto_habitaculo", "habitaculo");
      const nvrCanbus = findActivity(activities, "nvr_data_canbus", "canbus");
      const nvrDiskCapacity = findActivity(activities, "nvr_capacidad_discos_foto", "capacidad de discos");
      const nvrRecordingDays = findActivity(activities, "nvr_conteo_dias_grabacion", "conteo de días de grabación");
      const battery = findActivity(activities, "bateria_voltaje", "voltaje bater");
      if (!normalizePhotoPaths(nvrPing?.photoPaths).length) reasons.push("Falta foto ping.");
      if (!normalizePhotoPaths(nvrConfig?.photoPaths).length) reasons.push("Falta foto configuración NVR.");
      if (!normalizePhotoPaths(nvrBatch?.photoPaths).length) reasons.push("Falta foto batch.");
      if (!normalizePhotoPaths(nvrWifi?.photoPaths).length) reasons.push("Falta foto WiFi.");
      if (!normalizePhotoPaths(nvrLte?.photoPaths).length) reasons.push("Falta foto LTE.");
      if (!normalizePhotoPaths(nvrTapa?.photoPaths).length) reasons.push("Falta foto tapa.");
      if (!normalizePhotoPaths(nvrPlayback?.photoPaths).length) reasons.push("Falta foto playback.");
      if (!normalizePhotoPaths(nvrVms?.photoPaths).length) reasons.push("Falta foto VMS.");
      if (!normalizePhotoPaths(nvrCabin?.photoPaths).length) reasons.push("Falta foto habitáculo.");
      if (!normalizePhotoPaths(nvrCanbus?.photoPaths).length) reasons.push("Falta foto data CANBUS.");
      if (!normalizePhotoPaths(nvrDiskCapacity?.photoPaths).length) reasons.push("Falta foto capacidad de discos.");
      if (!hasNumeric(nvrRecordingDays?.value)) reasons.push("Falta valor numérico de días de grabación.");
      if (!hasText(String(battery?.value ?? ""))) reasons.push("Falta valor voltaje baterías.");
      if (!normalizePhotoPaths(battery?.photoPaths).length) reasons.push("Falta foto voltaje baterías.");
    }
  }
  return { ok: reasons.length === 0, reasons };
}
