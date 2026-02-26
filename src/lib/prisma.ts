import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

function withPgBouncerFlag(url?: string) {
  const raw = String(url ?? "").trim();
  if (!raw) return raw;
  if (!raw.includes("-pooler.")) return raw;
  if (/[?&]pgbouncer=true(?:&|$)/i.test(raw)) return raw;
  return `${raw}${raw.includes("?") ? "&" : "?"}pgbouncer=true`;
}

const databaseUrl = withPgBouncerFlag(process.env.DATABASE_URL);

export const prisma =
  global.prisma ||
  new PrismaClient({
    log: ["error", "warn"],
    ...(databaseUrl
      ? {
          datasources: {
            db: { url: databaseUrl },
          },
        }
      : {}),
  });

if (process.env.NODE_ENV !== "production") global.prisma = prisma;
