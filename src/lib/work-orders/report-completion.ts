// src/lib/work-orders/report-completion.ts
import { CorrectiveReport, PreventiveReport, RenewalTechReport } from "@prisma/client";

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

export function preventiveCompletion(r: PreventiveReport | null | undefined) {
  const reasons: string[] = [];
  if (!r) return { ok: false, reasons: ["No existe el formato PREVENTIVO (debes guardarlo)."] };

  if (!hasText(r.ticketNumber)) reasons.push("Falta número de ticket.");
  if (!r.executedAt) reasons.push("Falta fecha ejecutada.");

  const activities = Array.isArray(r.activities) ? (r.activities as any[]) : [];
  const activitiesOk = activities.length > 0;

  if (!activitiesOk) reasons.push("Falta registrar actividades (al menos 1).");
  if (activitiesOk) {
    const nvrVms = findActivity(activities, "nvr_foto_vms", "foto vms");
    const nvrCabin = findActivity(activities, "nvr_foto_habitaculo", "habitaculo");
    const nvrCanbus = findActivity(activities, "nvr_data_canbus", "canbus");
    const battery = findActivity(activities, "bateria_voltaje", "voltaje bater");

    if (normalizePhotoPaths(nvrVms?.photoPaths).length === 0) reasons.push("Falta foto de VMS.");
    if (normalizePhotoPaths(nvrCabin?.photoPaths).length === 0) reasons.push("Falta foto de habitáculo.");
    if (normalizePhotoPaths(nvrCanbus?.photoPaths).length === 0)
      reasons.push("Falta evidencia de generación de data (CANBUS).");

    if (!hasText(String(battery?.value ?? ""))) reasons.push("Falta valor escrito de voltaje de baterías.");
    if (normalizePhotoPaths(battery?.photoPaths).length === 0) reasons.push("Falta foto de voltaje de baterías.");
  }

  return { ok: reasons.length === 0, reasons };
}

export function correctiveCompletion(r: CorrectiveReport | null | undefined) {
  const reasons: string[] = [];
  if (!r) return { ok: false, reasons: ["No existe el formato CORRECTIVO (debes guardarlo)."] };

  if (!hasText(r.ticketNumber)) reasons.push("Falta número de ticket.");

  return { ok: reasons.length === 0, reasons };
}

type RenewalCompletionKind = "RENOVACION_TECNOLOGICA" | "MEJORA_PRODUCTO";

export function renewalCompletion(
  r: RenewalTechReport | null | undefined,
  kind: RenewalCompletionKind = "RENOVACION_TECNOLOGICA"
) {
  const reasons: string[] = [];
  if (!r) {
    return {
      ok: false,
      reasons: [
        kind === "MEJORA_PRODUCTO"
          ? "No existe el formato MEJORA DE PRODUCTO (debes guardarlo)."
          : "No existe el formato RENOVACION TECNOLOGICA (debes guardarlo).",
      ],
    };
  }

  if (!hasText(r.ticketNumber)) reasons.push("Falta número de ticket.");

  const installation =
    r.newInstallation && typeof r.newInstallation === "object"
      ? (r.newInstallation as Record<string, any>)
      : null;
  const updates = Array.isArray(installation?.equipmentUpdates) ? installation.equipmentUpdates : [];
  if (updates.length === 0) reasons.push("Falta registrar equipos intervenidos.");

  if (kind === "MEJORA_PRODUCTO") {
    const incompleteRows = updates.filter((row: any) => {
      const oldSerial = String(row?.oldSerial ?? "").trim();
      const newSerial = String(row?.newSerial ?? row?.serial ?? "").trim();
      const oldPhotos = normalizePhotoPaths(row?.photoSerialOld);
      const newPhotos = normalizePhotoPaths(row?.photoSerialNew);
      return !oldSerial || !newSerial || oldPhotos.length === 0 || newPhotos.length === 0;
    });
    if (incompleteRows.length) {
      reasons.push("Faltan seriales o fotos (antiguo/nuevo) en uno o más equipos.");
    }
  } else {
    if (!hasText(r.linkSmartHelios)) reasons.push("Falta Link SmartHelios.");
    if (!hasText(r.ipSimcard)) reasons.push("Falta IP de la SIMCARD.");

    const finalChecklistOk = !!r.finalChecklist;
    if (!finalChecklistOk) reasons.push("Falta checklist final.");
  }

  return { ok: reasons.length === 0, reasons };
}
