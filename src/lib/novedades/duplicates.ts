/**
 * Agrupado de novedades que son "el mismo caso reportado varias veces"
 * (mismo bus + misma novedad), sin cambiar el esquema de la base de datos.
 *
 * La pertenencia a un grupo se guarda en eventos del caso (CaseEvent.meta):
 *   meta.duplicateAction = "link" | "unlink"
 *   meta.duplicateGroupId = "<token del grupo>"   (solo en "link")
 *
 * El grupo "actual" de un caso es el del evento de duplicado más reciente.
 * Así el enlace/desenlace es reversible y no requiere migración.
 */

export const DUPLICATE_GROUP_PREFIX = "DUP";

type EventLike = { createdAt?: Date | string | null; meta: unknown };

/** Minúsculas, sin acentos, sin signos, espacios colapsados. */
export function normalizeText(input: string | null | undefined): string {
  return String(input ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Slug estable para usar dentro del id de grupo. */
export function slug(input: string | null | undefined): string {
  return normalizeText(input).replace(/\s+/g, "-").slice(0, 60) || "general";
}

/** Quita el prefijo "Novedad <BUS> - " del título. */
export function stripNovedadTitlePrefix(title: string | null | undefined): string {
  return String(title ?? "").replace(/^novedad\s+[^\-]+-\s*/i, "").trim();
}

/** Lee el último noveltyState (equipo afectado / novedad reportada). */
export function readNoveltyState(events: EventLike[]): any | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const meta = (events[i]?.meta ?? {}) as any;
    const state = meta?.noveltyState;
    if (state && typeof state === "object") return state;
  }
  return null;
}

/**
 * Clave de "mismo caso": equipo afectado + novedad reportada (o título sin
 * prefijo como respaldo). Dos novedades del mismo bus con la misma clave se
 * consideran el mismo caso.
 */
export function issueKeyForCase(input: { title: string; events: EventLike[] }): string {
  const state = readNoveltyState(input.events);
  const equipment = normalizeText(state?.affectedEquipment);
  const reported =
    normalizeText(state?.reportedNovelty) || normalizeText(stripNovedadTitlePrefix(input.title));
  const base = [equipment, reported].filter(Boolean).join(" ").trim();
  return slug(base || normalizeText(input.title));
}

/**
 * Id de grupo determinista para bus + clave de caso (+ creador, opcional).
 * El agrupado automático es POR USUARIO (creador), así que el creador entra en
 * la clave; el enlace manual reusa el id del grupo de la principal.
 */
export function deterministicGroupId(
  busCode: string | null | undefined,
  issueKey: string,
  creatorKey?: string | null
): string {
  const base = `${DUPLICATE_GROUP_PREFIX}-${slug(busCode).toUpperCase()}-${issueKey}`;
  const ck = String(creatorKey ?? "").trim();
  return ck ? `${base}-U${slug(ck)}` : base;
}

/** Id del creador de un caso, leído del evento CREATED (userId/by/actorUserId). */
export function extractCreatorId(events: Array<{ type?: any; meta: unknown }>): string | null {
  for (const ev of events) {
    if (ev.type && ev.type !== "CREATED") continue;
    const meta = (ev.meta ?? {}) as any;
    const id = meta?.userId ?? meta?.by ?? meta?.actorUserId;
    if (id && String(id).trim()) return String(id).trim();
  }
  return null;
}

/** Principal de un grupo = la novedad más antigua (menor createdAt). */
export function principalIdOf<T extends { id: string; createdAt: Date | string }>(
  members: T[]
): string | null {
  if (!members.length) return null;
  const sorted = [...members].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  return sorted[0].id;
}

/**
 * Grupo de duplicados "actual" de un caso, según el evento de duplicado más
 * reciente. Devuelve null si nunca se enlazó o el último evento fue "unlink".
 */
export function resolveDuplicateGroupId(events: EventLike[]): string | null {
  const withTime = events
    .map((e, idx) => ({ e, idx, t: e.createdAt ? new Date(e.createdAt).getTime() : idx }))
    .sort((a, b) => a.t - b.t);
  for (let i = withTime.length - 1; i >= 0; i -= 1) {
    const meta = (withTime[i].e.meta ?? {}) as any;
    const action = meta?.duplicateAction;
    if (action === "link") {
      const gid = meta?.duplicateGroupId ? String(meta.duplicateGroupId) : null;
      if (gid) return gid;
    }
    if (action === "unlink") return null;
  }
  return null;
}

export function isDuplicateGroupId(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(`${DUPLICATE_GROUP_PREFIX}-`);
}
