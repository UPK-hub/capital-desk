-- Add optional uploaded work-order file metadata
ALTER TABLE "WorkOrder"
ADD COLUMN "orderFilePath" TEXT,
ADD COLUMN "orderFileName" TEXT,
ADD COLUMN "orderFileMimeType" TEXT,
ADD COLUMN "orderFileSize" INTEGER,
ADD COLUMN "orderFileUpdatedAt" TIMESTAMP(3);
