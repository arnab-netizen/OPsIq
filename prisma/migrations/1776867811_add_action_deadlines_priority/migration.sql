-- Add deadline and priority fields to Action model
ALTER TABLE "actions" ADD COLUMN "due_at" TIMESTAMP(3) NOT NULL;
ALTER TABLE "actions" ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'medium';

-- Add indexes on new columns
CREATE INDEX "actions_due_at_idx" ON "actions"("due_at");
CREATE INDEX "actions_priority_idx" ON "actions"("priority");
