-- AlterTable
ALTER TABLE "ai_artifacts" ADD COLUMN     "policyVersion" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "evaluationFullLogOptIn" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "turn_context_snapshots" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "entryId" TEXT,
    "userMessageId" TEXT,
    "assistantMessageId" TEXT,
    "promptVersion" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "toolCardsJson" JSONB NOT NULL,
    "digest" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "turn_context_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_eval_samples" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userMessageId" TEXT NOT NULL,
    "assistantMessageId" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "userContent" TEXT NOT NULL,
    "assistantContent" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "label" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_eval_samples_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "turn_context_snapshots_userId_createdAt_idx" ON "turn_context_snapshots"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "turn_context_snapshots_threadId_createdAt_idx" ON "turn_context_snapshots"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "conversation_eval_samples_userId_createdAt_idx" ON "conversation_eval_samples"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "conversation_eval_samples_threadId_createdAt_idx" ON "conversation_eval_samples"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "turn_context_snapshots" ADD CONSTRAINT "turn_context_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_eval_samples" ADD CONSTRAINT "conversation_eval_samples_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
