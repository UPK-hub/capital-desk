import { Role } from "@prisma/client";
import { CAPABILITIES } from "@/lib/capabilities";

// Grupos de gestión de videos (dinámicos, en BD: modelo VideoGroup). Cada grupo
// ve las solicitudes/gestiones/respuestas creadas por cualquier miembro de su
// mismo grupo (aislado entre grupos). En User.videoGroup se guarda el NOMBRE del
// grupo.
export const DEFAULT_VIDEO_GROUPS = ["Mantenimiento", "Seguridad operacional", "General"];

// ¿Puede gestionar (crear/editar/eliminar) grupos de video y asignar usuarios?
// El administrador general siempre puede; también quien tenga el permiso
// específico VIDEO_GROUPS_ADMIN sin ser administrador de todo.
export function canManageVideoGroups(role: Role, capabilities?: string[] | null): boolean {
  if (role === Role.ADMIN) return true;
  return Array.isArray(capabilities) && capabilities.includes(CAPABILITIES.VIDEO_GROUPS_ADMIN);
}
