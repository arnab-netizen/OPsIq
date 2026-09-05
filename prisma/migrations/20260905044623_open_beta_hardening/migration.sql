-- Open beta hardening: email verification, policy acceptance, feedback, privacy requests.
-- All changes are additive and nullable/defaulted — no existing row is altered in meaning,
-- no existing account is retroactively locked out.

-- AlterTable: User gains email-verification state, defaulted so every existing account is
-- unaffected (requiresEmailVerification defaults false; emailVerifiedAt defaults null).
ALTER TABLE "users" ADD COLUMN "email_verified_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "requires_email_verification" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: Workspace gains a nullable beta-signup provenance marker. Existing workspaces
-- get NULL (excluded from the beta cap count by construction, not by a separate filter).
ALTER TABLE "workspaces" ADD COLUMN "signup_source" TEXT;

-- CreateTable: EmailVerificationToken (sha256-hashed at rest, single-use, expiring — same
-- shape as password_reset_tokens, deliberately a separate table so a password-reset token
-- can never be redeemed as an email-verification token or vice versa).
CREATE TABLE "email_verification_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_verification_tokens_token_hash_key" ON "email_verification_tokens"("token_hash");
CREATE INDEX "email_verification_tokens_user_id_idx" ON "email_verification_tokens"("user_id");
CREATE INDEX "email_verification_tokens_expires_at_idx" ON "email_verification_tokens"("expires_at");

ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: PolicyAcceptance (durable, server-recorded terms/privacy/beta-notice acceptance).
CREATE TABLE "policy_acceptances" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "policy_type" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,

    CONSTRAINT "policy_acceptances_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "policy_acceptances_user_id_idx" ON "policy_acceptances"("user_id");

ALTER TABLE "policy_acceptances" ADD CONSTRAINT "policy_acceptances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: PlatformFeedback ("send beta feedback" / "report a problem" surface).
CREATE TABLE "platform_feedback" (
    "id" UUID NOT NULL,
    "workspace_id" UUID,
    "user_id" UUID,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "route" TEXT,
    "build_sha" TEXT,
    "expected_result" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_feedback_workspace_id_idx" ON "platform_feedback"("workspace_id");
CREATE INDEX "platform_feedback_status_created_at_idx" ON "platform_feedback"("status", "created_at");

-- CreateTable: PrivacyRequest (access/export, deletion, correction requests; manual fulfillment).
CREATE TABLE "privacy_requests" (
    "id" UUID NOT NULL,
    "request_type" TEXT NOT NULL,
    "user_id" UUID,
    "email" TEXT NOT NULL,
    "detail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "handled_by" TEXT,
    "handled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "privacy_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "privacy_requests_status_created_at_idx" ON "privacy_requests"("status", "created_at");
CREATE INDEX "privacy_requests_user_id_idx" ON "privacy_requests"("user_id");
