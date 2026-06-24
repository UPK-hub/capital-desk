import { CaseEventType, Prisma, Role } from "@prisma/client";
import { CAPABILITIES } from "@/lib/capabilities";
import { prisma } from "@/lib/prisma";

type MaybeCaps = string[] | undefined;

export function hasCapability(capabilities: MaybeCaps, capability: string) {
  return Array.isArray(capabilities) && capabilities.includes(capability);
}

export function isBackofficeRestricted(role: Role, capabilities: MaybeCaps) {
  return role === Role.BACKOFFICE && hasCapability(capabilities, CAPABILITIES.BACKOFFICE_RESTRICTED);
}

export function isVideosOnlyBackoffice(role: Role, capabilities: MaybeCaps) {
  return role === Role.BACKOFFICE && hasCapability(capabilities, CAPABILITIES.VIDEOS_ONLY);
}

export function isOwnCasesOnlyBackoffice(role: Role, capabilities: MaybeCaps) {
  return role === Role.BACKOFFICE && hasCapability(capabilities, CAPABILITIES.OWN_CASES_ONLY);
}

export function ownCasesWhere(userId: string): Prisma.CaseWhereInput {
  return {
    events: {
      some: {
        type: CaseEventType.CREATED,
        meta: { path: ["userId"], equals: userId },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Equipos: un "admin de equipo" (Team.adminUserIds) puede ver el contenido de
// los usuarios de su equipo (miembros = usuarios cuyo dominio de correo está en
// Team.domains), según los flags del equipo. Es una EXPANSIÓN: solo agrega
// visibilidad a quien hoy está restringido; nunca quita acceso a nadie.
// ---------------------------------------------------------------------------

export type TeamAdminScope = {
  caseMemberIds: string[];
  videoMemberIds: string[];
  workOrderMemberIds: string[];
  manageMemberIds: string[];
  viewTelemetry: boolean;
};

function domainOfEmail(email: string) {
  return String(email ?? "").split("@")[1]?.toLowerCase() ?? "";
}

/**
 * Devuelve, para un usuario que administra uno o más equipos, los IDs de los
 * miembros de su(s) equipo(s) cuyo contenido puede ver, separados por permiso.
 * Devuelve null si el usuario no es admin de ningún equipo (o si la tabla Team
 * aún no existe — degrada con gracia para no romper antes de migrar).
 */
export async function getTeamAdminScope(args: {
  tenantId: string;
  userId: string;
}): Promise<TeamAdminScope | null> {
  const db = prisma as any;
  let teams: any[];
  try {
    teams = await db.team.findMany({
      where: { tenantId: args.tenantId, adminUserIds: { has: args.userId } },
    });
  } catch {
    // La tabla Team todavía no existe (deploy previo a la migración): sin scope.
    return null;
  }
  if (!teams || teams.length === 0) return null;

  const users = await prisma.user.findMany({
    where: { tenantId: args.tenantId },
    select: { id: true, email: true },
  });

  const caseSet = new Set<string>();
  const videoSet = new Set<string>();
  const woSet = new Set<string>();
  const manageSet = new Set<string>();
  let viewTelemetry = false;

  for (const t of teams) {
    const domains: string[] = Array.isArray(t.domains) ? t.domains : [];
    if (domains.length === 0) continue;
    const memberIds = users.filter((u) => domains.includes(domainOfEmail(u.email))).map((u) => u.id);
    if (t.viewCases) memberIds.forEach((id) => caseSet.add(id));
    if (t.viewVideoRequests) memberIds.forEach((id) => videoSet.add(id));
    if (t.viewWorkOrders) memberIds.forEach((id) => woSet.add(id));
    if (t.manageUsers) memberIds.forEach((id) => manageSet.add(id));
    if (t.viewTelemetry) viewTelemetry = true;
  }

  return {
    caseMemberIds: [...caseSet],
    videoMemberIds: [...videoSet],
    workOrderMemberIds: [...woSet],
    manageMemberIds: [...manageSet],
    viewTelemetry,
  };
}

/** Casos creados por, o asignados a, cualquiera de los miembros indicados. */
export function casesOfMembersWhere(memberIds: string[]): Prisma.CaseWhereInput {
  if (!memberIds.length) return { id: "__none__" };
  return {
    OR: [...memberIds.map((id) => ownCasesWhere(id)), { assignedToId: { in: memberIds } }],
  };
}

/**
 * Where de casos para un usuario restringido (OWN_CASES_ONLY): sus propios
 * casos, MÁS los de su equipo si es admin de equipo con permiso de ver casos.
 * Pensado para reemplazar `ownCasesWhere(userId)` en las vistas restringidas.
 */
export async function restrictedCasesWhere(args: {
  tenantId: string;
  userId: string;
}): Promise<Prisma.CaseWhereInput> {
  const own = ownCasesWhere(args.userId);
  const scope = await getTeamAdminScope(args);
  if (scope && scope.caseMemberIds.length > 0) {
    return { OR: [own, casesOfMembersWhere(scope.caseMemberIds)] };
  }
  return own;
}

export async function buildCaseAccessWhere(args: {
  tenantId: string;
  role: Role;
  capabilities?: string[];
  userId: string;
  caseId?: string;
}): Promise<Prisma.CaseWhereInput> {
  const where: Prisma.CaseWhereInput = {
    tenantId: args.tenantId,
    ...(args.caseId ? { id: args.caseId } : {}),
  };
  if (isOwnCasesOnlyBackoffice(args.role, args.capabilities)) {
    const scoped = await restrictedCasesWhere({ tenantId: args.tenantId, userId: args.userId });
    return { ...where, ...scoped };
  }
  return where;
}

export async function buildVideoRequestCaseScope(args: {
  tenantId: string;
  role: Role;
  capabilities?: string[];
  userId: string;
}): Promise<Prisma.CaseWhereInput> {
  const restricted =
    isOwnCasesOnlyBackoffice(args.role, args.capabilities) ||
    isVideosOnlyBackoffice(args.role, args.capabilities);

  // Visibilidad de equipo (admin de equipo con permiso de ver solicitudes de video).
  const scope = await getTeamAdminScope({ tenantId: args.tenantId, userId: args.userId });
  const teamWhere =
    scope && scope.videoMemberIds.length > 0 ? casesOfMembersWhere(scope.videoMemberIds) : null;

  // Roles sin restricción (administrador, etc.) ven todas las solicitudes.
  if (!restricted) return {};

  // Con grupo asignado: ve las solicitudes creadas por cualquier miembro de su
  // mismo grupo (compartido dentro del grupo, aislado entre grupos distintos).
  // Sin grupo: ve únicamente las que él mismo creó.
  const me = await prisma.user.findUnique({
    where: { id: args.userId },
    select: { videoGroup: true },
  });
  const group = me?.videoGroup ?? null;

  let baseScope: Prisma.CaseWhereInput;
  if (!group) {
    baseScope = ownCasesWhere(args.userId);
  } else {
    const members = await prisma.user.findMany({
      where: { tenantId: args.tenantId, videoGroup: group },
      select: { id: true },
    });
    const ids = members.map((m) => m.id);
    baseScope = ids.length === 0 ? ownCasesWhere(args.userId) : { OR: ids.map((id) => ownCasesWhere(id)) };
  }

  // Si además es admin de equipo, sumamos la visibilidad de equipo.
  if (teamWhere) return { OR: [baseScope, teamWhere] };
  return baseScope;
}
