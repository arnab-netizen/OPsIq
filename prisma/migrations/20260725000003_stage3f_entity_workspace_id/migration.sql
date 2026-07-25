-- Stage 3F M018: Add workspace_id to entities for multi-tenant isolation.
-- Table is unused in production code; any orphaned rows receive gen_random_uuid() default
-- so the NOT NULL constraint can be applied immediately.

ALTER TABLE "entities" ADD COLUMN "workspace_id" UUID;
UPDATE "entities" SET "workspace_id" = gen_random_uuid() WHERE "workspace_id" IS NULL;
ALTER TABLE "entities" ALTER COLUMN "workspace_id" SET NOT NULL;
CREATE INDEX "entities_workspace_id_idx" ON "entities"("workspace_id");
