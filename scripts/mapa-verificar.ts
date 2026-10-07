/**
 * Verifica el mapa base propio de punta a punta, sin navegador.
 *
 *   npm run mapa:verificar
 *
 * Lee la cabecera del archivo PMTiles (cobertura, zooms, numero de teselas) y
 * saca de verdad una tesela sobre el centro de Bogota. Si imprime bytes, el
 * archivo sirve y la pantalla del mapa va a pintar.
 */

import "./cargar-env";
import { cerrarArchivo, estadoMapa, leerTesela, rutaArchivo } from "@/lib/mapa/pmtiles";

/** Convierte lon/lat a la coordenada de tesela de ese zoom (Web Mercator). */
function aTesela(lon: number, lat: number, z: number): [number, number] {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const rad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return [x, y];
}

function mb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const PUNTOS: Array<{ nombre: string; lon: number; lat: number }> = [
  { nombre: "Centro de Bogota", lon: -74.08175, lat: 4.60971 },
  { nombre: "Autopista Norte, calle 170", lon: -74.0455, lat: 4.7435 },
  { nombre: "Soacha", lon: -74.2168, lat: 4.5794 },
  { nombre: "Medellin (fuera del recuadro)", lon: -75.5636, lat: 6.2518 },
];

async function main() {
  console.log(`\nVerificando ${rutaArchivo()}\n`);

  const estado = await estadoMapa();
  if (!estado.disponible) {
    console.error(`  No disponible: ${estado.motivo}\n`);
    process.exit(1);
  }

  const [minLon, minLat, maxLon, maxLat] = estado.limites;
  console.log(`  Tamano        ${mb(estado.bytes)}`);
  console.log(`  Generado      ${new Date(estado.actualizado).toLocaleString("es-CO")}`);
  console.log(`  Zooms         ${estado.minZoom} a ${estado.maxZoom}`);
  console.log(`  Cobertura     ${minLon.toFixed(4)},${minLat.toFixed(4)} a ${maxLon.toFixed(4)},${maxLat.toFixed(4)}`);
  console.log(`  Teselas       ${new Intl.NumberFormat("es-CO").format(estado.teselas)}`);
  console.log("\n  Lectura de teselas:\n");

  let dentroOk = 0;
  for (const p of PUNTOS) {
    const z = Math.min(estado.maxZoom, 14);
    const [x, y] = aTesela(p.lon, p.lat, z);
    const tesela = await leerTesela(z, x, y);
    const dentro = p.lon >= minLon && p.lon <= maxLon && p.lat >= minLat && p.lat <= maxLat;
    const detalle = tesela ? `${tesela.byteLength} bytes` : "sin datos";
    console.log(`    ${p.nombre.padEnd(32)} z${z}/${x}/${y}  ${detalle}`);
    if (dentro && tesela && tesela.byteLength > 0) dentroOk++;
  }

  await cerrarArchivo();

  if (dentroOk === 0) {
    console.error(
      "\n  El archivo abre pero no devolvio datos en ningun punto de Bogota.\n" +
        "  Regeneralo con npm run mapa:generar y revisa el recuadro.\n"
    );
    process.exit(1);
  }

  console.log("\n  El mapa base responde. Nada mas que hacer.\n");
}

main().catch((e) => {
  console.error(`\n${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
