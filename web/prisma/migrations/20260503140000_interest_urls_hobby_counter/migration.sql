-- AlterTable
ALTER TABLE "usage_counters" ADD COLUMN "hobbyExternalFetches" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "user_interest_official_urls" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pickId" VARCHAR(160) NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_interest_official_urls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interest_url_fetch_cache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "urlNorm" VARCHAR(2048) NOT NULL,
    "urlHash" VARCHAR(64) NOT NULL,
    "pickId" VARCHAR(160),
    "httpStatus" INTEGER,
    "excerpt" TEXT NOT NULL DEFAULT '',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interest_url_fetch_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_interest_official_urls_userId_pickId_url_key" ON "user_interest_official_urls"("userId", "pickId", "url");

-- CreateIndex
CREATE INDEX "user_interest_official_urls_userId_pickId_idx" ON "user_interest_official_urls"("userId", "pickId");

-- CreateIndex
CREATE UNIQUE INDEX "interest_url_fetch_cache_userId_urlHash_key" ON "interest_url_fetch_cache"("userId", "urlHash");

-- CreateIndex
CREATE INDEX "interest_url_fetch_cache_userId_fetchedAt_idx" ON "interest_url_fetch_cache"("userId", "fetchedAt");

-- AddForeignKey
ALTER TABLE "user_interest_official_urls" ADD CONSTRAINT "user_interest_official_urls_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interest_url_fetch_cache" ADD CONSTRAINT "interest_url_fetch_cache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
