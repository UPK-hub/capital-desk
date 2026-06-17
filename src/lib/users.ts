// Helpers de usuarios compartidos entre API y UI.
//
// "Usuarios de Capital" = usuarios cuyo email contiene "@capitalbus." (cubre
// .co/.com/.com.co). No existe flag en BD; se identifican por email
// (case-insensitive).

/**
 * Devuelve true si el email pertenece a un usuario de Capital
 * (el dominio contiene "@capitalbus.").
 */
export function isCapitalUserEmail(email?: string | null): boolean {
  return !!email && email.toLowerCase().includes("@capitalbus.");
}
