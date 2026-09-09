-- Cada cámara envía dos clips por activación (el minuto previo y los cinco
-- minutos posteriores), de modo que la unicidad pasa de evento+cámara a
-- evento+cámara+tramo.

-- CreateEnum
CREATE TYPE "PanicClipSegment" AS ENUM ('PREVIO', 'POSTERIOR');

-- AlterTable
ALTER TABLE "PanicVideoClip" ADD COLUMN "segment" "PanicClipSegment" NOT NULL DEFAULT 'POSTERIOR';

-- DropIndex
DROP INDEX "PanicVideoClip_eventId_channel_key";

-- AlterTable: identificación de la cámara por código del NVR (ej. BV1-4)
ALTER TABLE "PanicVideoClip" ADD COLUMN "cameraCode" TEXT;
ALTER TABLE "PanicVideoClip" ADD COLUMN "wagon" TEXT;
ALTER TABLE "PanicVideoClip" ADD COLUMN "cameraKey" TEXT NOT NULL DEFAULT 'UNICO';

UPDATE "PanicVideoClip"
   SET "cameraKey" = CASE WHEN "channel" IS NOT NULL THEN 'CAM' || "channel" ELSE 'UNICO' END;

-- CreateIndex
CREATE UNIQUE INDEX "PanicVideoClip_eventId_cameraKey_segment_key" ON "PanicVideoClip"("eventId", "cameraKey", "segment");
CREATE INDEX "PanicVideoClip_eventId_cameraKey_idx" ON "PanicVideoClip"("eventId", "cameraKey");
