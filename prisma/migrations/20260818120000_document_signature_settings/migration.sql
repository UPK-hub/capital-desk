-- Firmas de documentos configurables desde la app (/admin/firmas).
CREATE TABLE IF NOT EXISTS "DocumentSignatureSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "coordinadorName" TEXT NOT NULL DEFAULT 'Anderson Rueda',
    "coordinadorRole" TEXT NOT NULL DEFAULT 'Coordinador STS',
    "liderName" TEXT NOT NULL DEFAULT 'Diego Hernández',
    "liderRole" TEXT NOT NULL DEFAULT 'Líder técnico',
    "updatedById" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentSignatureSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DocumentSignatureSettings_tenantId_key"
    ON "DocumentSignatureSettings"("tenantId");

DO $$
BEGIN
  ALTER TABLE "DocumentSignatureSettings"
    ADD CONSTRAINT "DocumentSignatureSettings_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
