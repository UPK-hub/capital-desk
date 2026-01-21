import { Resend } from "resend";

const enabled = String(process.env.EMAIL_ENABLED ?? "").toLowerCase() === "true";
const from = process.env.EMAIL_FROM || "no-reply@localhost";
const appUrl = process.env.APP_URL || "http://localhost:3000";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
};

export function getAppUrl() {
  return appUrl;
}

export async function sendEmail(input: SendEmailInput) {
  if (!enabled) return { ok: true, skipped: true };
  if (!resend) return { ok: false, error: "RESEND_API_KEY no configurada" };

  const to = Array.isArray(input.to) ? input.to : [input.to];
  const clean = to.map((x) => String(x || "").trim()).filter(Boolean);
  if (!clean.length) return { ok: true, skipped: true };

  await resend.emails.send({
    from,
    to: clean,
    subject: input.subject,
    html: input.html,
  });

  return { ok: true };
}
