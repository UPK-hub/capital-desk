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
    classes: "bg-[var(--color-priority-alta)] text-red-700 border-red-200/90",
  },
  2: {
    label: "P2",
    classes: "bg-orange-100 text-orange-700 border-orange-200/90",
  },
  3: {
    label: "P3 Media",
    classes: "bg-[var(--color-priority-media)] text-amber-800 border-amber-200/90",
  },
  4: {
    label: "P4",
    classes: "bg-blue-100 text-blue-700 border-blue-200/90",
  },
  5: {
    label: "P5 Baja",
    classes: "bg-[var(--color-priority-baja)] text-zinc-700 border-zinc-300/90",
  },
} as const;

export function PriorityBadge({ priority, size = "md" }: PriorityBadgeProps) {
  const level = normalize(priority) as 1 | 2 | 3 | 4 | 5;
  const meta = MAP[level];

  return (
    <span
      className={cx(
        "inline-flex items-center rounded-[var(--radius-pill)] border font-medium",
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
