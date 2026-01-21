import fs from "node:fs/promises";
import path from "node:path";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

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

export function resolveUploadPath(relPath: string) {
  const clean = relPath.replace(/^\/+/, "");
  return path.join(UPLOADS_DIR, clean);
}
