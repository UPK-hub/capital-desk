export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Role } from "@prisma/client";
import { canStsRead } from "@/lib/sts/access";
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";

type MonthlySummary = {
  month: string;
  files: string[];
  tramasAvgEfficiency: number | null;
  alarmasTotal: number | null;
  panicTotal: number | null;
  eventosTotal: number | null;
};

function monthKeyFromName(file: string) {
  const name = file.toLowerCase();
  const monthMap: Array<[RegExp, string]> = [
    [/enero|january|\bjan\b/i, "Enero"],
    [/febrero|february|\bfeb\b/i, "Febrero"],
    [/marzo|march|\bmar\b/i, "Marzo"],
    [/abril|april|\bapr\b/i, "Abril"],
    [/mayo|\bmay\b/i, "Mayo"],
    [/junio|june|\bjun\b/i, "Junio"],
    [/julio|july|\bjul\b/i, "Julio"],
    [/agosto|august|\baug\b/i, "Agosto"],
    [/septiembre|setiembre|september|\bsep\b/i, "Septiembre"],
    [/octubre|october|\boct\b/i, "Octubre"],
    [/noviembre|november|\bnov\b/i, "Noviembre"],
    [/diciembre|december|\bdec\b/i, "Diciembre"],
  ];
  for (const [rx, label] of monthMap) {
    if (rx.test(name)) return label;
  }
  return "Mes";
}

function safeNumber(v: unknown) {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function readSheetRows(filePath: string) {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const first = wb.SheetNames[0];
  const ws = wb.Sheets[first];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as Array<Array<unknown>>;
}

function summarizeTramas(filePath: string) {
  const rows = readSheetRows(filePath);
  const headerIdx = rows.findIndex((r) => String(r?.[1] ?? "").toLowerCase().includes("veh"));
  if (headerIdx === -1) return null;
  const data = rows.slice(headerIdx + 1).filter((r) => String(r?.[1] ?? "").startsWith("K"));
  const effIdx = rows[headerIdx].findIndex((c) => String(c).toLowerCase().includes("eficiencia"));
  if (effIdx === -1) return null;
  const values = data.map((r) => safeNumber(r[effIdx])).filter((n): n is number => n !== null);
  if (!values.length) return null;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.round(avg * 100) / 100;
}

function summarizeAlarmas(filePath: string) {
  const rows = readSheetRows(filePath);
  const headerIdx = rows.findIndex((r) => String(r?.[0] ?? "").toLowerCase().includes("veh"));
  if (headerIdx === -1) return null;
  const totalIdx = rows[headerIdx - 1]?.findIndex?.((c: unknown) => String(c).toLowerCase().includes("total")) ?? -1;
  if (totalIdx === -1) return null;
  const data = rows.slice(headerIdx + 1).filter((r) => String(r?.[0] ?? "").startsWith("K"));
  const totals = data.map((r) => safeNumber(r[totalIdx])).filter((n): n is number => n !== null);
  if (!totals.length) return null;
  return Math.round(totals.reduce((a, b) => a + b, 0));
}

function summarizeSimpleTotalBySecondCol(filePath: string) {
  const rows = readSheetRows(filePath);
  const headerIdx = rows.findIndex((r) => String(r?.[0] ?? "").toLowerCase().includes("veh"));
  if (headerIdx === -1) return null;
  const data = rows.slice(headerIdx + 1).filter((r) => String(r?.[0] ?? "").startsWith("K"));
  const values = data.map((r) => safeNumber(r[1])).filter((n): n is number => n !== null);
  if (!values.length) return null;
  return Math.round(values.reduce((a, b) => a + b, 0));
}

function loadMonthlySummaries(): MonthlySummary[] {
  const dir = path.join(process.cwd(), "Excels");
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".xls") || f.endsWith(".xlsx"));

  const byMonth = new Map<string, MonthlySummary>();

  for (const file of files) {
    const full = path.join(dir, file);
    const month = monthKeyFromName(file);
    const row =
      byMonth.get(month) ??
      {
        month,
        files: [],
        tramasAvgEfficiency: null,
        alarmasTotal: null,
        panicTotal: null,
        eventosTotal: null,
      };

    row.files.push(file);

    const lower = file.toLowerCase();
    try {
      if (lower.includes("tramas")) {
        row.tramasAvgEfficiency = summarizeTramas(full);
      } else if (lower.includes("alarmas")) {
        row.alarmasTotal = summarizeAlarmas(full);
      } else if (lower.includes("bot") || lower.includes("pnico") || lower.includes("panico")) {
        row.panicTotal = summarizeSimpleTotalBySecondCol(full);
      } else if (lower.includes("eventos")) {
        row.eventosTotal = summarizeSimpleTotalBySecondCol(full);
      }
    } catch {
      // Ignorar archivos que fallen para no romper la exportación.
    }

    byMonth.set(month, row);
  }

  return Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month, "es"));
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = session.user.role as Role;
  const caps = (session.user as any).capabilities as string[] | undefined;
  if (!canStsRead(role, caps)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const monthFilter = (req.nextUrl.searchParams.get("month") ?? "").trim().toLowerCase();

  let summaries = loadMonthlySummaries();
  if (monthFilter) {
    summaries = summaries.filter((s) => s.month.toLowerCase().includes(monthFilter));
  }

  if (!summaries.length) {
    return NextResponse.json({ error: "No hay datos mensuales para exportar" }, { status: 404 });
  }

  const rows = summaries.map((s) => ({
    mes: s.month,
    tramas_eficiencia_promedio: s.tramasAvgEfficiency,
    alarmas_total: s.alarmasTotal,
    boton_panico_total: s.panicTotal,
    eventos_total: s.eventosTotal,
    archivos: s.files.join(", "),
  }));

  const sheet = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "mensual");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const suffix = monthFilter ? `_${monthFilter}` : "";
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=\"sts_entregables_mensuales${suffix}.xlsx\"`,
    },
  });
}
