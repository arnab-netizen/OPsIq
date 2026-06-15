-- CreateTable PrivateModeAccess
CREATE TABLE "private_mode_access" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role" TEXT NOT NULL,
  "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "granted_by" UUID,
  "revoked_at" TIMESTAMP(3),
  "revoked_by" UUID,
  "revoke_reason" TEXT,
  "approval_status" TEXT NOT NULL DEFAULT 'pending',
  "approved_at" TIMESTAMP(3),
  "approved_by" UUID,
  "rejection_reason" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "private_mode_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex on workspace_id, user_id (unique pair)
CREATE UNIQUE INDEX "private_mode_access_workspace_id_user_id_key" ON "private_mode_access"("workspace_id", "user_id");

-- CreateIndex on workspace_id
CREATE INDEX "private_mode_access_workspace_id_idx" ON "private_mode_access"("workspace_id");

-- CreateIndex on user_id
CREATE INDEX "private_mode_access_user_id_idx" ON "private_mode_access"("user_id");

-- CreateIndex on role
CREATE INDEX "private_mode_access_role_idx" ON "private_mode_access"("role");

-- CreateIndex on approval_status
CREATE INDEX "private_mode_access_approval_status_idx" ON "private_mode_access"("approval_status");

-- CreateIndex on granted_at
CREATE INDEX "private_mode_access_granted_at_idx" ON "private_mode_access"("granted_at");

-- CreateIndex on revoked_at
CREATE INDEX "private_mode_access_revoked_at_idx" ON "private_mode_access"("revoked_at");

-- AddForeignKey
ALTER TABLE "private_mode_access" ADD CONSTRAINT "private_mode_access_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "client_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
