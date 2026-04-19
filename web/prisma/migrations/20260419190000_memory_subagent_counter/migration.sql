-- Count memory sub-agent LLM runs per day (for future rate limits)
ALTER TABLE "usage_counters" ADD COLUMN "memory_sub_agent_calls" INTEGER NOT NULL DEFAULT 0;
