-- CreateTable
CREATE TABLE "memory_short_term" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "bullets" JSONB NOT NULL,
    "salience" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "dedupKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memory_short_term_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "memory_short_term_userId_entryId_idx" ON "memory_short_term"("userId", "entryId");

-- CreateIndex
CREATE INDEX "memory_short_term_entryId_idx" ON "memory_short_term"("entryId");

-- AddForeignKey
ALTER TABLE "memory_short_term" ADD CONSTRAINT "memory_short_term_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "memory_short_term" ADD CONSTRAINT "memory_short_term_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "daily_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "memory_long_term_userId_sourceEntryId_idx" ON "memory_long_term"("userId", "sourceEntryId");

-- AddForeignKey (optional source entry)
ALTER TABLE "memory_long_term" ADD CONSTRAINT "memory_long_term_sourceEntryId_fkey" FOREIGN KEY ("sourceEntryId") REFERENCES "daily_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
