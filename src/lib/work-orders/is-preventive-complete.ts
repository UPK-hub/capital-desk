import { PreventiveReport } from "@prisma/client";

export function isPreventiveComplete(r: PreventiveReport | null | undefined) {
  const reasons: string[] = [];
  if (!r) reasons.push("No existe PreventiveReport.");
  if (r && (!r.ticketNumber || !r.ticketNumber.trim())) reasons.push("Falta número de ticket.");
  if (r && !r.executedAt) reasons.push("Falta fecha ejecutada.");
  if (r && (!r.timeStart || !r.timeStart.trim())) reasons.push("Falta hora inicio.");
  if (r && (!r.timeEnd || !r.timeEnd.trim())) reasons.push("Falta hora fin.");
  return { ok: reasons.length === 0, reasons };
}
