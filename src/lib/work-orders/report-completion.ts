// src/lib/work-orders/report-completion.ts
import { CorrectiveReport, PreventiveReport, RenewalTechReport } from "@prisma/client";

function hasText(v?: string | null) {
  return (v ?? "").trim().length > 0;
}

export function preventiveCompletion(r: PreventiveReport | null | undefined) {
  const reasons: string[] = [];
  if (!r) return { ok: false, reasons: ["No existe el formato PREVENTIVO (debes guardarlo)."] };

  if (!hasText(r.ticketNumber)) reasons.push("Falta número de ticket.");
  if (!r.executedAt) reasons.push("Falta fecha ejecutada.");
  if (!hasText(r.timeStart)) reasons.push("Falta hora inicio.");
  if (!hasText(r.timeEnd)) reasons.push("Falta hora fin.");

  const activitiesOk = Array.isArray(r.activities) && r.activities.length > 0;

  if (!activitiesOk) reasons.push("Falta registrar actividades (al menos 1).");

  return { ok: reasons.length === 0, reasons };
}

export function correctiveCompletion(r: CorrectiveReport | null | undefined) {
  const reasons: string[] = [];
  if (!r) return { ok: false, reasons: ["No existe el formato CORRECTIVO (debes guardarlo)."] };

  if (!hasText(r.ticketNumber)) reasons.push("Falta número de ticket.");

  return { ok: reasons.length === 0, reasons };
}

export function renewalCompletion(r: RenewalTechReport | null | undefined) {
  const reasons: string[] = [];
  if (!r) return { ok: false, reasons: ["No existe el formato RENOVACION TECNOLOGICA (debes guardarlo)."] };

  if (!hasText(r.ticketNumber)) reasons.push("Falta número de ticket.");
  if (!hasText(r.linkSmartHelios)) reasons.push("Falta Link SmartHelios.");
  if (!hasText(r.ipSimcard)) reasons.push("Falta IP de la SIMCARD.");
  if (!hasText(r.timeStart)) reasons.push("Falta hora inicio.");
  if (!hasText(r.timeEnd)) reasons.push("Falta hora fin.");

  const finalChecklistOk = !!r.finalChecklist;
  if (!finalChecklistOk) reasons.push("Falta checklist final.");

  return { ok: reasons.length === 0, reasons };
}
