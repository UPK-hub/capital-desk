/**
 * Diagnostico de SOLO LECTURA: muestra el payload completo de alarmas reales,
 * para identificar como viene la velocidad y demas valores de medida.
 *
 *   npm run alarmas:inspect              una de cada tipo de alarma
 *   npm run alarmas:inspect -- ALA3      solo exceso de velocidad
 */

import "./cargar-env";
import { prisma } from "@/lib/prisma";
import { ALARM_CATALOG } from "@/lib/telemetry/catalog";

const SOLO = process.argv.slice(2).find((a) => /^ALA\d$/i.test(a))?.toUpperCase() ?? null;

function aplanar(obj: unknown, prefijo = "", salida: Record<string, unknown> = {}) {
  if (!obj || typeof obj !== "object") return salida;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const clave = prefijo ? `${prefijo}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) aplanar(v, clave, salida);
    else salida[clave] = Array.isArray(v) ? `[array de ${v.length}]` : v;
  }
  return salida;
}

async function main() {
  const tenant = await prisma.tenant.findFirst({ select: { id: true, code: true } });
  if (!tenant) {
    console.log("No hay tenant.");
    return;
  }

  const codigos = SOLO ? [SOLO] : ALARM_CATALOG.map((a) => a.code);

  for (const code of codigos) {
    const fila = await prisma.integrationInboundEvent.findFirst({
      where: { tenantId: tenant.id, kind: "ALARMAS", alarmCode: code },
      orderBy: { eventAt: "desc" },
      select: {
        busCode: true,
        eventAt: true,
        alarmCode: true,
        alarmLabel: true,
        alarmLevelCode: true,
        alarmLevelLabel: true,
        payload: true,
      },
    });

    const etiqueta = ALARM_CATALOG.find((a) => a.code === code)?.label ?? code;
    console.log(`\n${"=".repeat(70)}`);
    console.log(`${code} · ${etiqueta}`);
    console.log("=".repeat(70));

    if (!fila) {
      console.log("Sin registros de esta alarma.");
      continue;
    }

    console.log(`Bus: ${fila.busCode}   Fecha: ${fila.eventAt?.toISOString() ?? "-"}`);
    console.log(`Nivel: ${fila.alarmLevelCode ?? "-"} ${fila.alarmLevelLabel ?? ""}`);
    console.log("\nCampos del payload (ruta = valor):\n");

    const plano = aplanar(fila.payload);
    const claves = Object.keys(plano).sort();
    for (const k of claves) {
      const v = String(plano[k] ?? "");
      console.log(`  ${k.padEnd(44)} ${v.length > 60 ? `${v.slice(0, 60)}…` : v}`);
    }
  }

  console.log("\nListo. Copia esta salida para ajustar la lectura de la velocidad.\n");
}

main()
  .catch((e) => {
    console.error("FALLO:", e?.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
