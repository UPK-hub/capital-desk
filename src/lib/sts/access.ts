import { Role } from "@prisma/client";
import { CAPABILITIES, Capability } from "@/lib/capabilities";

export const STS_ROLES = [Role.ADMIN, Role.SUPERVISOR, Role.HELPDESK, Role.AUDITOR];
export const STS_ADMIN_ROLES = [Role.ADMIN, Role.SUPERVISOR];
export const STS_WRITE_ROLES = [Role.ADMIN, Role.SUPERVISOR, Role.HELPDESK];

export function hasRole(role: Role, allowed: Role[]) {
  return allowed.includes(role);
}

export function hasCapability(list: string[] | null | undefined, cap: Capability) {
  return Array.isArray(list) && list.includes(cap);
}

export function canStsRead(role: Role, capabilities: string[] | undefined) {
  return (
    role === Role.ADMIN ||
    hasRole(role, STS_ROLES) ||
    hasCapability(capabilities, CAPABILITIES.STS_READ) ||
    hasCapability(capabilities, CAPABILITIES.STS_WRITE) ||
    hasCapability(capabilities, CAPABILITIES.STS_ADMIN)
  );
}

export function canStsWrite(role: Role, capabilities: string[] | undefined) {
  return (
    role === Role.ADMIN ||
    hasRole(role, STS_WRITE_ROLES) ||
    hasCapability(capabilities, CAPABILITIES.STS_WRITE) ||
    hasCapability(capabilities, CAPABILITIES.STS_ADMIN)
  );
}

export function canStsAdmin(role: Role, capabilities: string[] | undefined) {
  return role === Role.ADMIN || hasCapability(capabilities, CAPABILITIES.STS_ADMIN);
}
