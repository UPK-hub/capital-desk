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

export function buildCaseAccessWhere(args: {
  tenantId: string;
  role: Role;
  capabilities?: string[];
  userId: string;
  caseId?: string;
}): Prisma.CaseWhereInput {
  const where: Prisma.CaseWhereInput = {
    tenantId: args.tenantId,
    ...(args.caseId ? { id: args.caseId } : {}),
  };
  if (isOwnCasesOnlyBackoffice(args.role, args.capabilities)) {
    return { ...where, ...ownCasesWhere(args.userId) };
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
  if (!group) return ownCasesWhere(args.userId);

  const members = await prisma.user.findMany({
    where: { tenantId: args.tenantId, videoGroup: group },
    select: { id: true },
  });
  const ids = members.map((m) => m.id);
  if (ids.length === 0) return ownCasesWhere(args.userId);
  return { OR: ids.map((id) => ownCasesWhere(id)) };
}
