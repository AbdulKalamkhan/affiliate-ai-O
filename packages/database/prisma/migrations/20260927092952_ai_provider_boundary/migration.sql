-- CreateTable
CREATE TABLE "ai_invocations" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "providerStatus" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "promptChars" INTEGER,
    "responseChars" INTEGER,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "costUsd" DECIMAL(10,6),
    "costState" TEXT NOT NULL DEFAULT 'unknown_usage',
    "latencyMs" INTEGER,
    "finishReason" TEXT,
    "requestPreview" JSONB,
    "responsePreview" JSONB,
    "errorCode" TEXT,
    "errorDetail" TEXT,
    "actor" TEXT,
    "autonomyLevel" INTEGER,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_invocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_invocations_provider_createdAt_idx" ON "ai_invocations"("provider", "createdAt");

-- CreateIndex
CREATE INDEX "ai_invocations_status_createdAt_idx" ON "ai_invocations"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ai_invocations_model_createdAt_idx" ON "ai_invocations"("model", "createdAt");
