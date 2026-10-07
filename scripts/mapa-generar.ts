/**
 * Genera el mapa base propio: recorta el recuadro de Bogota del planeta de
 * Protomaps y lo deja en un unico archivo PMTiles en el disco del servidor.
 *
 *   npm run mapa:generar
 *   npm run mapa:generar -- --fecha=20261001
 *   npm run mapa:generar -- --bbox=-74.40,4.30,-73.90,5.00
 *
 * No descarga el planeta completo: la herramienta pmtiles pide por rangos HTTP
 * solo los bytes del recuadro, asi que la transferencia es de unos pocos
 * cientos de MB y el archivo final pesa decenas de MB.
 *
 * Requiere el binario pmtiles (un solo ejecutable, sin instalador):
 *   https://github.com/protomaps/go-pmtiles/releases
 * Dejarlo en tools\pmtiles.exe dentro del proyecto, o en el PATH, o apuntarlo
 * con MAPA_PMTILES_BIN en el .env.
 *
 * Los datos son de OpenStreetMap bajo licencia ODbL: el credito tiene que
 * quedar visible en el mapa, y ya va en la atribucion de la pantalla.
 */

import "./cargar-env";
import { spawnSync } from "node:child_process";
import { accessSync, constants, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { rutaArchivo } from "@/lib/mapa/pmtiles";

/** Bogota urbana mas la sabana: Soacha, Chia, Cota, Funza, Mosquera, Madrid y La Calera. */
const BBOX_POR_DEFECTO = "-74.40,4.30,-73.90,5.00";
const BASE_PLANETA = "https://build.protomaps.com";
const DIAS_A_PROBAR = 14;

function argumento(nombre: string): string | undefined {
  const pref = `--${nombre}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : undefined;
}

function mb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function validarBbox(bbox: string) {
  const partes = bbox.split(",").map((p) => Number(p.trim()));
  if (partes.length !== 4 || partes.some((n) => !Number.isFinite(n))) {
    throw new Error(`El bbox debe ser minLon,minLat,maxLon,maxLat. Recibido: ${bbox}`);
  }
  const [minLon, minLat, maxLon, maxLat] = partes;
  if (minLon >= maxLon || minLat >= maxLat) {
    throw new Error(`El bbox esta invertido: ${bbox}`);
  }
  return partes as [number, number, number, number];
}

/** Busca el ejecutable pmtiles sin obligar a instalarlo en el sistema. */
function binario(): string {
  const env = process.env.MAPA_PMTILES_BIN?.trim();
  if (env) {
    accessSync(env, constants.X_OK | constants.F_OK);
    return env;
  }

  const candidatos = [
    path.join(process.cwd(), "tools", "pmtiles.exe"),
    path.join(process.cwd(), "tools", "pmtiles"),
  ];
  for (const c of candidatos) {
    try {
      accessSync(c, constants.F_OK);
      return c;
    } catch {
      // seguimos probando
    }
  }

  // Ultimo recurso: que este en el PATH.
  const prueba = spawnSync("pmtiles", ["version"], { encoding: "utf8" });
  if (prueba.status === 0) return "pmtiles";

  throw new Error(
    "No se encontro el ejecutable pmtiles.\n" +
      "Descargalo de https://github.com/protomaps/go-pmtiles/releases (archivo Windows x86_64),\n" +
      `descomprimelo y deja pmtiles.exe en ${path.join(process.cwd(), "tools")}.`
  );
}

/**
 * El planeta se publica por fecha. Probamos hacia atras desde hoy hasta
 * encontrar una compilacion publicada, para no tener que fijar la fecha a mano.
 */
async function ultimaFecha(): Promise<string> {
  const fija = argumento("fecha");
  if (fija) return fija;

  const hoy = new Date();
  for (let i = 0; i < DIAS_A_PROBAR; i++) {
    const d = new Date(hoy.getTime() - i * 86_400_000);
    const etiqueta = [
      d.getUTCFullYear(),
      String(d.getUTCMonth() + 1).padStart(2, "0"),
      String(d.getUTCDate()).padStart(2, "0"),
    ].join("");
    const url = `${BASE_PLANETA}/${etiqueta}.pmtiles`;
    try {
      const r = await fetch(url, { method: "HEAD" });
      if (r.ok) return etiqueta;
    } catch {
      // red intermitente: seguimos con la fecha anterior
    }
  }
  throw new Error(
    `No se encontro ninguna compilacion publicada en los ultimos ${DIAS_A_PROBAR} dias.\n` +
      "Revisa la salida a internet del servidor o mira las fechas disponibles en https://maps.protomaps.com/builds/ " +
      "y pasala con --fecha=YYYYMMDD."
  );
}

async function main() {
  const bbox = argumento("bbox") ?? process.env.MAPA_BBOX?.trim() ?? BBOX_POR_DEFECTO;
  const [minLon, minLat, maxLon, maxLat] = validarBbox(bbox);

  const destino = rutaArchivo();
  const carpeta = path.dirname(destino);
  mkdirSync(carpeta, { recursive: true });

  // Se escribe a un temporal y al final se renombra: mientras se genera, la app
  // sigue sirviendo el archivo anterior sin interrupcion.
  const temporal = `${destino}.nuevo`;
  rmSync(temporal, { force: true });

  const bin = binario();
  const fecha = await ultimaFecha();
  const origen = `${BASE_PLANETA}/${fecha}.pmtiles`;

  console.log("\nGenerando el mapa base propio\n");
  console.log(`  Compilacion   ${fecha}`);
  console.log(`  Recuadro      ${minLon},${minLat} a ${maxLon},${maxLat}`);
  console.log(`  Destino       ${destino}`);
  console.log(`  Herramienta   ${bin}`);
  console.log("\nEsto tarda unos minutos y descarga solo el recuadro.\n");

  const r = spawnSync(bin, ["extract", origen, temporal, `--bbox=${bbox}`], {
    stdio: "inherit",
  });

  if (r.error) throw r.error;
  if (r.status !== 0) {
    rmSync(temporal, { force: true });
    throw new Error(`La herramienta pmtiles termino con codigo ${r.status}.`);
  }

  const info = statSync(temporal);
  if (info.size < 1024) {
    rmSync(temporal, { force: true });
    throw new Error("El archivo generado quedo vacio. Revisa el recuadro y la fecha.");
  }

  renameSync(temporal, destino);

  console.log(`\nListo. ${destino} (${mb(info.size)})`);
  console.log("Verificalo con: npm run mapa:verificar");
  console.log("El mapa queda activo al instante; no hace falta reiniciar la app.\n");
}

main().catch((e) => {
  console.error(`\n${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
