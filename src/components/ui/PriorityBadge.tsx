import * as React from "react";

export interface PriorityBadgeProps {
  priority: number | string | null | undefined;
  size?: "sm" | "md";
}

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function normalize(priority: PriorityBadgeProps["priority"]) {
  const parsed = Number(priority);
  if (!Number.isFinite(parsed)) return 3;
  return Math.max(1, Math.min(5, Math.round(parsed)));
}

const SIZE: Record<NonNullable<PriorityBadgeProps["size"]>, string> = {
  sm: "px-2 py-0.5 text-[11px]",
  md: "px-2.5 py-1 text-xs",
};

const MAP = {
  1: {
    label: "P1 Alta",
    classes: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800",
  },
  2: {
    label: "P2",
    classes:
      "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-400 dark:border-orange-800",
  },
  3: {
    label: "P3 Media",
    classes:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800",
  },
  4: {
    label: "P4",
    classes: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-800",
  },
  5: {
    label: "P5 Baja",
    classes: "bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-900/60 dark:text-zinc-300 dark:border-zinc-700",
  },
} as const;

export function PriorityBadge({ priority, size = "md" }: PriorityBadgeProps) {
  const level = normalize(priority) as 1 | 2 | 3 | 4 | 5;
  const meta = MAP[level];

  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border font-medium",
        SIZE[size],
        meta.classes
      )}
      aria-label={`Prioridad ${meta.label}`}
      title={`Prioridad ${meta.label}`}
    >
      {meta.label}
    </span>
  );
}
