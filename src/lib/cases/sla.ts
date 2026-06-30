// Reglas de SLA de Casos (puras: las usan servidor y cliente).
// Tiempo objetivo de resolución según prioridad (horas desde la creación).
import { addWorkingHoursCO } from "./holidays-co";
export const SLA_HOURS: Record<number, number> = {
  1: 4, // Alta
  2: 8,
  3: 24, // Normal
  4: 48,
  5: 72, // Baja
};

// SLA fijo por TIPO de caso (en horas). Tiene prioridad sobre SLA_HOURS:
// p. ej. las solicitudes de descarga de video siempre tienen 72 h, sin importar la prioridad.
export const SLA_HOURS_BY_TYPE: Record<string, number> = {
  SOLICITUD_DESCARGA_VIDEO: 72,
};

export function slaHoursFor(priority: number, type?: string | null): number {
  if (type && SLA_HOURS_BY_TYPE[type] != null) return SLA_HOURS_BY_TYPE[type];
  return SLA_HOURS[priority] ?? 24;
}

export function isOpenStatus(status: string): boolean {
  return status === "NUEVO" || status === "OT_ASIGNADA" || status === "EN_EJECUCION";
}

export function slaDeadlineMs(createdAtIso: string | Date, priority: number, type?: string | null): number {
  const h = slaHoursFor(priority, type);
  const created = createdAtIso instanceof Date ? createdAtIso.getTime() : new Date(createdAtIso).getTime();
  // Los tipos con SLA fijo por tipo (p. ej. descarga de video) cuentan en HORAS HÁBILES:
  // el reloj se pausa los domingos y festivos de Colombia.
  if (type && SLA_HOURS_BY_TYPE[type] != null) return addWorkingHoursCO(created, h);
  return created + h * 3600000;
}

export type SlaInfo = {
  state: "done" | "ok" | "soon" | "overdue";
  label: string;
  overdue: boolean;
};

export function slaInfo(createdAtIso: string, priority: number, status: string, type?: string | null, now = Date.now()): SlaInfo {
  if (!isOpenStatus(status)) return { state: "done", label: "—", overdue: false };
  const deadline = slaDeadlineMs(createdAtIso, priority, type);
  const diff = deadline - now;
  const overdue = diff < 0;
  const abs = Math.abs(diff);
  const hours = Math.floor(abs / 3600000);
  const mins = Math.floor((abs % 3600000) / 60000);
  const txt = hours >= 24 ? `${Math.floor(hours / 24)} d` : hours >= 1 ? `${hours} h` : `${mins} min`;
  if (overdue) return { state: "overdue", label: `Vencido hace ${txt}`, overdue: true };
  if (diff < 4 * 3600000) return { state: "soon", label: `Vence en ${txt}`, overdue: false };
  return { state: "ok", label: `Vence en ${txt}`, overdue: false };
}
