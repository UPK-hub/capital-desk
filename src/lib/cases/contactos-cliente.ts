/**
 * Lista de contactos a los que se les puede avisar el cierre de una novedad.
 *
 * No se filtra por dominio de correo: los contactos del cliente cambian de
 * dominio (capitalbus, moveitcapital...). Se devuelven todos los usuarios
 * activos, marcando los internos de UPK para que aparezcan en un grupo aparte.
 */
import { prisma } from "@/lib/prisma";

const DOMINIOS_INTERNOS = String(
  process.env.INTERNAL_EMAIL_DOMAINS || "upklatam.com,upkeepservices.com.co,upkeepservices.com,upk.local"
)
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

export function esCorreoInternoUpk(email?: string | null): boolean {
  const e = String(email ?? "").toLowerCase();
  return DOMINIOS_INTERNOS.some((d) => e.endsWith(`@${d}`));
}

export async function listarContactosAviso(tenantId: string) {
  const users = await prisma.user.findMany({
    where: { tenantId, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });
  return users
    .map((u) => ({ id: u.id, name: u.name, interno: esCorreoInternoUpk(u.email) }))
    .sort((a, b) => (a.interno === b.interno ? 0 : a.interno ? 1 : -1));
}
