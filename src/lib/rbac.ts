import { Role } from "@prisma/client";

export function hasAnyRole(userRole: Role, allowed: Role[]) {
  return allowed.includes(userRole);
}

export const RBAC = {
  backofficeRoutes: [Role.ADMIN, Role.BACKOFFICE],
  techRoutes: [Role.ADMIN, Role.TECHNICIAN],
  busesRoutes: [Role.ADMIN, Role.BACKOFFICE, Role.TECHNICIAN] // ajustable
};
