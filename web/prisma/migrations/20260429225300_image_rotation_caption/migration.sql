-- AlterTable
ALTER TABLE "images"
ADD COLUMN "rotationQuarterTurns" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "caption" TEXT NOT NULL DEFAULT '';

