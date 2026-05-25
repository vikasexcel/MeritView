-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "disputeId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "stripeSessionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripeSessionId_key" ON "Payment"("stripeSessionId");
