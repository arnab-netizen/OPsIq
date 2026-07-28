-- S7-DC11: Distributed rate limit buckets
-- Token bucket state shared across all serverless instances via PostgreSQL.
-- Atomic update (INSERT ... ON CONFLICT DO UPDATE) prevents double-spend without row-level locks.

CREATE TABLE IF NOT EXISTS "rate_limit_buckets" (
    "key"            VARCHAR(255) NOT NULL,
    "tokens"         DOUBLE PRECISION NOT NULL,
    "last_refill_at" TIMESTAMPTZ NOT NULL,
    "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"     TIMESTAMPTZ NOT NULL,
    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key")
);

-- Index for future TTL sweeps (sweep rows not updated in > 2 hours)
CREATE INDEX IF NOT EXISTS "rate_limit_buckets_updated_at_idx"
    ON "rate_limit_buckets" ("updated_at");
