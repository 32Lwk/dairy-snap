-- CreateTable
CREATE TABLE "security_reviews" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "entryId" TEXT,
    "severity" TEXT NOT NULL,
    "categories" JSONB NOT NULL DEFAULT '[]',
    "model" TEXT,
    "userFacingSummaryJa" TEXT,
    "internalNote" TEXT,
    "syncRuleTags" JSONB NOT NULL DEFAULT '[]',
    "llmInvoked" BOOLEAN NOT NULL DEFAULT false,
    "replacedContent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "security_reviews_messageId_key" ON "security_reviews"("messageId");

-- CreateIndex
CREATE INDEX "security_reviews_userId_createdAt_idx" ON "security_reviews"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "security_reviews_threadId_createdAt_idx" ON "security_reviews"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "security_reviews" ADD CONSTRAINT "security_reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_reviews" ADD CONSTRAINT "security_reviews_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
