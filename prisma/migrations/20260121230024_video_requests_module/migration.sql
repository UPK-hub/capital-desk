-- CreateEnum
CREATE TYPE "VideoCaseStatus" AS ENUM ('EN_ESPERA', 'EN_CURSO', 'COMPLETADO');

-- CreateEnum
CREATE TYPE "VideoDownloadStatus" AS ENUM ('DESCARGA_REALIZADA', 'DESCARGA_FALLIDA', 'BUS_NO_EN_PATIO', 'PENDIENTE');

-- CreateEnum
CREATE TYPE "VideoAttachmentKind" AS ENUM ('VIDEO', 'OTRO');

-- CreateEnum
CREATE TYPE "VideoRequestEventType" AS ENUM ('STATUS_CHANGE', 'DOWNLOAD_STATUS_CHANGE', 'EMAIL_SENT', 'FILE_UPLOADED', 'COMMENT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'VIDEO_REQUEST_CREATED';
ALTER TYPE "NotificationType" ADD VALUE 'VIDEO_REQUEST_IN_PROGRESS';
ALTER TYPE "NotificationType" ADD VALUE 'VIDEO_REQUEST_DELIVERED';
ALTER TYPE "NotificationType" ADD VALUE 'VIDEO_REQUEST_FAILED';
ALTER TYPE "NotificationType" ADD VALUE 'VIDEO_REQUEST_INTERNAL_DELIVERED';

-- AlterTable
ALTER TABLE "VideoDownloadRequest" ADD COLUMN     "assignedToId" TEXT,
ADD COLUMN     "descriptionNovedad" TEXT,
ADD COLUMN     "downloadStatus" "VideoDownloadStatus" NOT NULL DEFAULT 'PENDIENTE',
ADD COLUMN     "finSolicitud" JSONB,
ADD COLUMN     "notifDeliverySentAt" TIMESTAMP(3),
ADD COLUMN     "notifFailedSentAt" TIMESTAMP(3),
ADD COLUMN     "notifInProgressSentAt" TIMESTAMP(3),
ADD COLUMN     "notifInternalDeliverySentAt" TIMESTAMP(3),
ADD COLUMN     "notifPendingSentAt" TIMESTAMP(3),
ADD COLUMN     "observationsTechnician" TEXT,
ADD COLUMN     "requesterEmails" JSONB,
ADD COLUMN     "status" "VideoCaseStatus" NOT NULL DEFAULT 'EN_ESPERA';

-- CreateTable
CREATE TABLE "VideoAttachment" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "kind" "VideoAttachmentKind" NOT NULL,
    "filePath" TEXT NOT NULL,
    "originalName" TEXT,
    "size" INTEGER,
    "mimeType" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoRequestEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "type" "VideoRequestEventType" NOT NULL,
    "message" TEXT,
    "meta" JSONB,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoRequestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoDownloadToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoDownloadToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VideoAttachment_requestId_kind_idx" ON "VideoAttachment"("requestId", "kind");

-- CreateIndex
CREATE INDEX "VideoRequestEvent_requestId_createdAt_idx" ON "VideoRequestEvent"("requestId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VideoDownloadToken_token_key" ON "VideoDownloadToken"("token");

-- CreateIndex
CREATE INDEX "VideoDownloadToken_attachmentId_expiresAt_idx" ON "VideoDownloadToken"("attachmentId", "expiresAt");

-- AddForeignKey
ALTER TABLE "VideoDownloadRequest" ADD CONSTRAINT "VideoDownloadRequest_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoAttachment" ADD CONSTRAINT "VideoAttachment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "VideoDownloadRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoAttachment" ADD CONSTRAINT "VideoAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoRequestEvent" ADD CONSTRAINT "VideoRequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "VideoDownloadRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoRequestEvent" ADD CONSTRAINT "VideoRequestEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoDownloadToken" ADD CONSTRAINT "VideoDownloadToken_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "VideoAttachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
