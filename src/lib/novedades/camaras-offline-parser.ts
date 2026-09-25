/**
 * Lector del reporte de "Cámaras Offline" que envía CapitalBus.
 *
 * El cliente manda un cuadro con una fila por bus y, en una sola celda, la lista
 * de cámaras caídas con su IP:
 *
 *   K1506 | 172.23.22.100 | Camara BV2_1 (172.16.6.9); Camara BV2_2 (172.16.6.10); ...
 *
 * Ese cuadro llega de tres formas: pegado desde Excel o el correo, como archivo
 * .xlsx/.csv, o como pantallazo leído con OCR. Este módulo recibe el texto plano
 * de cualquiera de las tres y devuelve filas estructuradas, tolerando:
 *
 * - celdas que ocupan varias líneas (el caso típico de un bus con 7 cámaras),
 * - separadores distintos (tabulación, punto y coma, varios espacios),
 * - la basura habitual del OCR: llaves en vez de paréntesis, la letra O por el
 *   cero, la l o la I por el uno.
 *
 * Todo lo que no se pueda normalizar con certeza se deja tal cual y se marca con
 * un aviso, para que la pantalla de revisión lo muestre antes de crear tickets.
 */

/** Las 13 cámaras de un bus biarticulado, en la nomenclatura del NVR. */
export const CAMARAS_CANONICAS = [
  "BO",
  "BFE",
  "BTE",
  "BV1_1",
  "BV1_2",
  "BV1_3",
  "BV1_4",
  "BV2_1",
  "BV2_2",
  "BV3_1",
  "BV3_2",
  "BV3_3",
  "BV3_4",
] as const;

export type CamaraOffline = {
  /** Nombre normalizado (BV2_1, BFE...) o el texto original si no se reconoció. */
  name: string;
  /** Texto tal como venía en el reporte. */
  raw: string;
  ip: string | null;
  /** true si el nombre no corresponde a ninguna cámara conocida. */
  desconocida: boolean;
  /** true si se corrigió un nombre casi correcto del OCR (BC -> BO). */
  corregida?: boolean;
  /** true si venía en la misma línea del código del bus. */
  anclada?: boolean;
};

export type FilaReporte = {
  busCode: string;
  busIp: string | null;
  cameras: CamaraOffline[];
  avisos: string[];
};

export type ResultadoParseo = {
  filas: FilaReporte[];
  /** Líneas que no se pudieron interpretar (para mostrarlas en la revisión). */
  ignoradas: string[];
};

const IP_RE = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})/;
const IP_RE_G = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})/g;

/** Normaliza el texto crudo antes de partirlo en líneas. */
function limpiarTexto(input: string): string {
  return String(input ?? "")
    .replace(/\r\n?/g, "\n")
    // El OCR suele leer los paréntesis como llaves o corchetes.
    .replace(/[{\[]/g, "(")
    .replace(/[}\]]/g, ")")
    // Comillas tipográficas y espacios raros.
    .replace(/[   ]/g, " ")
    .replace(/[‘’“”]/g, "'");
}

/** Corrige los confusiones típicas del OCR dentro de algo que parece una IP. */
function corregirIp(token: string): string | null {
  const arreglado = token
    .replace(/[OoQ]/g, "0")
    .replace(/[lI|]/g, "1")
    .replace(/[Ss]/g, "5")
    .replace(/[^0-9.]/g, "");
  const m = IP_RE.exec(arreglado);
  if (!m) return null;
  const octetos = [m[1], m[2], m[3], m[4]].map((x) => Number(x));
  if (octetos.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return octetos.join(".");
}

/** Normaliza el nombre de una cámara contra la lista conocida. */
function distancia(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 1) return 9;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j += 1) d[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return d[m][n];
}

export function normalizarCamara(raw: string): { name: string; desconocida: boolean; corregida?: boolean } {
  let s = String(raw ?? "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[-.]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  // El OCR confunde el 1 con la letra I o L, y el 0 con la O, pero solo en la
  // parte numérica: "BV2_L" es BV2_1, mientras que "BO" sí lleva letra O.
  s = s.replace(/^BV([0-9ILO])_?([0-9ILO])?$/, (_m, a, b) => {
    const num = (c: string) => String(c).replace(/[IL]/g, "1").replace(/O/g, "0");
    return b ? `BV${num(a)}_${num(b)}` : `BV${num(a)}`;
  });

  const exacta = CAMARAS_CANONICAS.find((c) => c === s);
  if (exacta) return { name: exacta, desconocida: false };

  // Tolerancia final: comparar quitando guiones bajos (BV21 -> BV2_1).
  const plano = s.replace(/_/g, "");
  const porPlano = CAMARAS_CANONICAS.find((c) => c.replace(/_/g, "") === plano);
  if (porPlano) return { name: porPlano, desconocida: false };

  // Último intento: un solo carácter de diferencia con una cámara conocida
  // (el OCR lee "BC" donde dice "BO"). Solo vale si la coincidencia es única,
  // y queda marcada para que se vea en la pantalla de revisión.
  const cercanas = CAMARAS_CANONICAS.filter((c) => distancia(plano, c.replace(/_/g, "")) === 1);
  if (cercanas.length === 1) return { name: cercanas[0], desconocida: false, corregida: true };

  return { name: s || raw.trim(), desconocida: true };
}

/** ¿La línea arranca con un código de bus (K1408, KI408, K 1408)? */
function detectarBus(linea: string): { busCode: string; resto: string } | null {
  const m = /^\s*\|?\s*([Kk][\sIl|]?\s*\d{3,5})\b[\s|;,\t]*/.exec(linea);
  if (!m) return null;
  const code = "K" + m[1].replace(/[^0-9]/g, "");
  if (code.length < 4) return null;
  return { busCode: code, resto: linea.slice(m[0].length) };
}

function esEncabezado(linea: string): boolean {
  const s = linea.toLowerCase();
  if (/c[áa]maras?\s+offline/.test(s) && !/c[áa]mara\s+[a-z0-9]/.test(s.replace(/c[áa]maras?\s+offline/, ""))) {
    return true;
  }
  return /^\s*\|?\s*(id|ip)\b/.test(s) && !/c[áa]mara\s/.test(s);
}

/**
 * Extrae las cámaras mencionadas en un fragmento de texto.
 *
 * Dos pasadas:
 *  1. "Camara BV2_1 (172.16.6.9)" — el formato normal del reporte.
 *  2. "BV3_2 (172.16.6.12)" — cuando el salto de línea del pantallazo dejó la
 *     palabra "Camara" en el renglón anterior. Aquí se exige que el código sea
 *     exactamente una de las 13 cámaras conocidas y que traiga IP, para no
 *     confundirlo con cualquier otro texto.
 */
function extraerCamaras(texto: string): CamaraOffline[] {
  const out: CamaraOffline[] = [];
  const vistas = new Set<string>();

  const agregar = (rawName: string, dentro: string | null) => {
    const { name, desconocida, corregida } = normalizarCamara(rawName);
    const ip = dentro ? corregirIp(dentro) : null;
    const clave = `${name}|${ip ?? ""}`;
    if (vistas.has(clave)) return;
    vistas.add(clave);
    out.push({ name, raw: rawName, ip, desconocida, corregida });
  };

  const re = /c[áa]mara\s*:?\s*([A-Za-z0-9_\-.]+)\s*(?:\(([^)]*)\))?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) agregar(m[1], m[2] ?? null);

  const re2 = /\b([A-Za-z]{1,3}[0-9]?[_\- ]?[0-9]?)\s*\(\s*((?:\d{1,3}\.){3}\d{1,3})\s*\)/g;
  let m2: RegExpExecArray | null;
  while ((m2 = re2.exec(texto)) !== null) {
    const { name, desconocida, corregida } = normalizarCamara(m2[1]);
    if (desconocida || corregida) continue; // en esta pasada solo nombres exactos
    agregar(m2[1], m2[2]);
  }

  return out;
}

/** Primera IP de la línea que NO esté dentro de un paréntesis: la IP del bus. */
function extraerIpDelBus(texto: string): string | null {
  const sinParentesis = texto.replace(/\([^)]*\)/g, " ");
  const antesDeCamara = sinParentesis.split(/c[áa]mara/i)[0] ?? sinParentesis;
  IP_RE_G.lastIndex = 0;
  const m = IP_RE_G.exec(antesDeCamara);
  if (!m) return null;
  return corregirIp(m[0]);
}

/** Subred /24 de una IP (172.16.6.9 -> 172.16.6). */
function subred(ip: string | null): string | null {
  if (!ip) return null;
  const partes = ip.split(".");
  return partes.length === 4 ? partes.slice(0, 3).join(".") : null;
}

/** Subred predominante entre las cámaras que venían pegadas al código del bus. */
function subredAnclada(cams: CamaraOffline[]): string | null {
  const conteo = new Map<string, number>();
  for (const c of cams) {
    if (!c.anclada) continue;
    const s = subred(c.ip);
    if (!s) continue;
    conteo.set(s, (conteo.get(s) ?? 0) + 1);
  }
  let mejor: string | null = null;
  let max = 0;
  for (const [s, n] of conteo) {
    if (n > max) {
      mejor = s;
      max = n;
    }
  }
  return mejor;
}

/**
 * Convierte el texto del reporte en filas de bus + cámaras.
 *
 * Arma bloques: cada bloque empieza en la línea que trae el código del bus y se
 * lleva las líneas siguientes que no traen código, con lo que se reconstruyen
 * las celdas partidas en varios renglones.
 *
 * En los pantallazos hay un caso extra: cuando la celda ocupa varias líneas, el
 * código del bus queda centrado verticalmente, así que sus primeras cámaras se
 * leen ANTES del código y se pegarían al bus anterior. Eso se corrige después
 * con la subred de las IPs: las cámaras de un bus viven todas en la misma /24,
 * así que una cámara que no pertenece a la subred de su bus y sí a la del bus
 * siguiente se reasigna a ese.
 */
export function parsearReporteCamaras(input: string): ResultadoParseo {
  const texto = limpiarTexto(input);
  const lineas = texto
    .split("\n")
    .map((l) => l.replace(/\t/g, "  ").trim())
    .filter((l) => l.length > 0);

  type Bloque = { busCode: string; busIp: string | null; cameras: CamaraOffline[] };
  const bloques: Bloque[] = [];
  const ignoradas: string[] = [];
  let actual: Bloque | null = null;
  let pendiente = "";

  const volcarPendiente = () => {
    if (!actual || !pendiente.trim()) {
      pendiente = "";
      return;
    }
    actual.cameras.push(...extraerCamaras(pendiente).map((c) => ({ ...c, anclada: false })));
    pendiente = "";
  };

  for (const linea of lineas) {
    if (esEncabezado(linea)) continue;

    const bus = detectarBus(linea);
    if (bus) {
      volcarPendiente();
      actual = {
        busCode: bus.busCode,
        busIp: extraerIpDelBus(bus.resto),
        cameras: extraerCamaras(bus.resto).map((c) => ({ ...c, anclada: true })),
      };
      bloques.push(actual);
      continue;
    }

    if (actual) {
      // Continuación de la celda: se pega con un espacio para no partir un
      // "Camara" que quedó separado de su nombre en el renglón siguiente.
      pendiente = `${pendiente} ${linea}`.replace(/\s+/g, " ");
      continue;
    }

    ignoradas.push(linea);
  }
  volcarPendiente();

  // Reparación por subred: devolver al bus siguiente las cámaras que se leyeron
  // antes de su código.
  for (let i = 0; i < bloques.length - 1; i += 1) {
    const actualB = bloques[i];
    const siguiente = bloques[i + 1];
    const subActual = subredAnclada(actualB.cameras);
    const subSiguiente = subredAnclada(siguiente.cameras);
    if (!subActual || !subSiguiente || subActual === subSiguiente) continue;

    const quedan: CamaraOffline[] = [];
    const mudan: CamaraOffline[] = [];
    for (const cam of actualB.cameras) {
      const s = subred(cam.ip);
      if (!cam.anclada && s && s !== subActual && s === subSiguiente) mudan.push(cam);
      else quedan.push(cam);
    }
    if (mudan.length) {
      actualB.cameras = quedan;
      siguiente.cameras = [...mudan, ...siguiente.cameras];
    }
  }

  // Unir bloques del mismo bus (puede aparecer repetido en el cuadro).
  const porBus = new Map<string, FilaReporte>();
  const orden: string[] = [];
  for (const bloque of bloques) {
    let fila = porBus.get(bloque.busCode);
    if (!fila) {
      fila = { busCode: bloque.busCode, busIp: null, cameras: [], avisos: [] };
      porBus.set(bloque.busCode, fila);
      orden.push(bloque.busCode);
    }
    if (!fila.busIp) fila.busIp = bloque.busIp;
    fila.cameras.push(...bloque.cameras);
  }

  // Quitar cámaras repetidas dentro del mismo bus y dejar los avisos.
  const filas = orden.map((code) => {
    const fila = porBus.get(code)!;
    const vistas = new Set<string>();
    const unicas: CamaraOffline[] = [];
    for (const cam of fila.cameras) {
      const clave = `${cam.name}|${cam.ip ?? ""}`;
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      unicas.push(cam);
    }
    fila.cameras = unicas;

    if (!fila.cameras.length) fila.avisos.push("No se detectó ninguna cámara en esta fila.");
    const sinIp = fila.cameras.filter((c) => !c.ip).length;
    if (sinIp) fila.avisos.push(`${sinIp} cámara(s) sin IP legible.`);
    const raras = fila.cameras.filter((c) => c.desconocida).map((c) => c.raw);
    if (raras.length) fila.avisos.push(`Nombre no reconocido: ${raras.join(", ")}.`);
    const corregidas = fila.cameras.filter((c) => c.corregida).map((c) => `${c.raw} → ${c.name}`);
    if (corregidas.length) fila.avisos.push(`Nombre corregido automáticamente: ${corregidas.join(", ")}. Verifícalo.`);
    if (fila.cameras.length > CAMARAS_CANONICAS.length) {
      fila.avisos.push("Hay más cámaras que las 13 del bus; revisa si se duplicó una fila.");
    }
    return fila;
  });

  return { filas, ignoradas };
}
