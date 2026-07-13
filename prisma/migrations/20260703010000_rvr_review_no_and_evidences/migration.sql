-- RVR: número consecutivo de revisión + evidencias generales

-- AlterTable
ALTER TABLE "RemoteVisualReview" ADD COLUMN IF NOT EXISTS "reviewNo" INTEGER;
ALTER TABLE "RemoteVisualReview" ADD COLUMN IF NOT EXISTS "evidences" JSONB;

-- Backfill: numerar las revisiones existentes por fecha (más antigua = 1), por tenant.
UPDATE "RemoteVisualReview" r
SET "reviewNo" = sub.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "tenantId" ORDER BY "reviewDate" ASC, "createdAt" ASC) AS rn
  FROM "RemoteVisualReview"
) sub
WHERE r.id = sub.id AND r."reviewNo" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RemoteVisualReview_tenantId_reviewNo_key" ON "RemoteVisualReview"("tenantId", "reviewNo");
