CREATE TABLE "google_photo_selections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entryId" TEXT,
    "entryDateYmd" TEXT NOT NULL,
    "providerSessionId" TEXT,
    "mediaItemId" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "productUrl" TEXT,
    "mimeType" TEXT,
    "filename" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "creationTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_photo_selections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "google_photo_selections_userId_entryDateYmd_mediaItemId_key"
ON "google_photo_selections"("userId", "entryDateYmd", "mediaItemId");

CREATE INDEX "google_photo_selections_userId_entryDateYmd_idx"
ON "google_photo_selections"("userId", "entryDateYmd");

CREATE INDEX "google_photo_selections_entryId_idx"
ON "google_photo_selections"("entryId");

ALTER TABLE "google_photo_selections"
ADD CONSTRAINT "google_photo_selections_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "google_photo_selections"
ADD CONSTRAINT "google_photo_selections_entryId_fkey"
FOREIGN KEY ("entryId") REFERENCES "daily_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
