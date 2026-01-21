import { CaseEventType } from "@prisma/client";

export const CASE_EVENT_LABELS: Record<CaseEventType, string> = {
  CREATED: "Caso creado",
  ASSIGNED: "Asignación",
  NOTIFIED: "Notificación",
  STATUS_CHANGE: "Cambio de estado",
  COMMENT: "Comentario",
};

export function fmtCaseNo(n: number | null | undefined) {
  if (!n) return "—";
  return `CASO-${String(n).padStart(3, "0")}`;
}

export function fmtWoNo(n: number | null | undefined) {
  if (!n) return "—";
  return `OT-${String(n).padStart(3, "0")}`;
}
