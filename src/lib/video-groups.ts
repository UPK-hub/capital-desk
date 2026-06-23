// Grupos de gestión de videos. Cada grupo ve las solicitudes/gestiones/respuestas
// creadas por cualquier miembro de su mismo grupo (aislado entre grupos).
export const VIDEO_GROUPS = [
  { value: "MANTENIMIENTO", label: "Mantenimiento" },
  { value: "SEGURIDAD_OPERACIONAL", label: "Seguridad operacional" },
  { value: "GENERAL", label: "General" },
] as const;

export type VideoGroupValue = (typeof VIDEO_GROUPS)[number]["value"];

export function videoGroupLabel(value?: string | null): string {
  return VIDEO_GROUPS.find((g) => g.value === value)?.label ?? "—";
}

export function isValidVideoGroup(value: unknown): value is VideoGroupValue {
  return typeof value === "string" && VIDEO_GROUPS.some((g) => g.value === value);
}
