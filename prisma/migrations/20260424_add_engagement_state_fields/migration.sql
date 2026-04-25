-- Add engagement state tracking fields
ALTER TABLE "engagements" ADD COLUMN "is_blocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "engagements" ADD COLUMN "blocker_reason" TEXT;
ALTER TABLE "engagements" ADD COLUMN "blocked_at" TIMESTAMP(3);

-- Create index on is_blocked for quick filtering
CREATE INDEX "engagements_is_blocked_idx" ON "engagements"("is_blocked");
