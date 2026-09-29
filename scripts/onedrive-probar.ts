/**
 * Prueba de conexion con el OneDrive del cliente.
 *
 *   npm run onedrive:probar
 *
 * Valida, en orden: variables del .env, token de aplicacion, lectura del drive
 * con su cuota, subida de un archivo pequeno a una carpeta TEST y borrado del
 * mismo. No toca ningun dato de la mesa.
 */

import "./cargar-env";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  ONEDRIVE_ROOT_FOLDER,
  ONEDRIVE_SYNC_ENABLED,
  onedriveConfigError,
} from "@/lib/onedrive/config";
import { borrarItem, getAccessToken, leerDrive, subirArchivo } from "@/lib/onedrive/graph";

function ok(msg: string) {
  console.log("  OK   " + msg);
}
function mal(msg: string) {
  console.log("  FALLA " + msg);
}

async function main() {
  console.log("\nPrueba de conexion con OneDrive\n");

  const problema = onedriveConfigError();
  if (problema) {
    mal(problema);
    process.exitCode = 1;
    return;
  }
  ok("variables del .env completas");
  console.log(`       ONEDRIVE_SYNC_ENABLED = ${ONEDRIVE_SYNC_ENABLED}`);

  try {
    await getAccessToken(true);
    ok("token de aplicacion obtenido");
  } catch (e: any) {
    mal(`token: ${e?.message ?? e}`);
    process.exitCode = 1;
    return;
  }

  let libresGB = 0;
  try {
    const d = await leerDrive();
    libresGB = d.quota.remaining / 1024 ** 3;
    ok(`drive accesible: ${d.name}, libres ${libresGB.toFixed(1)} GB de ${(d.quota.total / 1024 ** 3).toFixed(1)} GB`);
  } catch (e: any) {
    mal(`lectura del drive: ${e?.message ?? e}`);
    process.exitCode = 1;
    return;
  }

  const tmp = path.join(os.tmpdir(), `capital-desk-prueba-${Date.now()}.txt`);
  await fs.writeFile(tmp, `Prueba de Capital Desk ${new Date().toISOString()}\n`, "utf8");
  const stat = await fs.stat(tmp);

  try {
    const subido = await subirArchivo({
      rutaRemota: `${ONEDRIVE_ROOT_FOLDER}/TEST/${path.basename(tmp)}`,
      rutaLocal: tmp,
      tamano: stat.size,
      mimeType: "text/plain",
    });
    ok(`escritura: ${subido.name}, ${subido.size} bytes`);
    console.log(`       ${subido.webUrl}`);

    await borrarItem(subido.id);
    ok("borrado del archivo de prueba");
  } catch (e: any) {
    mal(`escritura: ${e?.message ?? e}`);
    process.exitCode = 1;
    return;
  } finally {
    await fs.unlink(tmp).catch(() => {});
  }

  const meses = libresGB > 0 ? libresGB / 400 : 0;
  console.log(`\nTodo listo. Al ritmo actual (unos 400 GB al mes) el espacio alcanza para ~${meses.toFixed(0)} meses.\n`);
}

main().catch((e) => {
  console.error("FALLO:", e?.message ?? e);
  process.exitCode = 1;
});
