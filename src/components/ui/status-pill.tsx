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
    classes: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-800",
  },
  en_ejecucion: {
    label: "En ejecución",
    icon: Clock3,
    classes:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800",
  },
  activo: {
    label: "Activo",
    icon: CheckCircle2,
    classes:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800",
  },
  completado: {
    label: "Completado",
    icon: Check,
    classes:
      "bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-900/60 dark:text-zinc-300 dark:border-zinc-700",
  },
  bloqueado: {
    label: "Bloqueado",
    icon: XCircle,
    classes: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800",
  },
  cancelado: {
    label: "Cancelado",
    icon: XCircle,
    classes: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800",
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
        "inline-flex items-center rounded-full border font-medium",
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
