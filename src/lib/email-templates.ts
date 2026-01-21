// src/lib/email-templates.ts
import { NotificationType } from "@prisma/client";

function escapeHtml(s: string) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function layout(title: string, bodyHtml: string) {
  return `<!doctype html>
<html>
  <body style="font-family: ui-sans-serif, system-ui, -apple-system; background:#f6f7f9; padding:24px;">
    <div style="max-width:640px; margin:0 auto; background:#fff; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">
      <div style="padding:16px 18px; border-bottom:1px solid #e5e7eb;">
        <div style="font-size:14px; color:#111827; font-weight:700;">Capital Desk</div>
        <div style="font-size:12px; color:#6b7280;">Notificación automática</div>
      </div>
      <div style="padding:18px;">
        <h2 style="margin:0 0 10px; font-size:16px; color:#111827;">
          ${escapeHtml(title)}
        </h2>
        ${bodyHtml}
      </div>
      <div style="padding:12px 18px; border-top:1px solid #e5e7eb; font-size:12px; color:#6b7280;">
        Por favor no respondas a este correo.
      </div>
    </div>
  </body>
</html>`;
}

/**
 * Convierte un body con saltos de línea en una lista <ul><li>
 */
function renderBodyAsList(body: string) {
  const items = body
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);

  if (!items.length) return "";

  return `
    <ul style="margin:0 0 12px; padding-left:18px; color:#374151; font-size:14px; line-height:1.5;">
      ${items.map(i => `<li style="margin-bottom:6px;">${escapeHtml(i)}</li>`).join("")}
    </ul>
  `;
}

export function buildEmail(params: {
  type: NotificationType;
  title: string;
  body?: string | null;
  href?: string | null;
}) {
  const baseUrl = process.env.NEXTAUTH_URL || "";
  const link = params.href ? `${baseUrl}${params.href}` : null;

  const body = params.body ? renderBodyAsList(params.body) : "";

  const cta = link
    ? `
      <p style="margin:14px 0 0;">
        <a
          href="${escapeHtml(link)}"
          style="display:inline-block; background:#111827; color:#fff; text-decoration:none; padding:10px 14px; border-radius:10px; font-size:14px;"
        >
          Abrir en Capital Desk
        </a>
      </p>
    `
    : "";

  const html = layout(params.title, `${body}${cta}`);

  const text = [
    params.title,
    params.body ?? "",
    link ? `Abrir: ${link}` : ""
  ].filter(Boolean).join("\n");

  return { subject: params.title, html, text };
}
