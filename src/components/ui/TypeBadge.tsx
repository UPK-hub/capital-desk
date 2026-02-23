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
    return "bg-[var(--color-correctivo)] text-[var(--color-correctivo-text)] border-red-200/90";
  }
  if (key === "PREVENTIVO") {
    return "bg-[var(--color-preventivo)] text-[var(--color-preventivo-text)] border-emerald-200/90";
  }
  if (key === "RENOVACION_TECNOLOGICA") {
    return "bg-[var(--color-renovacion)] text-[var(--color-renovacion-text)] border-indigo-200/90";
  }
  if (key === "MEJORA_PRODUCTO") {
    return "bg-[var(--color-renovacion)] text-[var(--color-renovacion-text)] border-indigo-200/90";
  }
  if (key === "NOVEDAD") {
    return "bg-blue-100 text-blue-700 border-blue-200/90";
  }
  if (key === "SOLICITUD_DESCARGA_VIDEO") {
    return "bg-violet-100 text-violet-700 border-violet-200/90";
  }
  return "bg-zinc-100 text-zinc-700 border-zinc-300/90";
}

export function TypeBadge({ type, label, size = "md" }: TypeBadgeProps) {
  const normalized = String(type ?? "").trim().toUpperCase();
  const fallbackLabelMap: Record<string, string> = {
    CORRECTIVO: "Correctivo",
    PREVENTIVO: "Preventivo",
    RENOVACION_TECNOLOGICA: "Renovación tecnológica",
    MEJORA_PRODUCTO: "Renovación tecnológica",
    NOVEDAD: "Novedad",
    SOLICITUD_DESCARGA_VIDEO: "Solicitud video",
  };
  const renderLabel =
    label ??
    fallbackLabelMap[normalized] ??
    String(type ?? "")
      .replaceAll("_", " ")
      .trim();

  return (
    <span
      className={cx(
        "inline-flex items-center rounded-[var(--radius-pill)] border font-medium",
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
