// ============================================================================
// Catálogo de métricas y tipos del tablero de inicio personalizable.
// IMPORTANTE: este archivo NO importa prisma ni nada de servidor.
// Lo usan tanto el cliente (UI) como el servidor (resolución de datos).
// ============================================================================

export type Viz = "number" | "area" | "line" | "bar" | "pie" | "list";

export type MetricKind = "scalar" | "series" | "breakdown" | "list";

/** Permisos del usuario para decidir qué métricas puede ver/agregar. */
export type AccessFlags = {
  isAdmin: boolean;
  canBackoffice: boolean;
  canVideo: boolean;
  canSts: boolean;
  canTm: boolean;
  canTech: boolean;
  canPlanner: boolean;
};

export type MetricDef = {
  key: string;
  label: string;
  group: string; // "Casos" | "Videos" | "OTs" | "STS" | "Telemetría" | "General"
  kind: MetricKind;
  defaultViz: Viz;
  allowedViz: Viz[];
  /** Si usa el rango de fechas global del tablero. */
  supportsRange: boolean;
  /** Color principal para KPIs / series. */
  accent: string;
  /** Texto de ayuda corto. */
  hint?: string;
  can: (f: AccessFlags) => boolean;
};

// ----------------------------------------------------------------------------
// Etiquetas y colores de estados (en español) — usados por el servidor.
// ----------------------------------------------------------------------------

export const CASE_STATUS_LABEL: Record<string, string> = {
  NUEVO: "Nuevo",
  OT_ASIGNADA: "OT asignada",
  EN_EJECUCION: "En ejecución",
  RESUELTO: "Resuelto",
  CERRADO: "Cerrado",
};
export const CASE_STATUS_COLOR: Record<string, string> = {
  NUEVO: "#2563eb",
  OT_ASIGNADA: "#06b6d4",
  EN_EJECUCION: "#f59e0b",
  RESUELTO: "#16a34a",
  CERRADO: "#64748b",
};

export const WO_STATUS_LABEL: Record<string, string> = {
  CREADA: "Creada",
  ASIGNADA: "Asignada",
  EN_CAMPO: "En campo",
  EN_VALIDACION: "En validación",
  FINALIZADA: "Finalizada",
};
export const WO_STATUS_COLOR: Record<string, string> = {
  CREADA: "#2563eb",
  ASIGNADA: "#06b6d4",
  EN_CAMPO: "#f59e0b",
  EN_VALIDACION: "#8b5cf6",
  FINALIZADA: "#16a34a",
};

export const VIDEO_STATUS_LABEL: Record<string, string> = {
  EN_ESPERA: "En espera",
  EN_CURSO: "En curso",
  COMPLETADO: "Completado",
};
export const VIDEO_STATUS_COLOR: Record<string, string> = {
  EN_ESPERA: "#f59e0b",
  EN_CURSO: "#2563eb",
  COMPLETADO: "#16a34a",
};

export const STS_SEVERITY_LABEL: Record<string, string> = {
  EMERGENCY: "Emergencia",
  HIGH: "Alta",
  MEDIUM: "Media",
  LOW: "Baja",
};
export const STS_SEVERITY_COLOR: Record<string, string> = {
  EMERGENCY: "#dc2626",
  HIGH: "#f97316",
  MEDIUM: "#f59e0b",
  LOW: "#16a34a",
};

export const PALETTE = [
  "#2563eb",
  "#7c3aed",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#16a34a",
  "#64748b",
  "#db2777",
];

// ----------------------------------------------------------------------------
// Definición de métricas disponibles.
// ----------------------------------------------------------------------------

export const METRICS: MetricDef[] = [
  // ---- KPIs (números) ----
  {
    key: "casos_abiertos",
    label: "Casos abiertos",
    group: "Casos",
    kind: "scalar",
    defaultViz: "number",
    allowedViz: ["number"],
    supportsRange: false,
    accent: "#ef4444",
    hint: "Casos en estado Nuevo, OT asignada o En ejecución.",
    can: (f) => f.canBackoffice,
  },
  {
    key: "videos_pendientes",
    label: "Videos pendientes",
    group: "Videos",
    kind: "scalar",
    defaultViz: "number",
    allowedViz: ["number"],
    supportsRange: false,
    accent: "#7c3aed",
    hint: "Solicitudes de video en espera o en curso.",
    can: (f) => f.canVideo,
  },
  {
    key: "ots_activas",
    label: "OTs activas",
    group: "OTs",
    kind: "scalar",
    defaultViz: "number",
    allowedViz: ["number"],
    supportsRange: false,
    accent: "#6366f1",
    hint: "Órdenes de trabajo no finalizadas.",
    can: (f) => f.canTech || f.isAdmin,
  },
  {
    key: "sts_abiertos",
    label: "Tickets STS abiertos",
    group: "STS",
    kind: "scalar",
    defaultViz: "number",
    allowedViz: ["number"],
    supportsRange: false,
    accent: "#f59e0b",
    hint: "Tickets STS abiertos o en progreso.",
    can: (f) => f.canSts,
  },
  {
    key: "tecnicos_activos",
    label: "Técnicos activos",
    group: "General",
    kind: "scalar",
    defaultViz: "number",
    allowedViz: ["number"],
    supportsRange: false,
    accent: "#06b6d4",
    hint: "Técnicos activos del tenant.",
    can: (f) => f.canPlanner || f.isAdmin,
  },

  // ---- Series por día ----
  {
    key: "casos_creados_series",
    label: "Casos creados por día",
    group: "Casos",
    kind: "series",
    defaultViz: "area",
    allowedViz: ["area", "line", "bar"],
    supportsRange: true,
    accent: "#2563eb",
    can: (f) => f.canBackoffice,
  },
  {
    key: "casos_actividad_series",
    label: "Actividad de casos",
    group: "Casos",
    kind: "series",
    defaultViz: "area",
    allowedViz: ["area", "line"],
    supportsRange: true,
    accent: "#2563eb",
    hint: "Casos creados vs. resueltos por día.",
    can: (f) => f.canBackoffice,
  },
  {
    key: "videos_creados_series",
    label: "Videos solicitados por día",
    group: "Videos",
    kind: "series",
    defaultViz: "area",
    allowedViz: ["area", "line", "bar"],
    supportsRange: true,
    accent: "#7c3aed",
    can: (f) => f.canVideo,
  },
  {
    key: "ots_creadas_series",
    label: "OTs creadas por día",
    group: "OTs",
    kind: "series",
    defaultViz: "area",
    allowedViz: ["area", "line", "bar"],
    supportsRange: true,
    accent: "#6366f1",
    can: (f) => f.canTech || f.isAdmin,
  },
  {
    key: "sts_abiertos_series",
    label: "Tickets STS por día",
    group: "STS",
    kind: "series",
    defaultViz: "area",
    allowedViz: ["area", "line", "bar"],
    supportsRange: true,
    accent: "#f59e0b",
    can: (f) => f.canSts,
  },
  {
    key: "telemetria_tramas_series",
    label: "Tramas por día (telemetría)",
    group: "Telemetría",
    kind: "series",
    defaultViz: "area",
    allowedViz: ["area", "line", "bar"],
    supportsRange: true,
    accent: "#0ea5e9",
    can: (f) => f.isAdmin,
  },

  // ---- Distribuciones (torta / barras) ----
  {
    key: "casos_por_estado",
    label: "Casos por estado",
    group: "Casos",
    kind: "breakdown",
    defaultViz: "pie",
    allowedViz: ["pie", "bar"],
    supportsRange: false,
    accent: "#2563eb",
    can: (f) => f.canBackoffice,
  },
  {
    key: "videos_por_estado",
    label: "Videos por estado",
    group: "Videos",
    kind: "breakdown",
    defaultViz: "pie",
    allowedViz: ["pie", "bar"],
    supportsRange: false,
    accent: "#7c3aed",
    can: (f) => f.canVideo,
  },
  {
    key: "ots_por_estado",
    label: "OTs por estado",
    group: "OTs",
    kind: "breakdown",
    defaultViz: "pie",
    allowedViz: ["pie", "bar"],
    supportsRange: false,
    accent: "#6366f1",
    can: (f) => f.canTech || f.isAdmin,
  },
  {
    key: "sts_por_severidad",
    label: "STS por severidad",
    group: "STS",
    kind: "breakdown",
    defaultViz: "pie",
    allowedViz: ["pie", "bar"],
    supportsRange: false,
    accent: "#f59e0b",
    can: (f) => f.canSts,
  },

  // ---- Listas ----
  {
    key: "mis_pendientes",
    label: "Pendientes asignados a ti",
    group: "General",
    kind: "list",
    defaultViz: "list",
    allowedViz: ["list"],
    supportsRange: false,
    accent: "#2563eb",
    hint: "OTs, videos y tickets STS abiertos asignados a ti.",
    can: () => true,
  },
];

export function getMetric(key: string): MetricDef | undefined {
  return METRICS.find((m) => m.key === key);
}

/** Métricas que el usuario puede ver/agregar según sus permisos. */
export function metricsFor(f: AccessFlags): MetricDef[] {
  return METRICS.filter((m) => m.can(f));
}

// ----------------------------------------------------------------------------
// Estructura persistida del tablero.
// ----------------------------------------------------------------------------

export type WidgetConfig = {
  i: string; // id único del widget
  metric: string; // key de MetricDef
  viz: Viz;
  title: string;
};

export type GridItem = {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
};

export type DashboardFilters = {
  rangeDays: number; // 7 | 14 | 30 | 90
};

export type DashboardData = {
  version: number;
  widgets: WidgetConfig[];
  layout: GridItem[];
  filters: DashboardFilters;
};

export const RANGE_OPTIONS = [
  { value: 7, label: "Últimos 7 días" },
  { value: 14, label: "Últimos 14 días" },
  { value: 30, label: "Últimos 30 días" },
  { value: 90, label: "Últimos 90 días" },
];

export const GRID_COLS = 12;

/** Tablero por defecto, adaptado a los permisos del usuario. */
export function defaultDashboard(f: AccessFlags): DashboardData {
  const widgets: WidgetConfig[] = [];
  const layout: GridItem[] = [];
  let uid = 0;
  const nid = () => `w${++uid}`;

  const push = (metricKey: string, viz: Viz, item: Omit<GridItem, "i">) => {
    const m = getMetric(metricKey);
    if (!m || !m.can(f)) return false;
    const i = nid();
    widgets.push({ i, metric: m.key, viz, title: m.label });
    layout.push({ i, ...item });
    return true;
  };

  // 1) KPIs (fila superior, 4 por fila)
  const kpiKeys = [
    "casos_abiertos",
    "videos_pendientes",
    "ots_activas",
    "sts_abiertos",
  ];
  let x = 0;
  let y = 0;
  for (const key of kpiKeys) {
    const m = getMetric(key);
    if (!m || !m.can(f)) continue;
    push(key, "number", { x, y, w: 3, h: 3, minW: 2, minH: 3 });
    x += 3;
    if (x >= GRID_COLS) {
      x = 0;
      y += 3;
    }
  }
  if (x !== 0) {
    x = 0;
    y += 3;
  }

  // 2) Serie principal + distribución lateral
  const mainSeries = f.canBackoffice
    ? "casos_actividad_series"
    : f.canVideo
    ? "videos_creados_series"
    : f.canTech || f.isAdmin
    ? "ots_creadas_series"
    : f.canSts
    ? "sts_abiertos_series"
    : null;

  const sideBreak = f.canSts
    ? "sts_por_severidad"
    : f.canBackoffice
    ? "casos_por_estado"
    : f.canVideo
    ? "videos_por_estado"
    : f.canTech || f.isAdmin
    ? "ots_por_estado"
    : null;

  const hasMain = !!mainSeries;
  const hasSide = !!sideBreak;
  if (mainSeries) {
    const m = getMetric(mainSeries)!;
    push(mainSeries, m.defaultViz, {
      x: 0,
      y,
      w: hasSide ? 8 : 12,
      h: 9,
      minW: 4,
      minH: 6,
    });
  }
  if (sideBreak) {
    const m = getMetric(sideBreak)!;
    push(sideBreak, m.defaultViz, {
      x: hasMain ? 8 : 0,
      y,
      w: hasMain ? 4 : 6,
      h: 9,
      minW: 3,
      minH: 6,
    });
  }
  if (hasMain || hasSide) y += 9;

  // 3) Pendientes (lista a todo el ancho)
  push("mis_pendientes", "list", { x: 0, y, w: 12, h: 8, minW: 4, minH: 5 });

  return { version: 3, widgets, layout, filters: { rangeDays: 14 } };
}
