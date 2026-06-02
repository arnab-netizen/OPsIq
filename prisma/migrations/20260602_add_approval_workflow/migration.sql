-- Add approval request workflow for high-impact decisions

CREATE TABLE "approval_requests" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "operator_item_id" UUID NOT NULL,
  "requested_by" UUID NOT NULL,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approver_user_id" UUID NOT NULL,
  "approval_status" TEXT NOT NULL DEFAULT 'pending',
  "approval_decision" TEXT,
  "approved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "approval_requests_operator_item_id_fkey" FOREIGN KEY ("operator_item_id") REFERENCES "operator_items"("id") ON DELETE CASCADE,
  CONSTRAINT "approval_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "approval_requests_approver_user_id_fkey" FOREIGN KEY ("approver_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);

-- Unique constraint: only one active approval per operator item and approver
CREATE UNIQUE INDEX "approval_requests_operator_item_approver_key" ON "approval_requests"("operator_item_id", "approver_user_id");

-- Indexes for querying approvals
CREATE INDEX "approval_requests_approval_status_idx" ON "approval_requests"("approval_status");
CREATE INDEX "approval_requests_approver_status_idx" ON "approval_requests"("approver_user_id", "approval_status");
CREATE INDEX "approval_requests_requested_at_idx" ON "approval_requests"("requested_at");
