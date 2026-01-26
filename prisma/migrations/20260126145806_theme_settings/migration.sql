-- CreateTable
CREATE TABLE "ThemeSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "background" TEXT NOT NULL,
    "foreground" TEXT NOT NULL,
    "card" TEXT NOT NULL,
    "cardForeground" TEXT NOT NULL,
    "primary" TEXT NOT NULL,
    "primaryForeground" TEXT NOT NULL,
    "border" TEXT NOT NULL,
    "muted" TEXT NOT NULL,
    "mutedForeground" TEXT NOT NULL,
    "radius" TEXT NOT NULL,
    "stsBg" TEXT NOT NULL,
    "stsAccent" TEXT NOT NULL,
    "stsAccent2" TEXT NOT NULL,
    "fontSans" TEXT NOT NULL,
    "fontDisplay" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThemeSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ThemeSettings_tenantId_key" ON "ThemeSettings"("tenantId");

-- AddForeignKey
ALTER TABLE "ThemeSettings" ADD CONSTRAINT "ThemeSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
