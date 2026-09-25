/**
 * Avisos al contacto del cliente sobre sus novedades.
 *
 * Cada novedad puede tener asociado un contacto del cliente (campo
 * `Case.notifyOnCloseUserId`). Esa persona recibe dos avisos, en la aplicación y
 * por correo, sin tener que entrar a consultar:
 *
 *  - Al REGISTRARSE las novedades de un reporte importado.
 *  - Al CERRARSE cada novedad, sea cierre manual o automático por el correctivo.
 *
 * Todo es fire-and-forget: si algo falla, se registra en el log y la operación
 * principal sigue su curso. Nunca lanza.
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

/**
 * Aviso de registro: se le informa al contacto del cliente que sus novedades
 * quedaron radicadas. Se manda UN solo mensaje con la lista de casos, en vez de
 * uno por bus, para no llenarle el correo cuando el reporte trae varios buses.
 */
export async function notifyClienteNovedadesCreadas(params: {
  tenantId: string;
  contactoUserId: string;
  fechaReporte: string;
  casos: Array<{ caseId: string; caseNo: number | null; busCode: string; camaras: number }>;
}): Promise<void> {
  try {
    const { tenantId, contactoUserId, fechaReporte, casos } = params;
    if (!contactoUserId || !casos.length) return;

    const contacto = await prisma.user.findFirst({
      where: { id: contactoUserId, tenantId, active: true },
      select: { id: true },
    });
    if (!contacto) return;

    const base = baseUrl();
    const lineas = casos.map(
      (c) => `CASO-${c.caseNo ?? "?"} · ${c.busCode} · ${c.camaras} cámara(s)`
    );
    const titulo =
      casos.length === 1
        ? `Novedad registrada · CASO-${casos[0].caseNo ?? "?"} · ${casos[0].busCode}`
        : `${casos.length} novedades registradas del reporte del ${fechaReporte}`;

    await notifyTenantUsers({
      tenantId,
      userIds: [contacto.id],
      type: NotificationType.CASE_CREATED,
      title: titulo,
      body: lineas.join(" · "),
      href: casos.length === 1 ? `/cases/${casos[0].caseId}` : "/novedades",
      meta: { kind: "NOVEDADES_CREADAS", fechaReporte, caseIds: casos.map((c) => c.caseId) },
      emailBodyHtml: [
        `<p>Se registraron en la mesa las novedades del reporte del <strong>${fechaReporte}</strong>:</p>`,
        "<ul>",
        ...casos.map(
          (c) =>
            `<li>${
              base
                ? `<a href="${base}/cases/${c.caseId}">CASO-${c.caseNo ?? "?"}</a>`
                : `CASO-${c.caseNo ?? "?"}`
            } · Bus ${c.busCode} · ${c.camaras} cámara(s)</li>`
        ),
        "</ul>",
        "<p>Le avisaremos por este mismo medio cuando cada una quede cerrada.</p>",
      ].join("\n"),
      emailBodyText: [
        `Se registraron en la mesa las novedades del reporte del ${fechaReporte}:`,
        ...lineas,
        base ? `${base}/novedades` : "",
        "Le avisaremos cuando cada una quede cerrada.",
      ]
        .filter(Boolean)
        .join("\n"),
    });
  } catch (e) {
    console.error("NOTIFY_CLIENTE_NOVEDADES_CREADAS_FAILED", e);
  }
}
