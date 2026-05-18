-- Phase 1.3 — Initial database migration
-- Run: npx prisma migrate dev --name init (requires DATABASE_URL in prisma.config.ts)

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('user', 'admin');
CREATE TYPE "DisputeCategory" AS ENUM ('contract', 'small_claims', 'partnership');
CREATE TYPE "DisputeState" AS ENUM ('draft', 'awaiting_counterparty', 'in_progress', 'under_analysis', 'completed', 'cancelled', 'refunded');
CREATE TYPE "PartyRole" AS ENUM ('initiator', 'respondent');
CREATE TYPE "InvitationStatus" AS ENUM ('pending', 'accepted', 'declined');
CREATE TYPE "BriefStatus" AS ENUM ('not_started', 'in_progress', 'submitted');
CREATE TYPE "SessionStatus" AS ENUM ('active', 'ended');
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'succeeded', 'failed', 'refunded');
CREATE TYPE "AuditEventType" AS ENUM ('dispute_created', 'invitation_sent', 'invitation_accepted', 'invitation_declined', 'brief_draft_saved', 'brief_submitted', 'evaluation_started', 'evaluator_completed', 'opinion_generated', 'payment_created', 'payment_succeeded', 'payment_refunded');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "DisputeCategory" NOT NULL,
    "summary" TEXT NOT NULL,
    "state" "DisputeState" NOT NULL DEFAULT 'draft',
    "stakes" DECIMAL(12,2),
    "initiatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Dispute_initiatorId_idx" ON "Dispute"("initiatorId");
CREATE INDEX "Dispute_state_idx" ON "Dispute"("state");

ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_initiatorId_fkey"
    FOREIGN KEY ("initiatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "Party" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "userId" TEXT,
    "role" "PartyRole" NOT NULL,
    "invitationToken" TEXT,
    "invitationStatus" "InvitationStatus" NOT NULL DEFAULT 'pending',
    "briefStatus" "BriefStatus" NOT NULL DEFAULT 'not_started',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Party_invitationToken_key" ON "Party"("invitationToken");
CREATE INDEX "Party_disputeId_idx" ON "Party"("disputeId");
CREATE INDEX "Party_invitationToken_idx" ON "Party"("invitationToken");

ALTER TABLE "Party" ADD CONSTRAINT "Party_disputeId_fkey"
    FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Party" ADD CONSTRAINT "Party_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "Brief" (
    "id" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "status" "BriefStatus" NOT NULL DEFAULT 'in_progress',
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Brief_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Brief_partyId_key" ON "Brief"("partyId");
CREATE INDEX "Brief_disputeId_idx" ON "Brief"("disputeId");

ALTER TABLE "Brief" ADD CONSTRAINT "Brief_partyId_fkey"
    FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "BriefPrepSession" (
    "id" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "llmProvider" TEXT NOT NULL,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "status" "SessionStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BriefPrepSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BriefPrepSession_partyId_idx" ON "BriefPrepSession"("partyId");
CREATE INDEX "BriefPrepSession_disputeId_idx" ON "BriefPrepSession"("disputeId");

ALTER TABLE "BriefPrepSession" ADD CONSTRAINT "BriefPrepSession_partyId_fkey"
    FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "EvaluatorOutput" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "llmProvider" TEXT NOT NULL,
    "structuredOutput" JSONB NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "cost" DECIMAL(10,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvaluatorOutput_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EvaluatorOutput_disputeId_idx" ON "EvaluatorOutput"("disputeId");

-- CreateTable
CREATE TABLE "Opinion" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "executiveSummary" TEXT NOT NULL,
    "partyAAnalysis" JSONB NOT NULL,
    "partyBAnalysis" JSONB NOT NULL,
    "comparativeAssessment" JSONB NOT NULL,
    "confidenceScore" INTEGER NOT NULL,
    "aggregatorAgreement" DECIMAL(5,4) NOT NULL,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Opinion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Opinion_disputeId_key" ON "Opinion"("disputeId");

ALTER TABLE "Opinion" ADD CONSTRAINT "Opinion_disputeId_fkey"
    FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountUsd" DECIMAL(10,2) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "stripePaymentIntentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Payment_stripePaymentIntentId_key" ON "Payment"("stripePaymentIntentId");
CREATE INDEX "Payment_disputeId_idx" ON "Payment"("disputeId");
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_disputeId_fkey"
    FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "eventType" "AuditEventType" NOT NULL,
    "actorId" TEXT,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "eventData" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditEvent_resourceType_resourceId_idx" ON "AuditEvent"("resourceType", "resourceId");
CREATE INDEX "AuditEvent_actorId_idx" ON "AuditEvent"("actorId");
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
