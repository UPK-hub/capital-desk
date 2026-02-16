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
    NotificationType.VIDEO_REQUEST_CREATED,
    NotificationType.VIDEO_REQUEST_IN_PROGRESS,
    NotificationType.VIDEO_REQUEST_DELIVERED,
    NotificationType.VIDEO_REQUEST_FAILED,
    NotificationType.VIDEO_REQUEST_INTERNAL_DELIVERED,
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
  const queuedEmails =
    sendEmailFlag && shouldEmail(type)
      ? recipients
          .map((u) => u.email?.trim())
          .filter((email): email is string => Boolean(email))
      : [];

  if (queuedEmails.length) {
    const { subject, html, text } = buildEmail({ type, title, body, href });

    // Enviar correos en background para no bloquear requests criticos.
    void (async () => {
      await Promise.allSettled(
        queuedEmails.map(async (email) => {
          try {
            await sendMail({ to: email, subject, html, text });
          } catch (e) {
            console.error("EMAIL_SEND_FAILED", { to: email, type, err: e });
          }
        })
      );
    })();
  }

  return { ok: true, created: recipients.length, emailed: 0, queued: queuedEmails.length };
}
