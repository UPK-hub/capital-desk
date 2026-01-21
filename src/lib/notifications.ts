import { prisma } from "@/lib/prisma";
import { NotificationType, Role } from "@prisma/client";
import { sendMail } from "@/lib/mailer";
import { buildEmail } from "@/lib/email-templates";

type NotifyParams = {
  tenantId: string;
  roles?: Role[];
  userIds?: string[];

  type: NotificationType;
  title: string;
  body?: string | null;
  href?: string | null;
  meta?: any;

  // Control fino
  sendEmail?: boolean; // default true
};

function shouldEmail(type: NotificationType) {
  // Ajusta a tu gusto
  return [
    NotificationType.CASE_ASSIGNED,
    NotificationType.WO_STARTED,
    NotificationType.WO_FINISHED,
    NotificationType.CASE_CREATED,
    NotificationType.FORM_SAVED,
  ].includes(type);
}

export async function notifyTenantUsers(params: NotifyParams) {
  const { tenantId, roles, userIds, type, title, body, href, meta } = params;

  // 1) Resolver destinatarios
  const recipients = await prisma.user.findMany({
    where: {
      tenantId,
      active: true,
      ...(userIds?.length ? { id: { in: userIds } } : {}),
      ...(roles?.length ? { role: { in: roles } } : {}),
    },
    select: { id: true, email: true, name: true },
  });

  if (!recipients.length) return { ok: true, created: 0, emailed: 0 };

  // 2) Guardar notificaciones en BD
  await prisma.notification.createMany({
    data: recipients.map((u) => ({
      tenantId,
      userId: u.id,
      type,
      title,
      body: body ?? null,
      meta: meta ?? null,
    })),
  });

  // 3) Enviar correos (solo server)
  const sendEmailFlag = params.sendEmail ?? true;

  let emailed = 0;
  if (sendEmailFlag && shouldEmail(type)) {
    const { subject, html, text } = buildEmail({ type, title, body, href });

    // Envío 1 a 1 (más control); si luego quieres batch, se puede optimizar
    for (const u of recipients) {
      if (!u.email) continue;
      try {
        await sendMail({ to: u.email, subject, html, text });
        emailed++;
      } catch (e) {
        // No abortar todo por un correo fallido
        console.error("EMAIL_SEND_FAILED", { to: u.email, type, err: e });
      }
    }
  }

  return { ok: true, created: recipients.length, emailed };
}
