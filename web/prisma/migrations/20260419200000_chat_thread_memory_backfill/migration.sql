-- Track chat history memory backfill so we do not re-run on the same snapshot
ALTER TABLE "chat_threads" ADD COLUMN "memory_chat_backfill_at" TIMESTAMP(3);
ALTER TABLE "chat_threads" ADD COLUMN "memory_chat_backfill_msg_count" INTEGER;
