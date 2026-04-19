-- アプリ内のみのカレンダーと予定（Google には同期しない）

CREATE TABLE "app_local_calendars" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_local_calendars_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_local_calendar_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "startIso" TEXT NOT NULL,
    "endIso" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_local_calendar_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "app_local_calendars_userId_idx" ON "app_local_calendars"("userId");

CREATE INDEX "app_local_calendar_events_userId_calendarId_idx" ON "app_local_calendar_events"("userId", "calendarId");

CREATE INDEX "app_local_calendar_events_userId_startAt_idx" ON "app_local_calendar_events"("userId", "startAt");

ALTER TABLE "app_local_calendars" ADD CONSTRAINT "app_local_calendars_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_local_calendar_events" ADD CONSTRAINT "app_local_calendar_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_local_calendar_events" ADD CONSTRAINT "app_local_calendar_events_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "app_local_calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;
