import { Role } from "@prisma/client";
import { CAPABILITIES } from "@/lib/capabilities";

// "Usuarios autorizados" para el módulo de botón de pánico.
// - PANIC_REVIEW: puede ver y reproducir el material.
// - PANIC_MANAGE: además puede tratarlo (asignar, cambiar estado, escalar a caso).
// El administrador general siempre tiene ambos.

type SessionUserLike = {
  role?: Role | string | null;
  capabilities?: string[] | null;
};

function caps(user: SessionUserLike | null | undefined): string[] {
  return Array.isArray(user?.capabilities) ? (user?.capabilities as string[]) : [];
}

export function canViewPanic(user: SessionUserLike | null | undefined): boolean {
  if (!user) return false;
  if (user.role === Role.ADMIN) return true;
  const list = caps(user);
  return list.includes(CAPABILITIES.PANIC_REVIEW) || list.includes(CAPABILITIES.PANIC_MANAGE);
}

export function canManagePanic(user: SessionUserLike | null | undefined): boolean {
  if (!user) return false;
  if (user.role === Role.ADMIN) return true;
  return caps(user).includes(CAPABILITIES.PANIC_MANAGE);
}
