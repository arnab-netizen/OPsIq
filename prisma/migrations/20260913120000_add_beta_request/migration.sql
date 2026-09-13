-- CreateTable: anonymous controlled-beta access requests captured from the
-- public marketing homepage. Additive-only migration -- no existing table is
-- touched, so this carries no risk to any existing row or read path.
--
-- Root of this table (controlled-beta homepage capture PR): the previous
-- cold-traffic path sent every visitor straight to full /signup. There is no
-- existing model that fits an anonymous, pre-account capture -- LeadRecord
-- requires workspace scoping and an authenticated actor (B2B sales lead),
-- User requires a password and full workspace/membership graph, and
-- CustomerRecord is scoped to a tenant's own customers. `email` carries a
-- database-level UNIQUE constraint (not just application-layer
-- normalization) so a concurrent duplicate submission of the same normalized
-- address can never create more than one row, mirroring the same
-- belt-and-suspenders pattern already used for User.email elsewhere in this
-- schema.
CREATE TABLE "beta_requests" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "first_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "utm_source" TEXT,
    "utm_medium" TEXT,
    "utm_campaign" TEXT,
    "utm_content" TEXT,
    "qualification" JSONB,
    "invited_at" TIMESTAMP(3),
    "invited_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "beta_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "beta_requests_email_key" ON "beta_requests"("email");

-- CreateIndex
CREATE INDEX "beta_requests_status_created_at_idx" ON "beta_requests"("status", "created_at");
