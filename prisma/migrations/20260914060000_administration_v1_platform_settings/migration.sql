-- Administration V1 — beta operating control plane.
--
-- Additive only. Creates NO rows in platform_settings — the governed
-- bootstrap action (a capability-gated, human-confirmed application action,
-- not this migration) is the sole writer of that singleton row, and it
-- captures the live-resolved legacy env values rather than any value chosen
-- here. Until that action runs, application code falls back to the existing
-- PUBLIC_BETA_WORKSPACE_CAP / PUBLIC_BETA_ENABLED behavior unchanged.

-- BetaRequest: admission/request-lifecycle-only columns (revoke/reject).
ALTER TABLE "beta_requests" ADD COLUMN "revoked_at" TIMESTAMP(3);
ALTER TABLE "beta_requests" ADD COLUMN "revoked_by" TEXT;
ALTER TABLE "beta_requests" ADD COLUMN "rejected_at" TIMESTAMP(3);
ALTER TABLE "beta_requests" ADD COLUMN "rejected_by" TEXT;

-- PlatformSetting: singleton row (id pinned to 'global'), zero rows seeded.
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "admission_mode" TEXT NOT NULL,
    "capacity_limit" INTEGER NOT NULL,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- CapacityAlertState: singleton row (id pinned to 'global'), zero rows seeded.
CREATE TABLE "capacity_alert_state" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "last_threshold_sent" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "capacity_alert_state_pkey" PRIMARY KEY ("id")
);
