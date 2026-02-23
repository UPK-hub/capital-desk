import * as React from "react";
import { Check, CheckCircle2, Circle, Clock3, XCircle } from "lucide-react";

export type StatusPillStatus =
  | "nuevo"
  | "en_ejecucion"
  | "activo"
  | "completado"
  | "bloqueado"
  | "cancelado";

export interface StatusPillProps {
  status: StatusPillStatus;
  showIcon?: boolean;
  size?: "sm" | "md";
  pulse?: boolean;
  label?: string;
}

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

const STATUS_META: Record<
  StatusPillStatus,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    classes: string;
  }
> = {
  nuevo: {
    label: "Nuevo",
    icon: Circle,
    classes: "bg-[var(--color-status-nuevo)] text-[var(--color-status-nuevo-text)] border-blue-200/90",
  },
  en_ejecucion: {
    label: "En ejecución",
    icon: Clock3,
    classes: "bg-[var(--color-status-ejecucion)] text-[var(--color-status-ejecucion-text)] border-amber-200/90",
  },
  activo: {
    label: "Activo",
    icon: CheckCircle2,
    classes: "bg-[var(--color-status-resuelto)] text-[var(--color-status-resuelto-text)] border-emerald-200/90",
  },
  completado: {
    label: "Completado",
    icon: Check,
    classes: "bg-[var(--color-status-resuelto)] text-[var(--color-status-resuelto-text)] border-emerald-200/90",
  },
  bloqueado: {
    label: "Bloqueado",
    icon: XCircle,
    classes: "bg-red-50 text-red-700 border-red-200/90",
  },
  cancelado: {
    label: "Cancelado",
    icon: XCircle,
    classes: "bg-red-50 text-red-700 border-red-200/90",
  },
};

const SIZE_CLASSES: Record<NonNullable<StatusPillProps["size"]>, string> = {
  sm: "px-2 py-0.5 text-[11px] gap-1",
  md: "px-3 py-1 text-xs gap-1.5",
};

export function StatusPill({
  status,
  showIcon = true,
  size = "md",
  pulse = false,
  label,
}: StatusPillProps) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  const renderLabel = label ?? meta.label;

  return (
    <span
      className={cx(
        "inline-flex items-center rounded-[var(--radius-pill)] border font-medium",
        SIZE_CLASSES[size],
        meta.classes,
        pulse && status === "en_ejecucion" && "animate-pulse"
      )}
      aria-label={renderLabel}
      title={renderLabel}
    >
      {showIcon ? <Icon className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
      <span>{renderLabel}</span>
    </span>
  );
}
