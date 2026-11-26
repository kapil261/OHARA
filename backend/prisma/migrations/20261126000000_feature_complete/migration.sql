-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('PUSH', 'EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "PackStatus" AS ENUM ('PLANNED', 'DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "ContentCategory" AS ENUM ('OBJECT', 'SOUND', 'FOOD', 'FESTIVAL', 'ROUTINE');

-- AlterTable
ALTER TABLE "Alert" ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "location" JSONB,
ADD COLUMN     "occurrenceId" TEXT,
ADD COLUMN     "resolutionNote" TEXT,
ADD COLUMN     "resolved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedBy" TEXT;

-- AlterTable
ALTER TABLE "CareTeamMember" ADD COLUMN     "notifySms" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "appVersion" TEXT,
ADD COLUMN     "model" TEXT;

-- AlterTable
ALTER TABLE "MediaItem" ADD COLUMN     "purpose" TEXT;

-- AlterTable
ALTER TABLE "PairingCode" ADD COLUMN     "appVersion" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "deviceModel" TEXT;

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "voiceAnswers" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Reminder" ADD COLUMN     "alertIfMissed" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "ReminderOccurrence" ADD COLUMN     "repeatedAt" TIMESTAMP(3),
ADD COLUMN     "smsAt" TIMESTAMP(3),
ADD COLUMN     "snoozeCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phone" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "patientId" TEXT,
    "alertId" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitNote" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "authorId" TEXT,
    "text" TEXT NOT NULL,
    "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CulturePack" (
    "id" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "languages" TEXT[],
    "status" "PackStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CulturePack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentItem" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "category" "ContentCategory" NOT NULL,
    "label" TEXT NOT NULL,
    "labels" JSONB NOT NULL DEFAULT '{}',
    "tags" TEXT[],
    "image" TEXT,
    "audio" JSONB NOT NULL DEFAULT '{}',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CulturePackVersion" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "items" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CulturePackVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationLog_patientId_createdAt_idx" ON "NotificationLog"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "VisitNote_patientId_visitedAt_idx" ON "VisitNote"("patientId", "visitedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CulturePack_region_key" ON "CulturePack"("region");

-- CreateIndex
CREATE INDEX "ContentItem_packId_category_idx" ON "ContentItem"("packId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "CulturePackVersion_packId_version_key" ON "CulturePackVersion"("packId", "version");

-- CreateIndex
CREATE INDEX "Alert_occurrenceId_idx" ON "Alert"("occurrenceId");

-- CreateIndex
CREATE INDEX "Consent_patientId_scope_idx" ON "Consent"("patientId", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitNote" ADD CONSTRAINT "VisitNote_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitNote" ADD CONSTRAINT "VisitNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_packId_fkey" FOREIGN KEY ("packId") REFERENCES "CulturePack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CulturePackVersion" ADD CONSTRAINT "CulturePackVersion_packId_fkey" FOREIGN KEY ("packId") REFERENCES "CulturePack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep the previous behaviour for existing reminders: only medicine and appointment reminders alert the team.
UPDATE "Reminder" SET "alertIfMissed" = ("kind" IN ('MEDICINE', 'APPOINTMENT'));
