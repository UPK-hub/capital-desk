export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import NextAuth from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getClientIp } from "@/lib/security/client-ip";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { LOGIN_RATE_LIMIT } from "@/lib/security/constants";

const handler = NextAuth(authOptions);

function buildRateLimitResponse(retryAfterMs: number) {
  const retryAfterSeconds = Math.max(Math.ceil(retryAfterMs / 1000), 1);

  return NextResponse.json(
    {
      error: "Demasiados intentos de inicio de sesion. Intenta de nuevo en unos minutos.",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
      },
    }
  );
}

async function readCredentialEmail(req: NextRequest) {
  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";

  try {
    if (contentType.includes("application/json")) {
      const body = await req.clone().json();
      return String(body?.email ?? "").toLowerCase().trim();
    }

    if (
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data")
    ) {
      const form = await req.clone().formData();
      return String(form.get("email") ?? "").toLowerCase().trim();
    }

    const raw = await req.clone().text();
    if (!raw) return "";

    const params = new URLSearchParams(raw);
    return String(params.get("email") ?? "").toLowerCase().trim();
  } catch {
    return "";
  }
}

function isCredentialsCallback(req: NextRequest) {
  const { pathname } = new URL(req.url);
  return pathname.endsWith("/callback/credentials");
}

export async function POST(
  req: NextRequest,
  ctx: { params: { nextauth: string[] } }
) {
  if (isCredentialsCallback(req)) {
    const ip = getClientIp(req);
    const email = await readCredentialEmail(req);

    const ipBucket = consumeRateLimit({
      key: `auth:login:ip:${ip}`,
      ...LOGIN_RATE_LIMIT,
    });

    if (!ipBucket.ok) {
      return buildRateLimitResponse(ipBucket.retryAfterMs);
    }

    if (email) {
      const emailBucket = consumeRateLimit({
        key: `auth:login:email:${email}:ip:${ip}`,
        ...LOGIN_RATE_LIMIT,
      });

      if (!emailBucket.ok) {
        return buildRateLimitResponse(emailBucket.retryAfterMs);
      }
    }
  }

  return (handler as any)(req, ctx);
}

export async function GET(
  req: NextRequest,
  ctx: { params: { nextauth: string[] } }
) {
  return (handler as any)(req, ctx);
}
