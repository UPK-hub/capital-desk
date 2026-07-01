// Plantilla del CHECKLIST DE MANTENIMIENTO PREVENTIVO (Capital Bus).
//
// Reemplaza la herramienta HTML suelta: define las secciones e ítems que se
// llenan dentro del panel "Gestionar caso". La MISMA plantilla la usan la UI
// (GestionCasoCard) y el generador del certificado PDF, para que siempre estén
// alineados.
//
// Nota para Valeria: si quieres cambiar/agregar/quitar ítems o secciones, este
// es el ÚNICO archivo que hay que tocar. Todo lo demás se adapta solo.

export type ChecklistItemType = "check" | "text" | "voltage" | "photo";

export type ChecklistItemDef = {
  id: string;
  label: string;
  // 'check' = OK/Hallazgo/N-A · 'text' = texto/número · 'voltage' = valor V + foto
  // 'photo' = solo captura/evidencia con nombre (subir imagen o archivo).
  type: ChecklistItemType;
  // Para 'text': placeholder de ayuda. Para 'voltage': unidad (por defecto "V").
  hint?: string;
};

export type ChecklistSectionDef = {
  id: string;
  title: string;
  items: ChecklistItemDef[];
};

// Estado de un ítem tipo 'check'.
export type CheckState = "ok" | "hallazgo" | "na";

// Severidad de un hallazgo de cierre.
export type Severity = "C" | "M" | "L";

export const SEVERITY_LABEL: Record<Severity, string> = {
  C: "Crítico",
  M: "Moderado",
  L: "Leve",
};

export const CHECK_STATE_LABEL: Record<CheckState, string> = {
  ok: "OK",
  hallazgo: "Hallazgo",
  na: "N/A",
};

// ---------------------------------------------------------------------------
// SECCIONES DEL PREVENTIVO
// ---------------------------------------------------------------------------
export const PREVENTIVE_CHECKLIST: ChecklistSectionDef[] = [
  {
    id: "identificacion",
    title: "Identificación",
    items: [
      { id: "otCapital", label: "OT de Capital", type: "text", hint: "N.º de OT" },
      { id: "diasGrabacion", label: "Días de grabación", type: "text", hint: "N.º de días" },
      { id: "kilometraje", label: "Kilometraje", type: "text", hint: "km" },
      { id: "horaInicio", label: "Hora de inicio", type: "text", hint: "hh:mm" },
      { id: "horaFin", label: "Hora de finalización", type: "text", hint: "hh:mm" },
    ],
  },
  {
    id: "limpieza",
    title: "Limpieza",
    items: [
      { id: "nvr", label: "Limpieza de NVR / DVR", type: "check" },
      { id: "camaras", label: "Limpieza de cámaras", type: "check" },
      { id: "gabinete", label: "Limpieza de gabinete / rack", type: "check" },
      { id: "cableado", label: "Organización y ajuste de cableado", type: "check" },
    ],
  },
  {
    id: "electrico",
    title: "Eléctrico — Voltajes",
    items: [
      { id: "bateria", label: "Baterías", type: "voltage" },
      { id: "nvr", label: "Voltaje NVR", type: "voltage" },
      { id: "controlador", label: "Voltaje controlador", type: "voltage" },
      { id: "switch", label: "Voltaje switch", type: "voltage" },
    ],
  },
  {
    id: "funcionalidad",
    title: "Funcionalidad",
    items: [
      { id: "grabacion", label: "Grabación en todas las cámaras", type: "check" },
      { id: "envivo", label: "Visualización en vivo", type: "check" },
      { id: "fechahora", label: "Fecha / hora del video correcta", type: "check" },
      { id: "audio", label: "Audio (si aplica)", type: "check" },
      { id: "reproduccion", label: "Reproducción de grabaciones", type: "check" },
      { id: "disco", label: "Estado / espacio del disco", type: "check" },
    ],
  },
  {
    id: "centroGestion",
    title: "Centro de gestión",
    items: [
      { id: "reporte", label: "Reporta al centro de gestión (en línea)", type: "check" },
      { id: "videoRemoto", label: "Transmisión de video remoto", type: "check" },
      { id: "gps", label: "GPS / posición reportando", type: "check" },
    ],
  },
  {
    id: "botonPanico",
    title: "Botón de pánico",
    items: [
      { id: "prueba", label: "Prueba del botón de pánico", type: "check" },
      { id: "senal", label: "Señal recibida en central", type: "check" },
      { id: "indicador", label: "Indicador / sirena", type: "check" },
    ],
  },
  {
    id: "tramas",
    title: "P20 / P60",
    items: [
      { id: "p20", label: "Envío de trama P20", type: "check" },
      { id: "p60", label: "Envío de trama P60", type: "check" },
      { id: "datos", label: "Datos correctos (odómetro, ubicación)", type: "check" },
    ],
  },
  {
    id: "capturas",
    title: "Capturas / evidencias",
    items: [
      { id: "inicio", label: "Inicio", type: "photo" },
      { id: "fin", label: "Fin", type: "photo" },
      { id: "habitaculo", label: "Habitáculo", type: "photo" },
      { id: "tapa", label: "Tapa", type: "photo" },
      { id: "baterias", label: "Baterías", type: "photo" },
      { id: "discos", label: "Discos", type: "photo" },
      { id: "periodoGrabacion", label: "Período de grabación", type: "photo" },
      { id: "vmsInicial", label: "VMS inicial", type: "photo" },
      { id: "vmsFinal", label: "VMS final", type: "photo" },
      { id: "config", label: "Configuración", type: "photo" },
      { id: "batch", label: "Batch", type: "photo" },
      { id: "wifi", label: "WiFi", type: "photo" },
      { id: "lte", label: "LTE", type: "photo" },
      { id: "ping", label: "Ping", type: "photo" },
      { id: "tlm", label: "Telemetría (TLM)", type: "photo" },
      { id: "panicoVideo", label: "Validación de creación de video de botón de pánico", type: "photo" },
    ],
  },
];

// ---------------------------------------------------------------------------
// FORMA DE LOS DATOS GUARDADOS (CasePreventiveChecklist.data)
// ---------------------------------------------------------------------------
export type ChecklistPhoto = {
  filePath: string;
  fileName: string;
  mimeType: string;
  size: number;
};

export type ChecklistItemValue = {
  // check
  estado?: CheckState;
  nota?: string;
  // text / voltage
  value?: string;
  // voltage / cualquier ítem con foto (photo = primera, por compatibilidad)
  photo?: ChecklistPhoto | null;
  // capturas: permite varias fotos por evidencia
  photos?: ChecklistPhoto[];
};

// Tipo de novedad con que queda el equipo del bus.
export type TipoNovedad = "sin_transmision" | "falla_imagen" | "afectado";

export const TIPO_NOVEDAD_LABEL: Record<TipoNovedad, string> = {
  sin_transmision: "Sin transmisión",
  falla_imagen: "Falla en imagen",
  afectado: "Afectado",
};

// Severidad sugerida según el tipo de novedad.
export const TIPO_NOVEDAD_SEVERITY: Record<TipoNovedad, Severity> = {
  sin_transmision: "C",
  falla_imagen: "M",
  afectado: "L",
};

export type ChecklistFinding = {
  severity: Severity;
  equipoId?: string | null;
  equipo?: string;
  tipoNovedad?: TipoNovedad | null;
  cambioEquipo?: boolean;
  descripcion: string;
};

export type ChecklistData = {
  version: 1;
  // items[sectionId][itemId] = valor
  items: Record<string, Record<string, ChecklistItemValue>>;
  cierre: {
    hallazgos: ChecklistFinding[];
    requiereCorrectivo: boolean;
    recomendaciones: string;
    // Resumen breve para la OT del cliente (Capital). Antes "observaciones".
    notasOT: string;
  };
};

// Construye una estructura vacía coherente con la plantilla.
export function emptyChecklistData(): ChecklistData {
  const items: ChecklistData["items"] = {};
  for (const section of PREVENTIVE_CHECKLIST) {
    items[section.id] = {};
    for (const it of section.items) {
      items[section.id][it.id] = it.type === "check" ? { estado: undefined } : it.type === "photo" ? {} : { value: "" };
    }
  }
  return {
    version: 1,
    items,
    cierre: { hallazgos: [], requiereCorrectivo: false, recomendaciones: "", notasOT: "" },
  };
}

// Rellena/normaliza un data parcial contra la plantilla actual (para borradores
// guardados con una versión anterior de la plantilla).
export function normalizeChecklistData(raw: any): ChecklistData {
  const base = emptyChecklistData();
  if (!raw || typeof raw !== "object") return base;
  const items = raw.items && typeof raw.items === "object" ? raw.items : {};
  for (const section of PREVENTIVE_CHECKLIST) {
    const src = items[section.id] ?? {};
    for (const it of section.items) {
      const v = src[it.id];
      if (v && typeof v === "object") base.items[section.id][it.id] = { ...base.items[section.id][it.id], ...v };
    }
  }
  const cierre = raw.cierre && typeof raw.cierre === "object" ? raw.cierre : {};
  base.cierre.hallazgos = Array.isArray(cierre.hallazgos)
    ? cierre.hallazgos
        .filter((h: any) => h && (h.severity === "C" || h.severity === "M" || h.severity === "L"))
        .map((h: any) => ({
          severity: h.severity as Severity,
          equipoId: h.equipoId ?? null,
          equipo: String(h.equipo ?? ""),
          tipoNovedad: (["sin_transmision", "falla_imagen", "afectado"].includes(h.tipoNovedad) ? h.tipoNovedad : null) as any,
          cambioEquipo: Boolean(h.cambioEquipo),
          descripcion: String(h.descripcion ?? ""),
        }))
    : [];
  base.cierre.requiereCorrectivo = Boolean(cierre.requiereCorrectivo);
  base.cierre.recomendaciones = String(cierre.recomendaciones ?? "");
  base.cierre.notasOT = String(cierre.notasOT ?? cierre.observaciones ?? "");
  return base;
}

export type ChecklistSummary = {
  C: number;
  M: number;
  L: number;
  hallazgos: number; // novedades de cierre por severidad (C+M+L)
  hallazgosTotal: number; // TODOS los hallazgos = novedades + ítems check marcados Hallazgo
  okCount: number; // ítems check en OK
  hallazgoCount: number; // ítems check marcados Hallazgo
  naCount: number; // ítems check marcados N/A (NO cuenta en el total)
  pendientes: number; // ítems check sin marcar (aplicables) = applicable - OK - Hallazgo
  checkTotal: number; // total de ítems check (OK + Hallazgo + N/A + sin marcar)
  applicable: number; // ítems que aplican = checkTotal - N/A (base del "X/Y")
  conNovedad: boolean;
};

// Resumen: estado de los ítems de tipo check (OK/Hallazgo/N-A, que suman al
// total) + hallazgos de cierre por severidad.
export function summarizeChecklist(data: ChecklistData): ChecklistSummary {
  let okCount = 0, hallazgoCount = 0, naCount = 0, checkTotal = 0;
  for (const section of PREVENTIVE_CHECKLIST) {
    for (const it of section.items) {
      if (it.type !== "check") continue;
      checkTotal++;
      const estado = data.items[section.id]?.[it.id]?.estado;
      if (estado === "ok") okCount++;
      else if (estado === "hallazgo") hallazgoCount++;
      else if (estado === "na") naCount++;
    }
  }
  const C = data.cierre.hallazgos.filter((h) => h.severity === "C").length;
  const M = data.cierre.hallazgos.filter((h) => h.severity === "M").length;
  const L = data.cierre.hallazgos.filter((h) => h.severity === "L").length;
  const hallazgos = C + M + L;
  const hallazgosTotal = hallazgos + hallazgoCount;
  const applicable = checkTotal - naCount;
  const pendientes = applicable - okCount - hallazgoCount;
  return { C, M, L, hallazgos, hallazgosTotal, okCount, hallazgoCount, naCount, pendientes, checkTotal, applicable, conNovedad: hallazgosTotal > 0 };
}

// Ítems del checklist (tipo check) marcados como "Hallazgo", con su nota.
export type CheckHallazgo = { seccion: string; label: string; nota: string };
export function collectCheckHallazgos(data: ChecklistData): CheckHallazgo[] {
  const out: CheckHallazgo[] = [];
  for (const section of PREVENTIVE_CHECKLIST) {
    for (const it of section.items) {
      if (it.type !== "check") continue;
      const v = data.items[section.id]?.[it.id];
      if (v?.estado === "hallazgo") out.push({ seccion: section.title, label: it.label, nota: String(v.nota ?? "").trim() });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// TEXTO AUTOMÁTICO (recomendaciones y notas para la OT), armado a partir de los
// hallazgos y el resumen. El usuario puede editarlo después.
// ---------------------------------------------------------------------------
export function autoNotasOT(data: ChecklistData, busCode?: string | null): string {
  const dias = String(data.items.identificacion?.diasGrabacion?.value ?? "").trim();
  const parts: string[] = [`Se realizó mantenimiento preventivo${busCode ? ` al bus ${busCode}` : ""}.`];
  const nov = data.cierre.hallazgos.map(
    (h) => `${h.equipo || "equipo"}: ${h.tipoNovedad ? TIPO_NOVEDAD_LABEL[h.tipoNovedad] : "novedad"}${h.cambioEquipo ? " (cambio de equipo)" : ""}`
  );
  const chk = collectCheckHallazgos(data).map((h) => `${h.label}${h.nota ? ` (${h.nota})` : ""}`);
  const all = [...nov, ...chk];
  parts.push(all.length ? `Novedades: ${all.join("; ")}.` : "Sin novedades; equipo operativo y reportando al centro de gestión.");
  if (dias) parts.push(`Días de grabación: ${dias}.`);
  return parts.join(" ");
}

export function autoRecomendaciones(data: ChecklistData): string {
  const hz = data.cierre.hallazgos;
  const checkHz = collectCheckHallazgos(data);
  if (!hz.length && !checkHz.length) return "Sin acciones adicionales. Continuar con el plan de mantenimiento preventivo.";
  const recs: string[] = [];
  for (const h of hz) {
    const eq = h.equipo || "el equipo";
    if (h.tipoNovedad === "sin_transmision") recs.push(`Revisar conectividad y transmisión de ${eq}.`);
    else if (h.tipoNovedad === "falla_imagen") recs.push(`Revisar y ajustar ${eq} por falla en imagen.`);
    else if (h.tipoNovedad === "afectado") recs.push(`Dar seguimiento a ${eq} (afectado).`);
    else recs.push(`Revisar ${eq}.`);
    if (h.cambioEquipo) recs.push(`Verificar el funcionamiento de ${eq} tras el cambio de equipo.`);
  }
  for (const h of checkHz) recs.push(`Atender: ${h.label}${h.nota ? ` (${h.nota})` : ""}.`);
  return [...new Set(recs)].join(" ");
}
