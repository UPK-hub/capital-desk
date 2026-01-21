// src/lib/work-orders/report-completion.ts
import { CorrectiveReport, PreventiveReport } from "@prisma/client";

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

  const devicesOk = Array.isArray(r.devicesInstalled) && r.devicesInstalled.length > 0;
  const activitiesOk = Array.isArray(r.activities) && r.activities.length > 0;

  if (!devicesOk) reasons.push("Falta registrar dispositivos instalados (al menos 1).");
  if (!activitiesOk) reasons.push("Falta registrar actividades (al menos 1).");

  return { ok: reasons.length === 0, reasons };
}

export function correctiveCompletion(r: CorrectiveReport | null | undefined) {
  const reasons: string[] = [];
  if (!r) return { ok: false, reasons: ["No existe el formato CORRECTIVO (debes guardarlo)."] };

  if (!hasText(r.ticketNumber)) reasons.push("Falta número de ticket.");
  if (!hasText(r.diagnosis)) reasons.push("Falta diagnóstico.");
  if (!hasText(r.solution)) reasons.push("Falta solución.");

  return { ok: reasons.length === 0, reasons };
}
