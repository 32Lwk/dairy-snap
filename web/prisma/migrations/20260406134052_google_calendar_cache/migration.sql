-- CreateTable
CREATE TABLE "google_calendar_event_cache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "startIso" TEXT NOT NULL,
    "endIso" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAtGcal" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_calendar_event_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_calendar_sync_state" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_calendar_sync_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "google_calendar_event_cache_userId_startAt_idx" ON "google_calendar_event_cache"("userId", "startAt");

-- CreateIndex
CREATE INDEX "google_calendar_event_cache_userId_endAt_idx" ON "google_calendar_event_cache"("userId", "endAt");

-- CreateIndex
CREATE UNIQUE INDEX "google_calendar_event_cache_userId_calendarId_eventId_key" ON "google_calendar_event_cache"("userId", "calendarId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "google_calendar_sync_state_userId_calendarId_key" ON "google_calendar_sync_state"("userId", "calendarId");

-- AddForeignKey
ALTER TABLE "google_calendar_event_cache" ADD CONSTRAINT "google_calendar_event_cache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_calendar_sync_state" ADD CONSTRAINT "google_calendar_sync_state_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
