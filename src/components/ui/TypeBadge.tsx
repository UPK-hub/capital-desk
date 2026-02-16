import * as React from "react";

export interface TypeBadgeProps {
  type: string;
  label?: string;
  size?: "sm" | "md";
}

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

const SIZE: Record<NonNullable<TypeBadgeProps["size"]>, string> = {
  sm: "px-2 py-0.5 text-[11px]",
  md: "px-2.5 py-1 text-xs",
};

function classesForType(type: string) {
  const key = String(type ?? "").trim().toUpperCase();
  if (key === "CORRECTIVO") {
    return "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-400 dark:border-rose-800";
  }
  if (key === "PREVENTIVO") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800";
  }
  if (key === "RENOVACION_TECNOLOGICA") {
    return "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-400 dark:border-indigo-800";
  }
  if (key === "NOVEDAD") {
    return "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-400 dark:border-sky-800";
  }
  if (key === "SOLICITUD_DESCARGA_VIDEO") {
    return "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/50 dark:text-violet-400 dark:border-violet-800";
  }
  if (key === "MEJORA_PRODUCTO") {
    return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800";
  }
  return "bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-900/60 dark:text-zinc-300 dark:border-zinc-700";
}

export function TypeBadge({ type, label, size = "md" }: TypeBadgeProps) {
  const renderLabel = label ?? String(type ?? "").replaceAll("_", " ");

  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border font-medium",
        SIZE[size],
        classesForType(type)
      )}
      title={renderLabel}
      aria-label={renderLabel}
    >
      {renderLabel}
    </span>
  );
}
