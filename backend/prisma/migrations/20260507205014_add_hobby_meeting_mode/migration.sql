/*
  Warnings:

  - Added the required column `hobby` to the `Agent` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "MeetingMode" AS ENUM ('CHAT', 'PRESENTATION');

-- AlterTable
ALTER TABLE "Agent" ADD COLUMN "hobby" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Agent" ALTER COLUMN "hobby" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "leadAgentId" TEXT,
ADD COLUMN     "mode" "MeetingMode" NOT NULL DEFAULT 'CHAT';
