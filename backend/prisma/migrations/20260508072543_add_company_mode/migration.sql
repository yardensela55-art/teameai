-- CreateEnum
CREATE TYPE "CompanyMode" AS ENUM ('CEO', 'FOUNDER');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "mode" "CompanyMode" NOT NULL DEFAULT 'CEO';
