export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, StsTelemetryKind } from "@prisma/client";
import { canStsWrite } from "@/lib/sts/access";
import { applyTelemetryKpisForTenant } from "@/lib/sts/telemetry-kpi";
import * as XLSX from "xlsx";

function parseSheet(workbook: XLSX.WorkBook, name: string) {
  const sheet = workbook.Sheets[name];
  if (!sheet) return null;
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }) as Array<Array<unknown>>;
}

function detectPeriod(rows: Array<Array<unknown>>) {
  const raw = rows.flat().find((v) => typeof v === "string" && /\d{2}\/\d{2}\/\d{4}/.test(v));
  if (!raw || typeof raw !== "string") return { periodStart: null, periodEnd: null };
  const [day, month, year] = raw.split("/").map((n) => Number(n));
  if (!day || !month || !year) return { periodStart: null, periodEnd: null };
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return { periodStart: start, periodEnd: end };
}

function normalizeRows(rows: Array<Array<unknown>>) {
  return rows.map((row) => row.map((cell) => (cell === undefined ? "" : cell)));
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = session.user.role as Role;
  const caps = (session.user as any).capabilities as string[] | undefined;
  if (!canStsWrite(role, caps)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const tenantId = (session.user as any).tenantId as string;
  const form = await request.formData();
  const file = form.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { cellDates: true });

  const tramas = parseSheet(workbook, "Tramas");
  const alarmas = parseSheet(workbook, "Alarmas");
  const panic = parseSheet(workbook, "Boton_panico");
  const eventos = parseSheet(workbook, "Eventos");

  const entries: Array<{
    kind: StsTelemetryKind;
    payload: unknown;
    periodStart: Date | null;
    periodEnd: Date | null;
  }> = [];

  if (tramas) {
    const { periodStart, periodEnd } = detectPeriod(tramas);
    entries.push({
      kind: StsTelemetryKind.TRAMAS,
      payload: { rows: normalizeRows(tramas) },
      periodStart,
      periodEnd,
    });
  }
  if (alarmas) {
    entries.push({
      kind: StsTelemetryKind.ALARMAS,
      payload: { rows: normalizeRows(alarmas) },
      periodStart: null,
      periodEnd: null,
    });
  }
  if (panic) {
    entries.push({
      kind: StsTelemetryKind.PANIC,
      payload: { rows: normalizeRows(panic) },
      periodStart: null,
      periodEnd: null,
    });
  }
  if (eventos) {
    entries.push({
      kind: StsTelemetryKind.EVENTOS,
      payload: { rows: normalizeRows(eventos) },
      periodStart: null,
      periodEnd: null,
    });
  }

  if (!entries.length) {
    return NextResponse.json({ error: "El archivo no contiene hojas válidas" }, { status: 400 });
  }

  await prisma.$transaction(
    entries.map((entry) =>
      prisma.stsTelemetryEntry.create({
        data: {
          tenantId,
          kind: entry.kind,
          periodStart: entry.periodStart,
          periodEnd: entry.periodEnd,
          payload: entry.payload,
          sourceFilename: file.name ?? "telemetry.xlsx",
        },
      })
    )
  );

  await applyTelemetryKpisForTenant(tenantId);

  return NextResponse.json({ ok: true, imported: entries.length });
}
