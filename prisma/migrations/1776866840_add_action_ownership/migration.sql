-- Add ownership fields to Action model
ALTER TABLE "actions" ADD COLUMN "owner_id" UUID NOT NULL;
ALTER TABLE "actions" ADD COLUMN "assigned_at" TIMESTAMP(3) NOT NULL;

-- Add index on owner_id
CREATE INDEX "actions_owner_id_idx" ON "actions"("owner_id");

-- Add foreign key constraint for owner_id
ALTER TABLE "actions" ADD CONSTRAINT "actions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
