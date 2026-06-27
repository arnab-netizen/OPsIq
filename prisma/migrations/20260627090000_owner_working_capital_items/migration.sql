-- Owner working-capital ageing line items (Dynamic Budget ageing slice).
-- Manual / import-ready source data (NOT a live bank/accounting feed).
-- Workspace-scoped; cascades with the owning business.

DO $$
BEGIN
  IF to_regclass('public.owner_working_capital_items') IS NULL THEN
    CREATE TABLE "owner_working_capital_items" (
      "id" UUID NOT NULL,
      "workspace_id" UUID NOT NULL,
      "business_id" UUID NOT NULL,
      "kind" TEXT NOT NULL,
      "counterparty" TEXT NOT NULL,
      "amount" DOUBLE PRECISION NOT NULL,
      "due_date" TIMESTAMP(3),
      "status" TEXT NOT NULL DEFAULT 'open',
      "source_type" TEXT NOT NULL DEFAULT 'MANUAL',
      "source_ref" TEXT,
      "confidence_state" TEXT NOT NULL DEFAULT 'unverified',
      "created_by" UUID,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "owner_working_capital_items_pkey" PRIMARY KEY ("id")
    );

    CREATE INDEX "owner_working_capital_items_workspace_id_idx"
      ON "owner_working_capital_items" ("workspace_id");
    CREATE INDEX "owner_working_capital_items_workspace_id_business_id_idx"
      ON "owner_working_capital_items" ("workspace_id", "business_id");
    CREATE INDEX "owner_working_capital_items_workspace_id_business_id_kind_idx"
      ON "owner_working_capital_items" ("workspace_id", "business_id", "kind");

    ALTER TABLE "owner_working_capital_items"
      ADD CONSTRAINT "owner_working_capital_items_business_id_fkey"
      FOREIGN KEY ("business_id") REFERENCES "owner_businesses" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
