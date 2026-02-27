CREATE TABLE "UploadBackup" (
    "id" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "originalName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UploadBackup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UploadBackup_filePath_key" ON "UploadBackup"("filePath");
CREATE INDEX "UploadBackup_createdAt_idx" ON "UploadBackup"("createdAt");