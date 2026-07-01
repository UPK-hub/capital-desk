-- RVR: aspectos por bus (transmite, acceso remoto, P20, P60, coordenadas)
ALTER TABLE "RemoteVisualReviewBus" ADD COLUMN "aspects" JSONB;

-- RVR: prioridad con la que el bus entró a la revisión (motor de priorización)
ALTER TABLE "RemoteVisualReviewBus" ADD COLUMN "priorityRank" INTEGER;
ALTER TABLE "RemoteVisualReviewBus" ADD COLUMN "priorityReason" TEXT;
ALTER TABLE "RemoteVisualReviewBus" ADD COLUMN "priorityDetail" TEXT;
