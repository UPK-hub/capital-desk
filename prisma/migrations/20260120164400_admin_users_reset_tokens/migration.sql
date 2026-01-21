/*
  Warnings:

  - The values [EN_EJECUCUCION] on the enum `CaseStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "CaseStatus_new" AS ENUM ('NUEVO', 'OT_ASIGNADA', 'EN_EJECUCION', 'RESUELTO', 'CERRADO');
ALTER TABLE "Case" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Case" ALTER COLUMN "status" TYPE "CaseStatus_new" USING ("status"::text::"CaseStatus_new");
ALTER TYPE "CaseStatus" RENAME TO "CaseStatus_old";
ALTER TYPE "CaseStatus_new" RENAME TO "CaseStatus";
DROP TYPE "CaseStatus_old";
ALTER TABLE "Case" ALTER COLUMN "status" SET DEFAULT 'NUEVO';
COMMIT;
