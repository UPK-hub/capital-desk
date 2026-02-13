-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TechnicianRestDay" ADD VALUE 'NONE';
ALTER TYPE "TechnicianRestDay" ADD VALUE 'MONDAY';
ALTER TYPE "TechnicianRestDay" ADD VALUE 'TUESDAY';
ALTER TYPE "TechnicianRestDay" ADD VALUE 'WEDNESDAY';
ALTER TYPE "TechnicianRestDay" ADD VALUE 'THURSDAY';
ALTER TYPE "TechnicianRestDay" ADD VALUE 'FRIDAY';
