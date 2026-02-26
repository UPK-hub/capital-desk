import { NotificationType } from "@prisma/client";

type BadgeTone = "success" | "info" | "warning";

type TypeTemplateConfig = {
  tone: BadgeTone;
  badgeText: string;
  ctaText: string;
};

const TEMPLATE_BY_TYPE: Record<NotificationType, TypeTemplateConfig> = {
  [NotificationType.CASE_CREATED]: {
    tone: "info",
    badgeText: "Nuevo caso",
    ctaText: "Ver caso completo",
  },
  [NotificationType.CASE_ASSIGNED]: {
    tone: "info",
    badgeText: "Caso asignado",
    ctaText: "Abrir caso",
  },
  [NotificationType.WO_STARTED]: {
    tone: "info",
    badgeText: "OT iniciada",
    ctaText: "Abrir OT",
  },
  [NotificationType.WO_FINISHED]: {
    tone: "success",
    badgeText: "OT finalizada",
    ctaText: "Ver detalles de la OT",
  },
  [NotificationType.FORM_SAVED]: {
    tone: "success",
    badgeText: "Formato guardado",
    ctaText: "Abrir en Capital Desk",
  },
  [NotificationType.VIDEO_REQUEST_CREATED]: {
    tone: "info",
    badgeText: "Video solicitado",
    ctaText: "Ver solicitud",
  },
  [NotificationType.VIDEO_REQUEST_IN_PROGRESS]: {
    tone: "info",
    badgeText: "Video en proceso",
    ctaText: "Ver solicitud",
  },
  [NotificationType.VIDEO_REQUEST_DELIVERED]: {
    tone: "success",
    badgeText: "Video entregado",
    ctaText: "Abrir solicitud",
  },
  [NotificationType.VIDEO_REQUEST_FAILED]: {
    tone: "warning",
    badgeText: "Video con novedad",
    ctaText: "Revisar solicitud",
  },
  [NotificationType.VIDEO_REQUEST_INTERNAL_DELIVERED]: {
    tone: "success",
    badgeText: "Video interno entregado",
    ctaText: "Abrir solicitud",
  },
};

function escapeHtml(s: string) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeLines(value: string | null | undefined) {
  return String(value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function resolveLink(href: string | null | undefined) {
  const cleanHref = String(href ?? "").trim();
  if (!cleanHref) return null;
  if (/^https?:\/\//i.test(cleanHref)) return cleanHref;

  const baseUrl = (process.env.APP_URL || process.env.NEXTAUTH_URL || "").trim();
  if (!baseUrl) return cleanHref;

  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const normalizedPath = cleanHref.startsWith("/")
    ? cleanHref
    : `/${cleanHref.replace(/^\/+/, "")}`;
  return `${normalizedBase}${normalizedPath}`;
}

function renderInfoList(lines: string[]) {
  if (!lines.length) return "";
  return `
    <div class="info-box">
      <ul class="info-list">
        ${lines
          .map((line) => `<li class="info-list-item">${escapeHtml(line)}</li>`)
          .join("")}
      </ul>
    </div>
  `;
}

function badgeInlineStyle(tone: BadgeTone) {
  const toneStyle =
    tone === "success"
      ? "background:#d1fae5;color:#065f46;"
      : tone === "warning"
        ? "background:#fef3c7;color:#92400e;"
        : "background:#dbeafe;color:#1e40af;";
  return `display:inline-block;padding:7px 14px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:0.25px;margin-bottom:14px;text-transform:uppercase;${toneStyle}`;
}

function layout(params: {
  tone: BadgeTone;
  badgeText: string;
  title: string;
  description: string;
  detailsHtml: string;
  ctaHtml: string;
}) {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CapitalDesk - Notificacion</title>
    <style>
      body {
        margin: 0;
        padding: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        background: #f5f6fa;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }
      .email-wrapper {
        width: 100%;
        background: #f5f6fa;
        padding: 28px 12px;
        box-sizing: border-box;
      }
      .email-container {
        max-width: 640px;
        margin: 0 auto;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 6px 24px rgba(15, 23, 42, 0.08);
      }
      .email-header {
        background: linear-gradient(135deg, #1e3a5f 0%, #2a4a6f 100%);
        padding: 28px 24px;
      }
      .logo {
        margin: 0;
        color: #ffffff;
        font-size: 24px;
        font-weight: 800;
        letter-spacing: -0.3px;
      }
      .logo-subtitle {
        margin: 6px 0 0;
        color: rgba(255, 255, 255, 0.78);
        font-size: 12px;
      }
      .email-content {
        padding: 30px 24px;
      }
      .notification-badge {
        display: inline-block;
        padding: 7px 14px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.25px;
        margin-bottom: 14px;
        text-transform: uppercase;
      }
      .badge-success {
        background: #d1fae5;
        color: #065f46;
      }
      .badge-info {
        background: #dbeafe;
        color: #1e40af;
      }
      .badge-warning {
        background: #fef3c7;
        color: #92400e;
      }
      .email-title {
        margin: 0 0 10px;
        color: #111827;
        font-size: 24px;
        line-height: 1.25;
      }
      .email-description {
        margin: 0;
        color: #4b5563;
        font-size: 16px;
        line-height: 1.6;
      }
      .info-box {
        margin-top: 22px;
        border-left: 4px solid #2563eb;
        background: #f8fafc;
        border-radius: 10px;
        padding: 14px 16px;
      }
      .info-list {
        margin: 0;
        padding-left: 18px;
      }
      .info-list-item {
        color: #374151;
        font-size: 14px;
        line-height: 1.55;
        margin-bottom: 7px;
      }
      .info-list-item:last-child {
        margin-bottom: 0;
      }
      .cd-rich {
        margin-top: 22px;
      }
      .cd-rich table {
        border-collapse: collapse;
        width: 100%;
      }
      .cd-rich td, .cd-rich th {
        font-size: 13px;
        line-height: 1.45;
      }
      .cta-wrap {
        margin-top: 24px;
      }
      .cta-button {
        display: inline-block;
        text-decoration: none;
        background: linear-gradient(90deg, #2563eb 0%, #38bdf8 100%);
        color: #ffffff !important;
        border-radius: 12px;
        padding: 12px 18px;
        font-size: 15px;
        font-weight: 700;
      }
      .email-footer {
        border-top: 1px solid #e5e7eb;
        background: #f8fafc;
        padding: 18px 24px;
      }
      .footer-text {
        margin: 0;
        font-size: 12px;
        color: #64748b;
        line-height: 1.6;
      }
      @media only screen and (max-width: 600px) {
        .email-wrapper {
          padding: 16px 8px;
        }
        .email-header {
          padding: 22px 16px;
        }
        .email-content {
          padding: 22px 16px;
        }
        .email-title {
          font-size: 21px;
        }
        .cta-button {
          width: 100%;
          text-align: center;
          box-sizing: border-box;
        }
      }
    </style>
  </head>
  <body>
    <div class="email-wrapper">
      <div class="email-container">
        <div
          class="email-header"
          bgcolor="#1e3a5f"
          style="background:#1e3a5f;background-image:linear-gradient(135deg,#1e3a5f 0%,#2a4a6f 100%);padding:28px 24px;"
        >
          <h1
            class="logo"
            style="margin:0;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.3px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;"
          >
            CapitalDesk
          </h1>
          <p
            class="logo-subtitle"
            style="margin:6px 0 0;color:rgba(255,255,255,0.82);font-size:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;"
          >
            Notificacion automatica
          </p>
        </div>
        <div class="email-content">
          <span
            class="notification-badge badge-${params.tone}"
            style="${badgeInlineStyle(params.tone)}"
          >
            ${escapeHtml(params.badgeText)}
          </span>
          <h2
            class="email-title"
            style="margin:0 0 10px;color:#111827;font-size:24px;line-height:1.25;font-weight:800;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;"
          >
            ${escapeHtml(params.title || "Notificacion CapitalDesk")}
          </h2>
          <p
            class="email-description"
            style="margin:0;color:#4b5563;font-size:16px;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;"
          >
            ${escapeHtml(params.description)}
          </p>
          ${params.detailsHtml}
          ${params.ctaHtml}
        </div>
        <div class="email-footer">
          <p class="footer-text">
            Por favor no respondas a este correo.
            <br />
            Este es un mensaje automatico del sistema CapitalDesk.
          </p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

export function buildEmail(params: {
  type: NotificationType;
  title: string;
  body?: string | null;
  href?: string | null;
  bodyHtml?: string | null;
  textOverride?: string | null;
}) {
  const templateConfig = TEMPLATE_BY_TYPE[params.type] ?? {
    tone: "info" as BadgeTone,
    badgeText: "Notificacion",
    ctaText: "Abrir en Capital Desk",
  };

  const link = resolveLink(params.href);
  const lines = normalizeLines(params.body);
  const description = lines[0] ?? "Tienes una nueva actualizacion en CapitalDesk.";
  const detailLines = lines.length > 1 ? lines.slice(1) : [];

  const detailsHtml = params.bodyHtml?.trim()
    ? `<div class="cd-rich">${params.bodyHtml}</div>`
    : renderInfoList(detailLines);

  const ctaHtml = link
    ? `
      <p class="cta-wrap">
        <a
          href="${escapeHtml(link)}"
          class="cta-button"
          target="_blank"
          rel="noopener noreferrer"
        >
          ${escapeHtml(templateConfig.ctaText)}
        </a>
      </p>
    `
    : "";

  const html = layout({
    tone: templateConfig.tone,
    badgeText: templateConfig.badgeText,
    title: params.title,
    description,
    detailsHtml,
    ctaHtml,
  });

  const text =
    params.textOverride ??
    [params.title, params.body ?? "", link ? `Abrir: ${link}` : ""]
      .filter(Boolean)
      .join("\n");

  return { subject: params.title, html, text };
}
