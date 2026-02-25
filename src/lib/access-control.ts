import { CaseEventType, Prisma, Role } from "@prisma/client";
import { CAPABILITIES } from "@/lib/capabilities";

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

export function buildVideoRequestCaseScope(args: {
  role: Role;
  capabilities?: string[];
  userId: string;
}): Prisma.CaseWhereInput {
  if (isOwnCasesOnlyBackoffice(args.role, args.capabilities)) {
    return ownCasesWhere(args.userId);
  }
  return {};
}
