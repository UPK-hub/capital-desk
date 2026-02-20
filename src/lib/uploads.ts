import fs from "node:fs/promises";
import path from "node:path";

function normalizeRoot(root: string) {
  return path.resolve(root);
}

function resolveDefaultUploadsRoot() {
  // Permite sobreescribir root explícitamente (útil para contenedores/hosts).
  const fromEnv = String(process.env.UPLOADS_DIR ?? "").trim();
  if (fromEnv) return normalizeRoot(fromEnv);

  // En Vercel, /var/task es solo lectura. /tmp sí es escribible.
  if (process.env.VERCEL) {
    const tmpRoot = String(process.env.TMPDIR ?? "/tmp");
    return normalizeRoot(path.join(tmpRoot, "uploads"));
  }

  return normalizeRoot(path.join(process.cwd(), "uploads"));
}

const UPLOADS_DIR = resolveDefaultUploadsRoot();

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function saveUpload(file: File, subdir: string): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const filename = `${Date.now()}_${safeName(file.name || "upload.bin")}`;
  const relDir = subdir.replace(/^\/+/, "").replace(/\\/g, "/");
  const relPath = `${relDir}/${filename}`;

  const absDir = path.join(UPLOADS_DIR, relDir);
  const absPath = path.join(UPLOADS_DIR, relPath);

  await ensureDir(absDir);
  await fs.writeFile(absPath, buffer);

  return relPath;
}

export function getUploadsRoot() {
  return UPLOADS_DIR;
}

export function resolveUploadPath(relPath: string) {
  const clean = String(relPath ?? "")
    .replace(/^\/+/, "")
    .replace(/\\/g, "/");

  const candidate = path.resolve(UPLOADS_DIR, clean);
  const root = UPLOADS_DIR;
  if (candidate !== root && !candidate.startsWith(root + path.sep)) {
    throw new Error("Invalid upload path");
  }
  return candidate;
}
