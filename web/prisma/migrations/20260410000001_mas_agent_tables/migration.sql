-- AlterTable: ChatMessage add agentName
ALTER TABLE "chat_messages" ADD COLUMN "agentName" TEXT;

-- AlterTable: UsageCounter add orchestratorCalls
ALTER TABLE "usage_counters" ADD COLUMN "orchestratorCalls" INTEGER NOT NULL DEFAULT 0;

-- CreateTable: agent_memories
CREATE TABLE "agent_memories" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "memoryKey" TEXT NOT NULL,
    "memoryValue" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable: agent_evaluations
CREATE TABLE "agent_evaluations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "agentsUsed" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "routingScore" DOUBLE PRECISION,
    "qualityScore" DOUBLE PRECISION,
    "personaScore" DOUBLE PRECISION,
    "notes" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_memories_userId_domain_memoryKey_key" ON "agent_memories"("userId", "domain", "memoryKey");
CREATE INDEX "agent_memories_userId_domain_idx" ON "agent_memories"("userId", "domain");
CREATE INDEX "agent_evaluations_userId_createdAt_idx" ON "agent_evaluations"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_evaluations" ADD CONSTRAINT "agent_evaluations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
