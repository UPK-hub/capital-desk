import { Role } from "@prisma/client";
import { CAPABILITIES, Capability } from "@/lib/capabilities";

export function hasRole(role: Role, allowed: Role[]) {
  return allowed.includes(role);
}

export function hasCapability(list: string[] | null | undefined, cap: Capability) {
  return Array.isArray(list) && list.includes(cap);
}

function isBackoffice(role: Role) {
  return role === Role.ADMIN || role === Role.BACKOFFICE;
}

export function canStsRead(role: Role, capabilities: string[] | undefined) {
  if (role === Role.ADMIN) return true;
  if (!isBackoffice(role)) return false;
  return (
    hasCapability(capabilities, CAPABILITIES.STS_READ) ||
    hasCapability(capabilities, CAPABILITIES.STS_WRITE) ||
    hasCapability(capabilities, CAPABILITIES.STS_ADMIN)
  );
}

export function canStsWrite(role: Role, capabilities: string[] | undefined) {
  if (role === Role.ADMIN) return true;
  if (!isBackoffice(role)) return false;
  return (
    hasCapability(capabilities, CAPABILITIES.STS_WRITE) ||
    hasCapability(capabilities, CAPABILITIES.STS_ADMIN)
  );
}

export function canStsAdmin(role: Role, capabilities: string[] | undefined) {
  if (role === Role.ADMIN) return true;
  if (!isBackoffice(role)) return false;
  return hasCapability(capabilities, CAPABILITIES.STS_ADMIN);
}
