-- Align memory backfill columns with Prisma defaults (quoted camelCase on chat_threads).
-- Handles: (1) DBs that applied snake_case ADD from 20260419200000, (2) DBs with no columns yet.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'chat_threads' AND c.column_name = 'memory_chat_backfill_at'
  ) THEN
    ALTER TABLE "chat_threads" RENAME COLUMN "memory_chat_backfill_at" TO "memoryChatBackfillAt";
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'chat_threads' AND c.column_name = 'memory_chat_backfill_msg_count'
  ) THEN
    ALTER TABLE "chat_threads" RENAME COLUMN "memory_chat_backfill_msg_count" TO "memoryChatBackfillMsgCount";
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'chat_threads' AND c.column_name = 'memoryChatBackfillAt'
  ) THEN
    ALTER TABLE "chat_threads" ADD COLUMN "memoryChatBackfillAt" TIMESTAMP(3);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'chat_threads' AND c.column_name = 'memoryChatBackfillMsgCount'
  ) THEN
    ALTER TABLE "chat_threads" ADD COLUMN "memoryChatBackfillMsgCount" INTEGER;
  END IF;
END $$;
