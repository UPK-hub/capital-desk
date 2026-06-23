// Calcula los permisos del usuario para el tablero (servidor).
import { Role } from "@prisma/client";
import { CAPABILITIES } from "@/lib/capabilities";
import { isVideosOnlyBackoffice } from "@/lib/access-control";
import type { AccessFlags } from "@/lib/dashboard/catalog";

export function computeAccessFlags(
  role: Role | undefined,
  caps: string[] | undefined
): AccessFlags {
  const isAdmin = role === Role.ADMIN;
  const videosOnly = role ? isVideosOnlyBackoffice(role, caps) : false;
  const has = (c: string) => !!caps?.includes(c);

  const canBackoffice = isAdmin || (role === Role.BACKOFFICE && !videosOnly);
  const canVideo = isAdmin || role === Role.BACKOFFICE;
  const canTech = isAdmin || role === Role.TECHNICIAN;
  const canPlanner = isAdmin || (role === Role.BACKOFFICE && has("PLANNER"));
  const canSts =
    isAdmin ||
    (role === Role.BACKOFFICE &&
      (has("STS_READ") || has("STS_WRITE") || has("STS_ADMIN")));
  const canTm = isAdmin || (role === Role.BACKOFFICE && has(CAPABILITIES.TM_READ));

  return { isAdmin, canBackoffice, canVideo, canSts, canTm, canTech, canPlanner };
}
