import { prisma } from "@/lib/prisma";

// Firmas fijas de los PDFs (coordinador y líder técnico). Se pueden editar
// desde /admin/firmas; si aún no hay registro se usan estos valores.
export type DocumentSignatures = {
  coordinadorName: string;
  coordinadorRole: string;
  liderName: string;
  liderRole: string;
};

export const DEFAULT_DOCUMENT_SIGNATURES: DocumentSignatures = {
  coordinadorName: "Anderson Rueda",
  coordinadorRole: "Coordinador STS",
  liderName: "Diego Hernández",
  liderRole: "Líder técnico",
};

const clean = (v: unknown, fallback: string): string => {
  const t = typeof v === "string" ? v.trim() : "";
  return t || fallback;
};

export function normalizeDocumentSignatures(raw: Partial<DocumentSignatures> | null | undefined): DocumentSignatures {
  return {
    coordinadorName: clean(raw?.coordinadorName, DEFAULT_DOCUMENT_SIGNATURES.coordinadorName),
    coordinadorRole: clean(raw?.coordinadorRole, DEFAULT_DOCUMENT_SIGNATURES.coordinadorRole),
    liderName: clean(raw?.liderName, DEFAULT_DOCUMENT_SIGNATURES.liderName),
    liderRole: clean(raw?.liderRole, DEFAULT_DOCUMENT_SIGNATURES.liderRole),
  };
}

// Nunca lanza: si la tabla todavía no existe (deploy sin migrar) devuelve los
// valores por defecto para no romper la generación del PDF.
export async function getDocumentSignatures(tenantId: string): Promise<DocumentSignatures> {
  try {
    const row = await prisma.documentSignatureSettings.findUnique({ where: { tenantId } });
    return normalizeDocumentSignatures(row);
  } catch (e) {
    console.error("DOCUMENT_SIGNATURES_READ_FAILED", e);
    return { ...DEFAULT_DOCUMENT_SIGNATURES };
  }
}
