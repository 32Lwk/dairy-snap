-- AlterTable
ALTER TABLE "daily_entries" ADD COLUMN "plutchikAnalysis" JSONB;
ALTER TABLE "daily_entries" ADD COLUMN "dominantEmotion" TEXT;

-- CreateIndex
CREATE INDEX "daily_entries_userId_dominantEmotion_idx" ON "daily_entries"("userId", "dominantEmotion");
