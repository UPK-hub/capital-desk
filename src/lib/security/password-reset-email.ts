import { sendMail } from "@/lib/mailer";

function escapeHtml(value: string) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getBaseUrl() {
  return process.env.NEXTAUTH_URL?.trim() || "http://localhost:3000";
}

function buildResetUrl(rawToken: string) {
  return `${getBaseUrl()}/reset-password?token=${encodeURIComponent(rawToken)}`;
}

type PasswordResetEmailParams = {
  to: string;
  userName?: string | null;
  rawToken: string;
  expiresAt: Date;
  reason: "RESET_PASSWORD" | "SET_PASSWORD";
};

export async function sendPasswordResetEmail(params: PasswordResetEmailParams) {
  const resetUrl = buildResetUrl(params.rawToken);
  const subject =
    params.reason === "SET_PASSWORD"
      ? "Capital Desk | Configura tu contrasena"
      : "Capital Desk | Restablecer contrasena";

  const greeting = params.userName?.trim()
    ? `Hola ${escapeHtml(params.userName.trim())},`
    : "Hola,";

  const actionText =
    params.reason === "SET_PASSWORD"
      ? "Haz clic en el enlace para configurar tu contrasena."
      : "Haz clic en el enlace para restablecer tu contrasena.";

  const expiresText = params.expiresAt.toLocaleString("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
  });

  const html = `<!doctype html>
<html>
  <body style="font-family: Arial, sans-serif; background:#f5f7fa; padding:24px;">
    <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #dbe3ee;border-radius:12px;padding:24px;">
      <h2 style="margin:0 0 12px;color:#0f172a;">${subject}</h2>
      <p style="margin:0 0 8px;color:#1f2937;">${greeting}</p>
      <p style="margin:0 0 16px;color:#1f2937;">${actionText}</p>
      <p style="margin:0 0 16px;">
        <a href="${escapeHtml(
          resetUrl
        )}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#2563eb;color:#fff;text-decoration:none;">
          Abrir enlace de seguridad
        </a>
      </p>
      <p style="margin:0 0 8px;color:#475569;font-size:13px;">
        Este enlace expira: ${escapeHtml(expiresText)}
      </p>
      <p style="margin:0;color:#64748b;font-size:12px;">
        Si no solicitaste este cambio, ignora este correo.
      </p>
    </div>
  </body>
</html>`;

  const text = [
    greeting,
    actionText,
    `Enlace: ${resetUrl}`,
    `Expira: ${expiresText}`,
  ].join("\n");

  await sendMail({
    to: params.to,
    subject,
    html,
    text,
  });
}
