-- Add session version to revoke existing JWT sessions on sensitive changes.
ALTER TABLE "User"
ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
