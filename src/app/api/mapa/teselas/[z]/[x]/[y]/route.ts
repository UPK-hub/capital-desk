import { cacheSegundos, leerTesela } from "@/lib/mapa/pmtiles";

/**
 * Sirve una tesela vectorial del mapa base propio.
 *
 * El navegador pide /api/mapa/teselas/{z}/{x}/{y}.mvt y aqui se responde con el
 * rango de bytes correspondiente del archivo PMTiles local. Si la tesela no esta
 * en el archivo (fuera del recuadro de Bogota) se responde 204 sin cuerpo: el
 * renderizador lo interpreta como "aqui no hay nada que dibujar", que es lo
 * correcto, y no como un error.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ZOOM_MAXIMO = 20;

export async function GET(
  _req: Request,
  { params }: { params: { z: string; x: string; y: string } }
) {
  const z = Number.parseInt(params.z, 10);
  const x = Number.parseInt(params.x, 10);
  const y = Number.parseInt(params.y.replace(/\.(mvt|pbf)$/i, ""), 10);

  const valido =
    Number.isInteger(z) &&
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    z >= 0 &&
    z <= ZOOM_MAXIMO &&
    x >= 0 &&
    y >= 0 &&
    x < 2 ** z &&
    y < 2 ** z;

  if (!valido) {
    return new Response("Coordenada de tesela invalida", { status: 400 });
  }

  const cache = `private, max-age=${cacheSegundos()}, immutable`;

  try {
    const tesela = await leerTesela(z, x, y);
    if (!tesela) {
      return new Response(null, { status: 204, headers: { "Cache-Control": cache } });
    }
    return new Response(new Uint8Array(tesela), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.mapbox-vector-tile",
        "Cache-Control": cache,
        "Content-Length": String(tesela.byteLength),
      },
    });
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    // Si falta el archivo no tiene sentido llenar el log con una linea por
    // tesela: la pantalla ya avisa con /api/mapa/estado.
    if (err?.code !== "ENOENT") {
      console.error("[mapa] no se pudo leer la tesela", { z, x, y, error: err?.message });
    }
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }
}
