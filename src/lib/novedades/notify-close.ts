/**
 * Aviso de cierre al contacto del cliente.
 *
 * Cada novedad puede tener asociado un contacto de CapitalBus (campo
 * `Case.notifyOnCloseUserId`). Cuando la novedad se cierra —manualmente o en
 * automático al resolverse el correctivo— esa persona recibe el reporte de
 * cierre en la aplicación y por correo, sin tener que entrar a consultar.
 *
 * Es fire-and-forget: si algo falla, se registra en el log y el cierre sigue su
 * curso. Nunca lanza.
 */
import { prisma } from "@/lib/prisma";
import { CaseStatus, CaseType, NotificationType } from "@prisma/client";
import { notifyTenantUsers } from "@/lib/notifications";

function baseUrl(): string {
  return (process.env.APP_URL || process.env.NEXTAUTH_URL || "").trim().replace(/\/+$/, "");
}

function fmtFecha(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "long",
    timeZone: "America/Bogota",
  }).format(d);
}

export async function notifyClienteNovedadCerrada(
  caseId: string,
  opts?: { closedById?: string | null; auto?: boolean }
): Promise<void> {
  try {
    const c = await prisma.case.findFirst({
      where: { id: caseId, type: CaseType.NOVEDAD },
      select: {
        id: true,
        caseNo: true,
        title: true,
        status: true,
        createdAt: true,
        tenantId: true,
        notifyOnCloseUserId: true,
        bus: { select: { code: true, plate: true } },
      },
    });
    if (!c || c.status !== CaseStatus.CERRADO || !c.notifyOnCloseUserId) return;

    let quien = opts?.auto ? "Cierre automático al resolverse el correctivo" : "la mesa de ayuda";
    if (!opts?.auto && opts?.closedById) {
      const u = await prisma.user.findFirst({
        where: { id: opts.closedById },
        select: { name: true },
      });
      if (u?.name) quien = u.name;
    }

    const ref = `CASO-${c.caseNo ?? "?"}`;
    const bus = `${c.bus?.code ?? "—"}${c.bus?.plate ? ` (${c.bus.plate})` : ""}`;
    const href = `/cases/${c.id}`;
    const url = baseUrl() ? `${baseUrl()}${href}` : null;

    const lineas = [
      `Novedad: ${c.title}`,
      `Bus: ${bus}`,
      `Reportada: ${fmtFecha(c.createdAt)}`,
      `Cerrada: ${fmtFecha(new Date())}`,
      `Cerró: ${quien}`,
    ];

    await notifyTenantUsers({
      tenantId: c.tenantId,
      userIds: [c.notifyOnCloseUserId],
      type: NotificationType.CASE_CLOSED,
      title: `Novedad cerrada · ${ref} · ${c.bus?.code ?? ""}`.trim(),
      body: lineas.join(" · "),
      href,
      meta: { caseId: c.id, caseNo: c.caseNo, kind: "NOVEDAD_CERRADA" },
      emailBodyHtml: [
        `<p>La novedad <strong>${ref}</strong> reportada para el bus <strong>${bus}</strong> quedó cerrada.</p>`,
        "<ul>",
        ...lineas.map((l) => `<li>${l}</li>`),
        "</ul>",
        url ? `<p><a href="${url}">Ver la novedad en Capital Desk</a></p>` : "",
      ].join("\n"),
      emailBodyText: [`La novedad ${ref} del bus ${bus} quedó cerrada.`, ...lineas, url ?? ""]
        .filter(Boolean)
        .join("\n"),
    });
  } catch (e) {
    console.error("NOTIFY_CLIENTE_NOVEDAD_CERRADA_FAILED", e);
  }
}
