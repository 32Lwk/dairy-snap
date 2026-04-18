-- AlterTable
ALTER TABLE "google_calendar_event_cache" ADD COLUMN "eventPayload" JSONB,
ADD COLUMN "eventSearchBlob" TEXT NOT NULL DEFAULT '';
