import { prisma } from "@/lib/prisma";
import { NotificationType, Role } from "@prisma/client";

/**
 * Firma estable para no pelear con TS en rutas.
 * Persistencia: se intenta guardar (incluye meta si el modelo lo soporta).
 * Si tu modelo no tiene meta/href, ajustamos aquí una sola vez.
 */
export async function notifyTenantUsers(args: {
  tenantId: string;
  roles?: Role[];
  type: NotificationType;
  title: string;
  body: string;
  href?: string | null;
  meta?: any;
}) {
  const roles = args.roles ?? [Role.ADMIN, Role.BACKOFFICE];

  const users = await prisma.user.findMany({
    where: {
      tenantId: args.tenantId,
      active: true,
      role: { in: roles },
    },
    select: { id: true },
  });

  if (users.length === 0) return { created: 0 };

  // Construimos data como any para no depender de cómo definiste Notification.
  const rows = users.map((u) => {
    const row: any = {
      tenantId: args.tenantId,
      userId: u.id,
      type: args.type,
      title: args.title,
      body: args.body,
      readAt: null,
    };
    if (args.href !== undefined) row.href = args.href ?? null;
    if (args.meta !== undefined) row.meta = args.meta;
    return row;
  });

  // createMany puede fallar si tu modelo no tiene meta/href.
  // Para no romper el flujo, hacemos try/catch y reintentamos sin esos campos.
  try {
    await prisma.notification.createMany({ data: rows as any[] });
  } catch {
    const stripped = rows.map((r) => {
      const { meta, href, ...rest } = r;
      return rest;
    });
    await prisma.notification.createMany({ data: stripped as any[] });
  }

  return { created: users.length };
}
