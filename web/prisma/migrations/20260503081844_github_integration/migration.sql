-- CreateTable
CREATE TABLE "github_connections" (
    "userId" TEXT NOT NULL,
    "githubUserId" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT '',
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "lastHttpStatus" INTEGER,
    "eventsEtag" TEXT,
    "contributionsOldestYearSynced" INTEGER NOT NULL DEFAULT 0,
    "syncSuccessCount" INTEGER NOT NULL DEFAULT 0,
    "syncFailCount" INTEGER NOT NULL DEFAULT 0,
    "rateLimitHits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "github_connections_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "github_contribution_days" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dateYmd" TEXT NOT NULL,
    "contributionCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "github_contribution_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "github_daily_snapshots" (
    "userId" TEXT NOT NULL,
    "dateYmd" TEXT NOT NULL,
    "summary" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "github_daily_snapshots_pkey" PRIMARY KEY ("userId","dateYmd")
);

-- CreateIndex
CREATE INDEX "github_contribution_days_userId_dateYmd_idx" ON "github_contribution_days"("userId", "dateYmd");

-- CreateIndex
CREATE UNIQUE INDEX "github_contribution_days_userId_dateYmd_key" ON "github_contribution_days"("userId", "dateYmd");

-- AddForeignKey
ALTER TABLE "github_connections" ADD CONSTRAINT "github_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_contribution_days" ADD CONSTRAINT "github_contribution_days_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_daily_snapshots" ADD CONSTRAINT "github_daily_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
