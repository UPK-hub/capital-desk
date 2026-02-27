import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";

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
const UPLOAD_DB_BACKUP_ENABLED = String(process.env.UPLOAD_DB_BACKUP_ENABLED ?? "true").toLowerCase() !== "false";
const UPLOAD_DB_BACKUP_MAX_BYTES = Number(process.env.UPLOAD_DB_BACKUP_MAX_BYTES ?? 20 * 1024 * 1024);

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".zip": "application/zip",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
};

function contentTypeFromPath(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function removeFileIfExists(absPath: string) {
  try {
    await fs.unlink(absPath);
  } catch (error: any) {
    const code = String(error?.code ?? "");
    if (code !== "ENOENT") throw error;
  }
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

type SaveUploadOptions = {
  fileNamePrefix?: string | null;
};

type UploadBackupMeta = {
  originalName?: string | null;
  mimeType?: string | null;
};

export function normalizeUploadRelPath(relPath: string) {
  return String(relPath ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^api\/uploads\//i, "")
    .replace(/^uploads\//i, "");
}

async function backupUploadToDb(relPath: string, buffer: Buffer, meta?: UploadBackupMeta) {
  const shouldBackup =
    UPLOAD_DB_BACKUP_ENABLED &&
    Number.isFinite(UPLOAD_DB_BACKUP_MAX_BYTES) &&
    UPLOAD_DB_BACKUP_MAX_BYTES > 0 &&
    buffer.length <= UPLOAD_DB_BACKUP_MAX_BYTES;

  if (!shouldBackup) return false;

  await prisma.uploadBackup.upsert({
    where: { filePath: relPath },
    create: {
      filePath: relPath,
      originalName: String(meta?.originalName || "").trim() || null,
      mimeType: String(meta?.mimeType || "").trim() || contentTypeFromPath(relPath),
      sizeBytes: buffer.length,
      content: buffer,
    },
    update: {
      originalName: String(meta?.originalName || "").trim() || null,
      mimeType: String(meta?.mimeType || "").trim() || contentTypeFromPath(relPath),
      sizeBytes: buffer.length,
      content: buffer,
    },
  });

  return true;
}

export async function saveUpload(file: File, subdir: string, options?: SaveUploadOptions): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const prefixRaw = String(options?.fileNamePrefix ?? "").trim();
  const prefix = safeName(prefixRaw).replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  const baseName = safeName(file.name || "upload.bin");
  const filename = `${Date.now()}_${prefix ? `${prefix}_` : ""}${baseName}`;
  const relDir = normalizeUploadRelPath(subdir).replace(/\/+$/, "");
  const relPath = relDir ? `${relDir}/${filename}` : filename;

  const absPath = resolveUploadPath(relPath);
  const absDir = path.dirname(absPath);

  let diskSaved = false;
  let backupSaved = false;
  let diskError: unknown = null;
  let backupError: unknown = null;

  try {
    await ensureDir(absDir);
    await fs.writeFile(absPath, buffer);
    diskSaved = true;
  } catch (error) {
    diskError = error;
  }

  try {
    backupSaved = await backupUploadToDb(relPath, buffer, {
      originalName: file.name || null,
      mimeType: file.type || null,
    });
  } catch (error) {
    backupError = error;
  }

  if (!diskSaved && !backupSaved) {
    throw new Error(
      `Upload failed: disk=${String((diskError as any)?.message ?? diskError ?? "unknown")} | backup=${String(
        (backupError as any)?.message ?? backupError ?? "not available"
      )}`
    );
  }

  if (backupError) {
    console.error("UPLOAD_DB_BACKUP_FAILED", {
      relPath,
      error: String((backupError as any)?.message ?? backupError),
    });
  }

  if (!diskSaved && backupSaved) {
    console.warn("UPLOAD_SAVED_USING_DB_BACKUP_ONLY", { relPath });
  }

  return relPath;
}

export async function saveGeneratedUpload(
  relPath: string,
  content: Buffer | Uint8Array | ArrayBuffer,
  meta?: UploadBackupMeta
) {
  const clean = normalizeUploadRelPath(relPath);
  if (!clean) throw new Error("Invalid upload path");

  const buffer = Buffer.isBuffer(content)
    ? content
    : content instanceof Uint8Array
    ? Buffer.from(content)
    : Buffer.from(content);

  const absPath = resolveUploadPath(clean);
  const absDir = path.dirname(absPath);

  let diskSaved = false;
  let backupSaved = false;
  let diskError: unknown = null;
  let backupError: unknown = null;

  try {
    await ensureDir(absDir);
    await fs.writeFile(absPath, buffer);
    diskSaved = true;
  } catch (error) {
    diskError = error;
  }

  try {
    backupSaved = await backupUploadToDb(clean, buffer, meta);
  } catch (error) {
    backupError = error;
  }

  if (!diskSaved && !backupSaved) {
    throw new Error(
      `Generated upload failed: disk=${String((diskError as any)?.message ?? diskError ?? "unknown")} | backup=${String(
        (backupError as any)?.message ?? backupError ?? "not available"
      )}`
    );
  }

  if (backupError) {
    console.error("UPLOAD_DB_BACKUP_FAILED", {
      relPath: clean,
      error: String((backupError as any)?.message ?? backupError),
    });
  }

  if (!diskSaved && backupSaved) {
    console.warn("GENERATED_UPLOAD_SAVED_USING_DB_BACKUP_ONLY", { relPath: clean });
  }

  return clean;
}

export function getUploadsRoot() {
  return UPLOADS_DIR;
}

export function resolveUploadPath(relPath: string) {
  const clean = normalizeUploadRelPath(relPath);

  const candidate = path.resolve(UPLOADS_DIR, clean);
  const root = UPLOADS_DIR;
  if (candidate !== root && !candidate.startsWith(root + path.sep)) {
    throw new Error("Invalid upload path");
  }
  return candidate;
}

export async function getUploadBackup(relPath: string) {
  const clean = normalizeUploadRelPath(relPath);
  if (!clean) return null;

  return prisma.uploadBackup.findUnique({
    where: { filePath: clean },
    select: {
      content: true,
      mimeType: true,
      originalName: true,
      sizeBytes: true,
      updatedAt: true,
    },
  });
}

export async function invalidateUploadsByPrefix(prefix: string) {
  const cleanPrefix = normalizeUploadRelPath(prefix).replace(/\/+$/, "");
  if (!cleanPrefix) return { removedDisk: 0, removedBackup: 0 };

  const backups = await prisma.uploadBackup.findMany({
    where: { filePath: { startsWith: `${cleanPrefix}/` } },
    select: { filePath: true },
  });

  let removedDisk = 0;
  for (const item of backups) {
    try {
      const abs = resolveUploadPath(item.filePath);
      await removeFileIfExists(abs);
      removedDisk += 1;
    } catch {
      // ignore invalid/missing path while cleaning cache
    }
  }

  const deleted = await prisma.uploadBackup.deleteMany({
    where: { filePath: { startsWith: `${cleanPrefix}/` } },
  });

  return { removedDisk, removedBackup: deleted.count };
}

export async function readUploadBinary(relPath: string) {
  const clean = normalizeUploadRelPath(relPath);
  if (!clean) return null;

  try {
    const abs = resolveUploadPath(clean);
    const buffer = await fs.readFile(abs);
    return {
      source: "disk" as const,
      buffer,
      fileName: path.basename(clean),
      mimeType: contentTypeFromPath(clean),
      sizeBytes: buffer.length,
    };
  } catch {
    // fall through to DB backup
  }

  const backup = await getUploadBackup(clean);
  if (!backup) return null;

  return {
    source: "backup" as const,
    buffer: Buffer.from(backup.content),
    fileName: backup.originalName || path.basename(clean),
    mimeType: backup.mimeType || contentTypeFromPath(clean),
    sizeBytes: backup.sizeBytes,
  };
}
