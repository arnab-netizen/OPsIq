-- Stage 3C: StockItem catalog (M014) and PurchaseOrder lifecycle (M015)

CREATE TABLE "stock_items" (
  "id"             UUID        NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"   UUID        NOT NULL,
  "business_id"    UUID        NOT NULL,
  "sku"            VARCHAR(100) NOT NULL,
  "name"           VARCHAR(200) NOT NULL,
  "unit"           VARCHAR(50)  NOT NULL DEFAULT 'unit',
  "current_qty"    DECIMAL(18,4) NOT NULL DEFAULT 0,
  "reorder_point"  DECIMAL(18,4) NOT NULL DEFAULT 0,
  "safety_stock"   DECIMAL(18,4) NOT NULL DEFAULT 0,
  "lead_time_days" INTEGER      NOT NULL DEFAULT 0,
  "daily_usage"    DECIMAL(18,4) NOT NULL DEFAULT 0,
  "vendor_id"      UUID,
  "notes"          TEXT,
  "created_at"     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"     TIMESTAMPTZ  NOT NULL,
  CONSTRAINT "stock_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stock_items_workspace_business_sku" ON "stock_items"("workspace_id", "business_id", "sku");
CREATE INDEX "stock_items_workspace_business_idx" ON "stock_items"("workspace_id", "business_id");

CREATE TABLE "purchase_orders" (
  "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"   UUID         NOT NULL,
  "business_id"    UUID         NOT NULL,
  "po_number"      VARCHAR(100) NOT NULL,
  "vendor_id"      UUID,
  "vendor_name"    VARCHAR(200),
  "status"         TEXT         NOT NULL DEFAULT 'DRAFT',
  "line_items"     JSONB        NOT NULL DEFAULT '[]',
  "total_amount"   DECIMAL(18,2),
  "currency"       VARCHAR(10)  NOT NULL DEFAULT 'USD',
  "notes"          TEXT,
  "approved_by_id" UUID,
  "approved_at"    TIMESTAMPTZ,
  "issued_at"      TIMESTAMPTZ,
  "delivered_at"   TIMESTAMPTZ,
  "created_by"     UUID         NOT NULL,
  "created_at"     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"     TIMESTAMPTZ  NOT NULL,
  CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "purchase_orders_workspace_po_number" ON "purchase_orders"("workspace_id", "po_number");
CREATE INDEX "purchase_orders_workspace_business_idx" ON "purchase_orders"("workspace_id", "business_id");
CREATE INDEX "purchase_orders_workspace_status_idx" ON "purchase_orders"("workspace_id", "status");
