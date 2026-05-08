-- Add workspace_id column to engagements table
ALTER TABLE "engagements"
ADD COLUMN IF NOT EXISTS "workspace_id" UUID;

-- Add FK constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'engagements_workspace_id_fkey'
  ) THEN
    ALTER TABLE "engagements"
    ADD CONSTRAINT "engagements_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
