/**
 * Proceso continuo que replica al OneDrive del cliente los videos cargados en
 * las solicitudes de descarga.
 *
 * Se levanta con PM2 como "onedrive-sync". Si ONEDRIVE_SYNC_ENABLED no esta en
 * "true", o faltan variables, se queda dormido sin hacer nada y lo avisa en el
 * log una sola vez.
 *
 *   npm run onedrive:sync            (una pasada, util para probar)
 *   npm run onedrive:sync -- --loop  (modo continuo, el que usa PM2)
 */

import "./cargar-env";
import { prisma } from "@/lib/prisma";
import {
  ONEDRIVE_BACKFILL_VENTANA,
  ONEDRIVE_BATCH_SIZE,
  ONEDRIVE_DIAS_RECIENTE,
  ONEDRIVE_IDLE_MS,
  ONEDRIVE_SYNC_ENABLED,
  onedriveConfigError,
  onedriveConfigured,
} from "@/lib/onedrive/config";
import { procesarPendientes, resumenCola } from "@/lib/onedrive/sync";

const LOOP = process.argv.includes("--loop");

function log(...args: unknown[]) {
  console.log(new Date().toISOString(), "[onedrive-sync]", ...args);
}

function dormir(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function unaPasada() {
  const r = await procesarPendientes(ONEDRIVE_BATCH_SIZE);
  if (r.tomados > 0) {
    log(`tomados ${r.tomados}, replicados ${r.replicados}, fallidos ${r.fallidos}`);
  }
  return r;
}

async function main() {
  if (!ONEDRIVE_SYNC_ENABLED) {
    log("ONEDRIVE_SYNC_ENABLED no esta en true: el modulo queda inactivo.");
    if (!LOOP) return;
  }

  const problema = onedriveConfigError();
  if (ONEDRIVE_SYNC_ENABLED && problema) {
    log("CONFIGURACION INCOMPLETA:", problema);
    if (!LOOP) return;
  }

  if (!LOOP) {
    const resumen = await resumenCola();
    log("estado de la cola:", JSON.stringify(resumen));
    await unaPasada();
    return;
  }

  log(`arrancando en modo continuo, lote ${ONEDRIVE_BATCH_SIZE}, descanso ${ONEDRIVE_IDLE_MS} ms`);
  log(
    `material reciente (ultimos ${ONEDRIVE_DIAS_RECIENTE} dias): sube a cualquier hora. ` +
      `Material viejo: solo en la ventana ${ONEDRIVE_BACKFILL_VENTANA} hora Bogota.`
  );

  // Bucle adaptativo: si hubo trabajo sigue de una, si no descansa.
  for (;;) {
    try {
      if (ONEDRIVE_SYNC_ENABLED && onedriveConfigured()) {
        const r = await unaPasada();
        if (r.tomados > 0) {
          await dormir(1000);
          continue;
        }
      }
    } catch (error) {
      log("ERROR en la pasada:", String((error as any)?.message ?? error));
    }
    await dormir(ONEDRIVE_IDLE_MS);
  }
}

main()
  .catch((e) => {
    log("FALLO:", String(e?.message ?? e));
    process.exitCode = 1;
  })
  .finally(async () => {
    if (!LOOP) await prisma.$disconnect();
  });
