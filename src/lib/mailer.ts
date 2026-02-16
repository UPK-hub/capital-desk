// src/lib/mailer.ts
import nodemailer from "nodemailer";

function must(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function toBool(v: string | undefined) {
  return String(v ?? "").toLowerCase().trim() === "true";
}

function toInt(v: string | undefined, def: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function isEnabled(v: string | undefined, def = true) {
  if (v === undefined) return def;
  const normalized = String(v).toLowerCase().trim();
  return !["0", "false", "no", "off"].includes(normalized);
}

let _transporter: nodemailer.Transporter | null = null;
let _verified = false;

export function getMailer() {
  if (_transporter) return _transporter;

  if (!isEnabled(process.env.SMTP_ENABLED, true)) {
    throw new Error("SMTP is disabled by SMTP_ENABLED");
  }

  const host = must("SMTP_HOST");
  const port = toInt(process.env.SMTP_PORT, 587);
  const secure = toBool(process.env.SMTP_SECURE); // normalmente false en 587
  const user = must("SMTP_USER");
  const pass = must("SMTP_PASS");
  const connectionTimeout = toInt(process.env.SMTP_CONNECTION_TIMEOUT_MS, 5000);
  const greetingTimeout = toInt(process.env.SMTP_GREETING_TIMEOUT_MS, 5000);
  const socketTimeout = toInt(process.env.SMTP_SOCKET_TIMEOUT_MS, 8000);

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },

    // Office365 STARTTLS
    requireTLS: true,

    // Recomendado para evitar handshake raro con O365
    tls: {
      servername: host,
      minVersion: "TLSv1.2",
    },

    // Mejor rendimiento/estabilidad al enviar varios correos
    pool: true,
    maxConnections: 2,
    maxMessages: 50,
    connectionTimeout,
    greetingTimeout,
    socketTimeout,

    // Logs solo en dev (si quieres ver qué pasa)
    logger: process.env.NODE_ENV !== "production",
    debug: process.env.NODE_ENV !== "production",
  });

  return _transporter;
}

export async function sendMail(args: { to: string; subject: string; html: string; text?: string }) {
  if (!isEnabled(process.env.SMTP_ENABLED, true)) {
    return { skipped: true, reason: "smtp_disabled" };
  }

  const from = process.env.SMTP_FROM || must("SMTP_USER");
  const transporter = getMailer();

  // Verifica solo 1 vez por proceso (no en cada envío)
  if (process.env.NODE_ENV !== "production" && !_verified) {
    await transporter.verify();
    _verified = true;
  }

  return transporter.sendMail({
    from,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text,
  });
}
