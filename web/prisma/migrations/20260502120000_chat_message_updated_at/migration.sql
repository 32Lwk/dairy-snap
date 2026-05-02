-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN "updatedAt" TIMESTAMP(3);

UPDATE "chat_messages" SET "updatedAt" = "createdAt";

ALTER TABLE "chat_messages" ALTER COLUMN "updatedAt" SET NOT NULL;
