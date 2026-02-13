-- AlterEnum
ALTER TYPE "WorkOrderStatus" ADD VALUE 'EN_VALIDACION';

-- AlterTable
ALTER TABLE "TechnicianSchedule" ALTER COLUMN "restDay" SET DEFAULT 'NONE';
