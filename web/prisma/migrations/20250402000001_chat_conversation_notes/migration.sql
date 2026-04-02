-- AlterTable
ALTER TABLE "chat_threads" ADD COLUMN IF NOT EXISTS "conversationNotes" JSONB NOT NULL DEFAULT '{}';
