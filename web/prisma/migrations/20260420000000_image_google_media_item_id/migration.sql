-- AlterTable
ALTER TABLE "images" ADD COLUMN "googleMediaItemId" TEXT;

-- CreateIndex
CREATE INDEX "images_entryId_googleMediaItemId_idx" ON "images"("entryId", "googleMediaItemId");
