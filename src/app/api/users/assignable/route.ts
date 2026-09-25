export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { isCapitalUserEmail } from "@/lib/users";

/**
 * Dominios de correo del equipo interno de UPK. Sirve solo para ordenar y
 * etiquetar la lista de contactos, no para excluir a nadie. Se puede ampliar sin
 * tocar el código con la variable INTERNAL_EMAIL_DOMAINS (separada por comas).
 */
const DOMINIOS_INTERNOS = String(
  process.env.INTERNAL_EMAIL_DOMAINS || "upklatam.com,upkeepservices.com.co,upkeepservices.com"
)
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

function isInternalUpkEmail(email?: string | null): boolean {
  const e = String(email ?? "").toLowerCase();
  return DOMINIOS_INTERNOS.some((d) => e.endsWith(`@${d}`));
}

// Roles que pueden listar usuarios asignables (gestionan asignaciones).
const ALLOWED_ROLES: Role[] = [Role.ADMIN, Role.BACKOFFICE, Role.SUPERVISOR, Role.PLANNER, Role.HELPDESK];

/**
 * GET /api/users/assignable?context=video|case
 *
 * - context=case    -> solo técnicos activos (flujo de correctivo/preventivo).
 * - context=video   -> técnicos activos + usuarios de Capital (email @capitalbus.).
 * - context=cliente -> solo contactos del cliente (email @capitalbus.), para
 *                     avisarles del cierre de una novedad.
 *
 * Tenant-scoped. Devuelve { items: [{ id, name, email, role, isCapital }] }.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = (session.user as any).role as Role;
  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const tenantId = (session.user as any).tenantId as string;
  const context = String(req.nextUrl.searchParams.get("context") ?? "case").trim().toLowerCase();
  const q = req.nextUrl.searchParams.get("query")?.trim() ?? "";

  if (context === "cliente") {
    // Contactos a los que se les puede avisar el cierre de una novedad.
    // No se filtra por un dominio fijo: los correos del cliente cambian
    // (capitalbus, moveitcapital...). Se listan todos los usuarios activos y se
    // marcan los internos de UPK para que aparezcan de últimos.
    const users = await prisma.user.findMany({
      where: {
        tenantId,
        active: true,
        ...(q.length >= 2
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true },
    });

    const items = users
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        isCapital: isCapitalUserEmail(u.email),
        isInterno: isInternalUpkEmail(u.email),
      }))
      .sort((a, b) => {
        if (a.isInterno !== b.isInterno) return a.isInterno ? 1 : -1;
        return String(a.name ?? "").localeCompare(String(b.name ?? ""));
      });

    return NextResponse.json({ items });
  }

  if (context === "video") {
    // Para video: técnicos O usuarios de Capital. El filtro por dominio Capital
    // se aplica en memoria (Prisma no expresa bien "contiene @capitalbus." en
    // todos los TLD). Traemos activos y filtramos.
    const users = await prisma.user.findMany({
      where: {
        tenantId,
        active: true,
        ...(q.length >= 2
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true },
    });

    const items = users
      .filter((u) => u.role === Role.TECHNICIAN || isCapitalUserEmail(u.email))
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        isCapital: isCapitalUserEmail(u.email),
      }));

    return NextResponse.json({ items });
  }

  // context=case (por defecto): solo técnicos.
  const techs = await prisma.user.findMany({
    where: {
      tenantId,
      active: true,
      role: Role.TECHNICIAN,
      ...(q.length >= 2
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    take: 50,
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true },
  });

  const items = techs.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    isCapital: isCapitalUserEmail(u.email),
  }));

  return NextResponse.json({ items });
}
