export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma, Role } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { normalizeBusCode } from "@/lib/integrations/tramas";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/security/client-ip";
import { saveGeneratedUpload, saveUpload } from "@/lib/uploads";

type AuthResult =
  | { ok: true; fallbackTenantId: string | null }
  | { ok: false; response: NextResponse };

function isFileLike(value: FormDataEntryValue | null): value is File {
  return Boolean(
    value &&
      typeof value === "object" &&
      "arrayBuffer" in value &&
      "name" in value &&
      "size" in value
  );
}

function formText(form: FormData, name: string) {
  const value = form.get(name);
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean.length ? clean : null;
}

function safeName(name: string) {
  return String(name || "metadata.json").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function parseJsonValue(text: string): Prisma.InputJsonValue | undefined {
  const clean = text.trim();
  if (!clean) return undefined;
  const parsed = JSON.parse(clean);
  return parsed === null ? undefined : (parsed as Prisma.InputJsonValue);
}

async function authenticate(req: NextRequest): Promise<AuthResult> {
  const integrationSecret =
    process.env.INTEGRATION_VIDEO_SECRET || process.env.INTEGRATION_INGEST_SECRET;
  const incomingSecret = req.headers.get("x-integration-secret");

  if (integrationSecret) {
    if (!incomingSecret || incomingSecret !== integrationSecret) {
      return {
        ok: false,
        response: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
      };
    }
    return { ok: true, fallbackTenantId: null };
  }

  const session = await getServerSession(authOptions);
  const role = session?.user?.role as Role | undefined;
  if (!session?.user || (role !== Role.ADMIN && role !== Role.BACKOFFICE)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    };
  }

  return { ok: true, fallbackTenantId: (session.user as any).tenantId as string };
}

async function resolveTenant(params: {
  tenantCode: string | null;
  fallbackTenantId: string | null;
}) {
  if (params.tenantCode) {
    return prisma.tenant.findUnique({
      where: { code: params.tenantCode },
      select: { id: true, code: true },
    });
  }

  if (params.fallbackTenantId) {
    return prisma.tenant.findUnique({
      where: { id: params.fallbackTenantId },
      select: { id: true, code: true },
    });
  }

  return null;
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Content-Type debe ser multipart/form-data" },
      { status: 415 }
    );
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "No se pudo leer el multipart" }, { status: 400 });
  }

  const tenantCode =
    formText(form, "tenantCode") ??
    req.headers.get("x-tenant-code") ??
    process.env.INTEGRATION_DEFAULT_TENANT_CODE ??
    null;
  const tenant = await resolveTenant({
    tenantCode,
    fallbackTenantId: auth.fallbackTenantId,
  });

  if (!tenant) {
    return NextResponse.json(
      {
        error: "Tenant no encontrado",
        details: "Envia x-tenant-code, tenantCode o configura INTEGRATION_DEFAULT_TENANT_CODE",
      },
      { status: 400 }
    );
  }

  const file = form.get("file");
  if (!isFileLike(file) || file.size <= 0) {
    return NextResponse.json({ error: "Archivo de video requerido en campo file" }, { status: 400 });
  }

  const filename = formText(form, "filename") ?? file.name ?? "video.mp4";
  const isMp4 =
    filename.toLowerCase().endsWith(".mp4") ||
    String(file.name ?? "").toLowerCase().endsWith(".mp4") ||
    file.type === "video/mp4";
  if (!isMp4) {
    return NextResponse.json({ error: "Solo se aceptan videos .mp4" }, { status: 400 });
  }

  const maxBytes = Number(process.env.INTEGRATION_VIDEO_MAX_BYTES ?? 1024 * 1024 * 1024);
  if (Number.isFinite(maxBytes) && maxBytes > 0 && file.size > maxBytes) {
    return NextResponse.json(
      { error: "Video demasiado grande", maxBytes },
      { status: 413 }
    );
  }

  const registerId = formText(form, "registerid") ?? formText(form, "registerId");
  const deviceId = formText(form, "deviceid") ?? formText(form, "deviceId");
  const vehicleId = formText(form, "vehicleid") ?? formText(form, "vehicleId");
  const busCode = vehicleId ? normalizeBusCode(vehicleId) : null;
  const source = req.headers.get("x-source") ?? formText(form, "source") ?? "device-backup";

  const bus = busCode
    ? await prisma.bus.findFirst({
        where: { tenantId: tenant.id, code: busCode },
        select: { id: true, code: true },
      })
    : null;

  const received = new Date();
  const day = received.toISOString().slice(0, 10);
  const subdir = `integration-videos/${safeName(tenant.code)}/${day}`;
  const filePath = await saveUpload(file, subdir, {
    fileNamePrefix: [busCode, deviceId, registerId].filter(Boolean).join("_"),
  });

  const metadataEntry = form.get("metadata");
  let metadataPath: string | null = null;
  let metadataJson: Prisma.InputJsonValue | undefined;

  if (isFileLike(metadataEntry) && metadataEntry.size > 0) {
    const metadataText = await metadataEntry.text();
    try {
      metadataJson = parseJsonValue(metadataText);
    } catch {
      metadataJson = {
        parseError: "metadata no es JSON valido",
        rawPreview: metadataText.slice(0, 2000),
      };
    }
    metadataPath = await saveUpload(metadataEntry, subdir, {
      fileNamePrefix: [busCode, deviceId, registerId, "metadata"].filter(Boolean).join("_"),
    });
  } else if (typeof metadataEntry === "string" && metadataEntry.trim()) {
    const metadataText = metadataEntry.trim();
    try {
      metadataJson = parseJsonValue(metadataText);
    } catch {
      metadataJson = {
        parseError: "metadata no es JSON valido",
        rawPreview: metadataText.slice(0, 2000),
      };
    }
    metadataPath = await saveGeneratedUpload(
      `${subdir}/${Date.now()}_${safeName(filename)}.json`,
      Buffer.from(metadataText, "utf8"),
      { originalName: `${filename}.json`, mimeType: "application/json; charset=utf-8" }
    );
  }

  const requestMeta: Prisma.JsonObject = {
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent"),
    contentType,
    host: req.headers.get("host"),
    sourceHeader: req.headers.get("x-source"),
    originalFileName: file.name || null,
    metadataOriginalName: isFileLike(metadataEntry) ? metadataEntry.name || null : null,
  };

  const created = await prisma.integrationVideo.create({
    data: {
      tenantId: tenant.id,
      busId: bus?.id ?? null,
      busCode: bus?.code ?? busCode,
      source,
      registerId,
      deviceId,
      vehicleId,
      filename,
      originalName: file.name || null,
      filePath,
      mimeType: file.type || "video/mp4",
      sizeBytes: file.size || null,
      metadataPath,
      ...(metadataJson !== undefined ? { metadata: metadataJson } : {}),
      requestMeta,
      receivedAt: received,
    },
    select: {
      id: true,
      filePath: true,
      metadataPath: true,
      receivedAt: true,
      busCode: true,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      id: created.id,
      tenant: tenant.code,
      busCode: created.busCode,
      busMatched: Boolean(bus),
      filePath: created.filePath,
      metadataPath: created.metadataPath,
      videoUrl: `/api/uploads/${created.filePath}`,
      receivedAt: created.receivedAt,
    },
    { status: 201 }
  );
}
