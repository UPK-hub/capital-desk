/**
 * Carga el .env del proyecto en process.env.
 *
 * Los scripts que corren con tsx fuera de Next no reciben el .env
 * automaticamente, y el proyecto no tiene dotenv instalado. Este cargador no
 * depende de nada y NO pisa una variable que ya venga del entorno.
 *
 * Importarlo ANTES que cualquier modulo que lea process.env en su nivel
 * superior: los imports de ES se evaluan en orden.
 *
 *   import "./cargar-env";
 *   import { ... } from "../src/lib/onedrive/config";
 */

import fs from "node:fs";
import path from "node:path";

function cargar(archivo: string) {
  if (!fs.existsSync(archivo)) return;
  const contenido = fs.readFileSync(archivo, "utf8");
  for (const linea of contenido.split(/\r?\n/)) {
    const t = linea.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const clave = t.slice(0, i).trim();
    if (!clave || process.env[clave] !== undefined) continue;
    let valor = t.slice(i + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    process.env[clave] = valor;
  }
}

cargar(path.join(process.cwd(), ".env"));
cargar(path.join(process.cwd(), ".env.local"));
