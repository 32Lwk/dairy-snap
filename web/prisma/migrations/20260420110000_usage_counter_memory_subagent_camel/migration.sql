-- Prisma expects quoted camelCase on usage_counters (same as orchestratorCalls).
-- Legacy 20260419190000 added memory_sub_agent_calls; rename if present, else add camel column.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'usage_counters' AND c.column_name = 'memory_sub_agent_calls'
  ) THEN
    ALTER TABLE "usage_counters" RENAME COLUMN "memory_sub_agent_calls" TO "memorySubAgentCalls";
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'usage_counters' AND c.column_name = 'memorySubAgentCalls'
  ) THEN
    ALTER TABLE "usage_counters" ADD COLUMN "memorySubAgentCalls" INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;
