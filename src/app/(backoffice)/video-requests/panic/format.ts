import { PanicClipStatus, PanicEventStatus } from "@prisma/client";

export const STATUS_LABEL: Record<PanicEventStatus, string> = {
  PENDIENTE: "Pendiente",
  EN_REVISION: "En revisión",
  ATENDIDO: "Atendido",
  DESCARTADO: "Descartado",
};

export const CLIP_STATUS_LABEL: Record<PanicClipStatus, string> = {
  COMPLETO: "Completo",
  INCOMPLETO: "Incompleto",
  RECHAZADO: "Rechazado",
};

// La mesa se renderiza en el servidor, cuya zona puede no ser la de la operación:
// se fija explícitamente para que las horas coincidan con las del bus.
export const PANIC_TIMEZONE = process.env.NEXT_PUBLIC_PANIC_TIMEZONE || "America/Bogota";

export function fmtDateTime(value: Date | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: PANIC_TIMEZONE,
  }).format(value);
}

export function fmtBytes(value: bigint | number | null | undefined) {
  const bytes = typeof value === "bigint" ? Number(value) : Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function fmtDuration(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) return "-";
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${min}:${String(sec).padStart(2, "0")} min`;
}
