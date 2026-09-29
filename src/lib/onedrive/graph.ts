/**
 * Cliente mínimo de Microsoft Graph para subir archivos al OneDrive del cliente.
 *
 * Autenticación de aplicación (client credentials), sin usuario firmado.
 * Sube por PUT directo los archivos pequeños y por sesión de carga
 * reanudable los videos, que es lo normal en este módulo.
 */

import fs from "node:fs/promises";
import {
  GRAPH_CLIENT_ID,
  GRAPH_CLIENT_SECRET,
  GRAPH_TENANT_ID,
  ONEDRIVE_CHUNK_BYTES,
  ONEDRIVE_DRIVE_ID,
  ONEDRIVE_SIMPLE_MAX_BYTES,
} from "./config";

const GRAPH = "https://graph.microsoft.com/v1.0";

type TokenCache = { token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

export class GraphError extends Error {
  status: number;
  retriable: boolean;
  constructor(message: string, status: number, retriable: boolean) {
    super(message);
    this.name = "GraphError";
    this.status = status;
    this.retriable = retriable;
  }
}

const RETRIABLES = new Set([408, 429, 500, 502, 503, 504]);

function esRetriable(status: number) {
  return RETRIABLES.has(status);
}

export async function getAccessToken(forzar = false): Promise<string> {
  const ahora = Date.now();
  if (!forzar && tokenCache && tokenCache.expiresAt > ahora + 60_000) return tokenCache.token;

  const body = new URLSearchParams({
    client_id: GRAPH_CLIENT_ID,
    client_secret: GRAPH_CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(`https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json?.access_token) {
    const detalle = String(json?.error_description ?? json?.error ?? "sin detalle").slice(0, 300);
    throw new GraphError(`No se pudo obtener el token (${res.status}): ${detalle}`, res.status, esRetriable(res.status));
  }

  tokenCache = {
    token: String(json.access_token),
    expiresAt: ahora + Number(json.expires_in ?? 3600) * 1000,
  };
  return tokenCache.token;
}

function dormir(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Petición a Graph con reintentos internos: respeta Retry-After en 429/503 y
 * renueva el token una vez ante un 401.
 */
async function graphFetch(url: string, init: RequestInit, intentos = 4): Promise<Response> {
  let ultimoError: unknown = null;

  for (let i = 1; i <= intentos; i++) {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (error) {
      ultimoError = error;
      if (i === intentos) break;
      await dormir(2000 * i);
      continue;
    }

    if (res.ok) return res;

    if (res.status === 401 && i === 1) {
      const token = await getAccessToken(true);
      init = {
        ...init,
        headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
      };
      continue;
    }

    if (esRetriable(res.status) && i < intentos) {
      const retryAfter = Number(res.headers.get("retry-after") ?? 0);
      await dormir(retryAfter > 0 ? retryAfter * 1000 : 2000 * i);
      continue;
    }

    const texto = await res.text().catch(() => "");
    throw new GraphError(
      `Graph ${res.status} en ${url.split("?")[0]}: ${texto.slice(0, 300)}`,
      res.status,
      esRetriable(res.status)
    );
  }

  throw new GraphError(
    `Sin respuesta de Graph tras ${intentos} intentos: ${String((ultimoError as any)?.message ?? ultimoError)}`,
    0,
    true
  );
}

/** Codifica cada segmento de la ruta sin tocar las barras. */
export function encodeDrivePath(ruta: string): string {
  return ruta
    .split("/")
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join("/");
}

/** Limpia un nombre de carpeta o archivo de los caracteres que SharePoint rechaza. */
export function limpiarNombre(nombre: string): string {
  return String(nombre ?? "")
    .replace(/[\\/:*?"<>|#%]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[. ]+|[. ]+$/g, "")
    .slice(0, 120)
    .trim() || "sin-nombre";
}

export type ArchivoSubido = {
  id: string;
  name: string;
  size: number;
  webUrl: string;
};

type InfoDrive = {
  name: string;
  quota: { total: number; used: number; remaining: number };
};

// La cuota cambia despacio y la pantalla de replica se abre seguido:
// se cachea un minuto para no pedirsela a Graph en cada render.
let driveCache: { valor: InfoDrive; expiraEn: number } | null = null;

export async function leerDrive(): Promise<InfoDrive> {
  const ahora = Date.now();
  if (driveCache && driveCache.expiraEn > ahora) return driveCache.valor;

  const token = await getAccessToken();
  const res = await graphFetch(`${GRAPH}/drives/${ONEDRIVE_DRIVE_ID}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  const valor = (await res.json()) as InfoDrive;
  driveCache = { valor, expiraEn: ahora + 60_000 };
  return valor;
}

async function subirDirecto(rutaRemota: string, contenido: Buffer, mimeType: string): Promise<ArchivoSubido> {
  const token = await getAccessToken();
  const url = `${GRAPH}/drives/${ONEDRIVE_DRIVE_ID}/root:/${encodeDrivePath(rutaRemota)}:/content?@microsoft.graph.conflictBehavior=replace`;
  const res = await graphFetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": mimeType || "application/octet-stream" },
    body: contenido,
  });
  return (await res.json()) as ArchivoSubido;
}

async function subirPorSesion(rutaRemota: string, rutaLocal: string, tamano: number): Promise<ArchivoSubido> {
  const token = await getAccessToken();

  const sesionRes = await graphFetch(
    `${GRAPH}/drives/${ONEDRIVE_DRIVE_ID}/root:/${encodeDrivePath(rutaRemota)}:/createUploadSession`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        item: { "@microsoft.graph.conflictBehavior": "replace" },
        deferCommit: false,
      }),
    }
  );

  const sesion = (await sesionRes.json()) as { uploadUrl: string };
  if (!sesion?.uploadUrl) throw new GraphError("Graph no devolvió uploadUrl", 0, true);

  const handle = await fs.open(rutaLocal, "r");
  try {
    let offset = 0;
    let resultado: ArchivoSubido | null = null;

    while (offset < tamano) {
      const largo = Math.min(ONEDRIVE_CHUNK_BYTES, tamano - offset);
      const buffer = Buffer.alloc(largo);
      await handle.read(buffer, 0, largo, offset);

      // La uploadUrl viene preautorizada: no lleva Authorization.
      const res = await graphFetch(sesion.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Length": String(largo),
          "Content-Range": `bytes ${offset}-${offset + largo - 1}/${tamano}`,
        },
        body: buffer,
      });

      if (res.status === 201 || res.status === 200) {
        resultado = (await res.json()) as ArchivoSubido;
      }
      offset += largo;
    }

    if (!resultado) throw new GraphError("La sesión de carga terminó sin confirmar el archivo", 0, true);
    return resultado;
  } finally {
    await handle.close();
  }
}

/**
 * Sube un archivo local a una ruta dentro del drive.
 * Graph crea solo las carpetas intermedias que falten.
 */
export async function subirArchivo(opciones: {
  rutaRemota: string;
  rutaLocal: string;
  tamano: number;
  mimeType?: string | null;
}): Promise<ArchivoSubido> {
  const { rutaRemota, rutaLocal, tamano } = opciones;
  const mimeType = opciones.mimeType || "application/octet-stream";

  if (tamano <= ONEDRIVE_SIMPLE_MAX_BYTES) {
    const contenido = await fs.readFile(rutaLocal);
    return subirDirecto(rutaRemota, contenido, mimeType);
  }
  return subirPorSesion(rutaRemota, rutaLocal, tamano);
}

/** Borra un elemento por id. Solo se usa en la prueba de conexión. */
export async function borrarItem(itemId: string): Promise<void> {
  const token = await getAccessToken();
  await graphFetch(`${GRAPH}/drives/${ONEDRIVE_DRIVE_ID}/items/${itemId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}
