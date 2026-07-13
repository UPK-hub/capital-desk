-- Índices compuestos para acelerar los listados con filtros (casos, novedades, videos)

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Case_tenantId_status_createdAt_idx" ON "Case"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Case_tenantId_type_createdAt_idx" ON "Case"("tenantId", "type", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VideoDownloadRequest_createdAt_idx" ON "VideoDownloadRequest"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VideoDownloadRequest_status_downloadStatus_createdAt_idx" ON "VideoDownloadRequest"("status", "downloadStatus", "createdAt");
