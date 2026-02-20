"use client";

export type PhotoWatermarkContext = {
  equipmentLabel?: string | null;
  busCode?: string | null;
  caseRef?: string | null;
  capturedAt?: Date;
};

function formatBogotaDateTime(date: Date) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "America/Bogota",
  }).format(date);
}

function isImageFile(file: File) {
  return String(file.type ?? "").toLowerCase().startsWith("image/");
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No se pudo cargar la imagen para marca de agua."));
    image.src = url;
  });
}

function trimLine(value: string, max = 72) {
  const text = String(value ?? "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function buildWatermarkLines(ctx: PhotoWatermarkContext) {
  const now = ctx.capturedAt ?? new Date();
  return [
    `Equipo: ${trimLine(ctx.equipmentLabel || "No especificado")}`,
    `Bus: ${trimLine(ctx.busCode || "No especificado")}`,
    `Caso: ${trimLine(ctx.caseRef || "No especificado")}`,
    `Hora: ${formatBogotaDateTime(now)}`,
  ];
}

async function toBlob(canvas: HTMLCanvasElement, mimeType: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    const quality = mimeType.includes("png") ? undefined : 0.92;
    canvas.toBlob((blob) => resolve(blob), mimeType, quality as any);
  });
}

export async function withPhotoWatermark(file: File, ctx: PhotoWatermarkContext): Promise<File> {
  if (!isImageFile(file)) return file;
  if (typeof window === "undefined") return file;

  let objectUrl = "";
  try {
    objectUrl = URL.createObjectURL(file);
    const image = await loadImage(objectUrl);
    const width = Math.max(1, image.naturalWidth || image.width || 1);
    const height = Math.max(1, image.naturalHeight || image.height || 1);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext("2d");
    if (!g) return file;

    g.drawImage(image, 0, 0, width, height);

    const lines = buildWatermarkLines(ctx);
    const fontPx = Math.max(14, Math.round(width * 0.02));
    const lineHeight = Math.round(fontPx * 1.22);
    const padX = Math.max(10, Math.round(width * 0.02));
    const padY = Math.max(8, Math.round(height * 0.016));
    const blockHeight = padY * 2 + lineHeight * lines.length;

    g.fillStyle = "rgba(0,0,0,0.58)";
    g.fillRect(0, height - blockHeight, width, blockHeight);

    g.font = `600 ${fontPx}px system-ui, -apple-system, Segoe UI, sans-serif`;
    g.fillStyle = "rgba(255,255,255,0.96)";
    g.textBaseline = "top";
    lines.forEach((line, i) => {
      g.fillText(line, padX, height - blockHeight + padY + i * lineHeight);
    });

    const outputType = isImageFile(file) ? file.type || "image/jpeg" : "image/jpeg";
    const blob = await toBlob(canvas, outputType);
    if (!blob) return file;
    return new File([blob], file.name, { type: blob.type, lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

export async function withPhotoWatermarkMany(
  files: Iterable<File>,
  ctx: PhotoWatermarkContext
): Promise<File[]> {
  const list = Array.from(files ?? []);
  const result: File[] = [];
  for (const file of list) {
    result.push(await withPhotoWatermark(file, ctx));
  }
  return result;
}
