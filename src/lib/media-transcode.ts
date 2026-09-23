/**
 * Previsualización de video en la app.
 *
 * Problema que resuelve: los MDVR de los buses exportan archivos .mp4 cuyo
 * contenido real suele ser H.265/HEVC (o audio no estándar). El contenedor es
 * .mp4, así que el navegador acepta el archivo, pero no puede decodificarlo y
 * el reproductor queda en negro; el usuario terminaba descargando el video
 * para verlo con VLC.
 *
 * Solución: se analiza el archivo con ffprobe y, si el códec no es reproducible
 * en navegador, se transcodifica UNA sola vez a H.264/AAC (faststart) y se
 * guarda en caché dentro de `uploads/_previews`. Las siguientes reproducciones
 * usan el archivo ya convertido.
 *
 * Requiere ffmpeg/ffprobe en el servidor. Rutas que se intentan, en orden:
 *   1. FFMPEG_PATH / FFPROBE_PATH (variables de entorno)
 *   2. <app>/tools/ffmpeg/ffmpeg.exe
 *   3. <app>/bin/ffmpeg.exe
 *   4. ffmpeg en el PATH del sistema
 * Si no está instalado, la app sigue funcionando: informa el códec y ofrece la
 * descarga, sin romper nada.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { getUploadsRoot, normalizeUploadRelPath, resolveUploadPath } from "@/lib/uploads";

export type PreviewState = "none" | "queued" | "processing" | "ready" | "error";

export type ProbeResult = {
  videoCodec: string | null;
  audioCodec: string | null;
  pixelFormat: string | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
};

export type PreviewInfo = {
  /** El navegador puede reproducir el archivo original tal cual. */
  nativePlayable: boolean | null;
  /** Herramientas de conversión disponibles en el servidor. */
  toolsAvailable: boolean;
  probe: ProbeResult | null;
  state: PreviewState;
  progress: number;
  error: string | null;
  /** Tamaño del archivo convertido, cuando ya existe. */
  convertedBytes: number | null;
};

const PREVIEW_DIR = "_previews";
const PREVIEW_TTL_DAYS = Number(process.env.VIDEO_PREVIEW_TTL_DAYS ?? 20);
const MAX_CONCURRENT = Math.max(1, Number(process.env.VIDEO_PREVIEW_CONCURRENCY ?? 1));
const MAX_WIDTH = Math.max(320, Number(process.env.VIDEO_PREVIEW_MAX_WIDTH ?? 1280));
const CRF = String(process.env.VIDEO_PREVIEW_CRF ?? 26);

/** Códecs de video que los navegadores modernos reproducen sin ayuda. */
const WEB_VIDEO_CODECS = new Set(["h264", "vp8", "vp9", "av1", "theora"]);
/** Códecs de audio aceptados junto a esos contenedores. */
const WEB_AUDIO_CODECS = new Set(["aac", "mp3", "opus", "vorbis", "flac", "pcm_s16le"]);
/** Contenedores que el navegador sabe abrir. */
const WEB_CONTAINERS = new Set([".mp4", ".m4v", ".webm", ".ogg", ".ogv", ".mov"]);

// ---------------------------------------------------------------- binarios

type BinName = "ffmpeg" | "ffprobe";
const binCache = new Map<BinName, string | null>();

function binCandidates(name: BinName): string[] {
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  const fromEnv = name === "ffmpeg" ? process.env.FFMPEG_PATH : process.env.FFPROBE_PATH;
  const list: string[] = [];
  if (fromEnv && fromEnv.trim()) list.push(fromEnv.trim());
  list.push(path.join(process.cwd(), "tools", "ffmpeg", exe));
  list.push(path.join(process.cwd(), "tools", "ffmpeg", "bin", exe));
  list.push(path.join(process.cwd(), "bin", exe));
  list.push(exe); // PATH del sistema
  return list;
}

function tryRun(bin: string, args: string[], timeoutMs = 8000): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    let out = "";
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      resolve({ ok, out });
    };
    let child;
    try {
      child = spawn(bin, args, { windowsHide: true });
    } catch {
      finish(false);
      return;
    }
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* noop */ }
      finish(false);
    }, timeoutMs);
    child.stdout?.on("data", (d) => { out += String(d); });
    child.stderr?.on("data", (d) => { out += String(d); });
    child.on("error", () => { clearTimeout(timer); finish(false); });
    child.on("close", (code) => { clearTimeout(timer); finish(code === 0); });
  });
}

export async function resolveBin(name: BinName): Promise<string | null> {
  if (binCache.has(name)) return binCache.get(name) ?? null;
  for (const candidate of binCandidates(name)) {
    if (candidate.includes(path.sep) && !fs.existsSync(candidate)) continue;
    const res = await tryRun(candidate, ["-version"]);
    if (res.ok) {
      binCache.set(name, candidate);
      return candidate;
    }
  }
  binCache.set(name, null);
  return null;
}

export async function toolsAvailable(): Promise<boolean> {
  const [ff, fp] = await Promise.all([resolveBin("ffmpeg"), resolveBin("ffprobe")]);
  return Boolean(ff && fp);
}

// ---------------------------------------------------------------- caché

function previewKey(rel: string, size: number, mtimeMs: number) {
  return crypto.createHash("sha1").update(`${rel}|${size}|${Math.round(mtimeMs)}`).digest("hex");
}

function previewPaths(key: string) {
  const dir = path.join(path.resolve(getUploadsRoot()), PREVIEW_DIR);
  return {
    dir,
    final: path.join(dir, `${key}.mp4`),
    partial: path.join(dir, `${key}.part.mp4`),
  };
}

/** Resuelve la ruta del original y valida que esté dentro de uploads. */
export function resolveOriginal(relRaw: string): { rel: string; abs: string } | null {
  const rel = normalizeUploadRelPath(relRaw);
  if (!rel) return null;
  let abs = "";
  try {
    abs = resolveUploadPath(rel);
  } catch {
    return null;
  }
  const root = path.resolve(getUploadsRoot());
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return { rel, abs };
}

// ---------------------------------------------------------------- probe

const probeCache = new Map<string, ProbeResult>();

export async function probeFile(abs: string, cacheKey: string): Promise<ProbeResult | null> {
  const cached = probeCache.get(cacheKey);
  if (cached) return cached;

  const ffprobe = await resolveBin("ffprobe");
  if (!ffprobe) return null;

  const res = await tryRun(
    ffprobe,
    [
      "-v", "error",
      "-show_entries", "stream=codec_type,codec_name,pix_fmt,width,height",
      "-show_entries", "format=duration",
      "-of", "json",
      abs,
    ],
    20000
  );
  if (!res.ok) return null;

  try {
    const data = JSON.parse(res.out);
    const streams: any[] = Array.isArray(data?.streams) ? data.streams : [];
    const v = streams.find((s) => s?.codec_type === "video");
    const a = streams.find((s) => s?.codec_type === "audio");
    const duration = Number(data?.format?.duration);
    const parsed: ProbeResult = {
      videoCodec: v?.codec_name ? String(v.codec_name).toLowerCase() : null,
      audioCodec: a?.codec_name ? String(a.codec_name).toLowerCase() : null,
      pixelFormat: v?.pix_fmt ? String(v.pix_fmt).toLowerCase() : null,
      durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : null,
      width: Number.isFinite(Number(v?.width)) ? Number(v.width) : null,
      height: Number.isFinite(Number(v?.height)) ? Number(v.height) : null,
    };
    probeCache.set(cacheKey, parsed);
    if (probeCache.size > 500) probeCache.clear();
    return parsed;
  } catch {
    return null;
  }
}

export function isNativePlayable(rel: string, probe: ProbeResult | null): boolean | null {
  const ext = path.extname(rel).toLowerCase();
  if (!WEB_CONTAINERS.has(ext)) return false;
  if (!probe) return null; // sin ffprobe no se puede afirmar nada
  if (!probe.videoCodec) return false;
  if (!WEB_VIDEO_CODECS.has(probe.videoCodec)) return false;
  // 10 bits o 4:2:2 no se decodifican en la mayoría de navegadores.
  if (probe.pixelFormat && !["yuv420p", "yuvj420p"].includes(probe.pixelFormat)) return false;
  if (probe.audioCodec && !WEB_AUDIO_CODECS.has(probe.audioCodec)) return false;
  return true;
}

// ---------------------------------------------------------------- cola

type Job = { state: PreviewState; progress: number; error: string | null; startedAt: number };
const jobs = new Map<string, Job>();
let running = 0;
const waiting: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (running < MAX_CONCURRENT) {
    running += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(resolve));
}

function releaseSlot() {
  const next = waiting.shift();
  if (next) {
    next();
    return;
  }
  running = Math.max(0, running - 1);
}

function parseFfmpegTime(line: string): number | null {
  const m = /time=(\d+):(\d{2}):(\d{2})\.(\d{1,2})/.exec(line);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(`0.${m[4]}`);
}

async function runTranscode(abs: string, key: string, duration: number | null) {
  const ffmpeg = await resolveBin("ffmpeg");
  const paths = previewPaths(key);
  const job = jobs.get(key)!;

  if (!ffmpeg) {
    job.state = "error";
    job.error = "ffmpeg no está instalado en el servidor";
    return;
  }

  await fsp.mkdir(paths.dir, { recursive: true });
  await fsp.rm(paths.partial, { force: true }).catch(() => undefined);

  job.state = "processing";
  job.progress = 0;

  const args = [
    "-hide_banner", "-nostdin", "-y",
    "-i", abs,
    "-map", "0:v:0", "-map", "0:a:0?",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", CRF,
    "-profile:v", "high",
    "-level", "4.1",
    "-pix_fmt", "yuv420p",
    "-vf", `scale=min(${MAX_WIDTH}\\,iw):-2`,
    "-c:a", "aac", "-b:a", "96k", "-ac", "2",
    "-movflags", "+faststart",
    "-max_muxing_queue_size", "1024",
    paths.partial,
  ];

  await new Promise<void>((resolve) => {
    const child = spawn(ffmpeg, args, { windowsHide: true });
    let tail = "";
    child.stderr?.on("data", (d) => {
      const text = String(d);
      tail = (tail + text).slice(-4000);
      if (!duration) return;
      const t = parseFfmpegTime(text);
      if (t != null) job.progress = Math.min(99, Math.round((t / duration) * 100));
    });
    child.on("error", (err) => {
      job.state = "error";
      job.error = String(err?.message ?? err);
      resolve();
    });
    child.on("close", async (code) => {
      if (code === 0 && fs.existsSync(paths.partial)) {
        try {
          await fsp.rm(paths.final, { force: true });
          await fsp.rename(paths.partial, paths.final);
          job.state = "ready";
          job.progress = 100;
        } catch (err: any) {
          job.state = "error";
          job.error = String(err?.message ?? err);
        }
      } else if (job.state !== "error") {
        job.state = "error";
        job.error = `ffmpeg terminó con código ${code}`;
        console.error("VIDEO_PREVIEW_FFMPEG_FAILED", { key, code, tail: tail.slice(-800) });
      }
      await fsp.rm(paths.partial, { force: true }).catch(() => undefined);
      resolve();
    });
  });
}

/** Lanza (o reutiliza) la conversión del archivo. No bloquea la petición. */
export async function ensurePreview(rel: string, abs: string, size: number, mtimeMs: number) {
  const key = previewKey(rel, size, mtimeMs);
  const paths = previewPaths(key);

  if (fs.existsSync(paths.final)) {
    jobs.set(key, { state: "ready", progress: 100, error: null, startedAt: Date.now() });
    return key;
  }

  const existing = jobs.get(key);
  if (existing && (existing.state === "queued" || existing.state === "processing")) return key;

  jobs.set(key, { state: "queued", progress: 0, error: null, startedAt: Date.now() });

  void (async () => {
    try {
      const probe = await probeFile(abs, key);
      await acquireSlot();
      try {
        await runTranscode(abs, key, probe?.durationSeconds ?? null);
      } finally {
        releaseSlot();
      }
      void purgeOldPreviews();
    } catch (err: any) {
      const job = jobs.get(key);
      if (job) {
        job.state = "error";
        job.error = String(err?.message ?? err);
      }
    }
  })();

  return key;
}

export function previewStatus(key: string): { state: PreviewState; progress: number; error: string | null; bytes: number | null } {
  const paths = previewPaths(key);
  if (fs.existsSync(paths.final)) {
    let bytes: number | null = null;
    try { bytes = fs.statSync(paths.final).size; } catch { /* noop */ }
    return { state: "ready", progress: 100, error: null, bytes };
  }
  const job = jobs.get(key);
  if (!job) return { state: "none", progress: 0, error: null, bytes: null };
  return { state: job.state, progress: job.progress, error: job.error, bytes: null };
}

export function previewFilePath(key: string): string | null {
  const paths = previewPaths(key);
  return fs.existsSync(paths.final) ? paths.final : null;
}

export function previewKeyFor(rel: string, size: number, mtimeMs: number) {
  return previewKey(rel, size, mtimeMs);
}

// ---------------------------------------------------------------- limpieza

let lastPurge = 0;

/** Borra previsualizaciones viejas (son derivadas: se regeneran solas). */
export async function purgeOldPreviews(force = false): Promise<number> {
  const now = Date.now();
  if (!force && now - lastPurge < 60 * 60 * 1000) return 0;
  lastPurge = now;

  const dir = previewPaths("x").dir;
  const ttlMs = Math.max(1, PREVIEW_TTL_DAYS) * 24 * 60 * 60 * 1000;
  let removed = 0;
  try {
    const entries = await fsp.readdir(dir);
    for (const name of entries) {
      const abs = path.join(dir, name);
      try {
        const st = await fsp.stat(abs);
        const age = now - Math.max(st.mtimeMs, st.atimeMs);
        const stalePartial = name.endsWith(".part.mp4") && age > 6 * 60 * 60 * 1000;
        if (age > ttlMs || stalePartial) {
          await fsp.rm(abs, { force: true });
          removed += 1;
        }
      } catch { /* noop */ }
    }
  } catch { /* la carpeta puede no existir todavía */ }
  return removed;
}
