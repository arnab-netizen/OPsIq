# S7-I23 — Production Config Inventory & Classification

**Item**: 23 of the Owner-Operational Completion Program  
**Date**: 2026-08-08  
**Branch**: claude/owner-operational-completion  
**Status**: COMPLETE

---

## Classification key

| Label | Meaning |
|---|---|
| `REQUIRED_OWNER_RUNTIME` | Must be set by the owner before production can serve requests; absence causes startup failure or silent security gap |
| `OPTIONAL_RECOMMENDED` | Has a safe default or fallback; strongly recommended for production but not a boot blocker |
| `OPTIONAL_FEATURE` | Only needed when the associated feature is enabled; safe to omit |
| `PRIVATE_DEPLOY_ONLY` | Only for the private single-operator build; MUST NOT be set in multi-tenant SaaS |
| `TEST_ONLY` | Dev/CI only; MUST NOT be set in production |
| `DEPRECATED` | Retained for documentation only; not read by runtime code |

---

## Full classified inventory

### 1. Database

| Variable | Classification | Notes |
|---|---|---|
| `DATABASE_URL` | `REQUIRED_OWNER_RUNTIME` | Pooled runtime URL; app will not boot without it |
| `MIGRATION_DATABASE_URL` | `REQUIRED_OWNER_RUNTIME` | Direct (non-pooler) URL for `prisma migrate deploy`; if unset, Prisma falls back to DATABASE_URL (breaks advisory-lock DDL on Neon) |
| `TEST_DATABASE_URL` / `DATABASE_URL_TEST` | `TEST_ONLY` | Separate DB for test suite; falls back to DATABASE_URL if unset |
| `DIRECT_URL` | `DEPRECATED` | Not read by `prisma.config.ts`; use `MIGRATION_DATABASE_URL` |

### 2. Node environment

| Variable | Classification | Notes |
|---|---|---|
| `NODE_ENV` | `REQUIRED_OWNER_RUNTIME` | Must be `production` in production; controls secure cookie flags, CORS, error verbosity |

### 3. Authentication

| Variable | Classification | Notes |
|---|---|---|
| `AUTH_SECRET` | `OPTIONAL_FEATURE` | Present in config schema for diagnostic checks; not required for database-session auth flow |

### 4. Application URLs

| Variable | Classification | Notes |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `REQUIRED_OWNER_RUNTIME` | Required in production for correct absolute links and OAuth redirect URIs |
| `NEXT_PUBLIC_APP_NAME` | `OPTIONAL_RECOMMENDED` | Defaults to "OpsIQ" |
| `NEXT_PUBLIC_API_URL` | `DEPRECATED` | Legacy alias; not read at runtime; use `NEXT_PUBLIC_APP_URL` |

### 5. Stripe (billing)

| Variable | Classification | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | `OPTIONAL_FEATURE` | Required only if billing is active; absent → billing disabled (warning, not crash) |
| `STRIPE_WEBHOOK_SECRET` | `OPTIONAL_FEATURE` | Required to validate Stripe webhook signatures; absent → webhook endpoint rejects all events |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `OPTIONAL_FEATURE` | Required for client-side Stripe Elements; absent → billing UI non-functional |
| `OAUTH_TOKEN_ENCRYPTION_KEY` | `REQUIRED_OWNER_RUNTIME` | Required before any external connector stores a token; absent → token encrypt/decrypt FAIL CLOSED (throws); must be ≥ 32 bytes decoded |

### 6. AI / LLM providers

| Variable | Classification | Notes |
|---|---|---|
| `OPENAI_API_KEY` | `OPTIONAL_RECOMMENDED` | Absent → `UnavailableAiProvider` active; deterministic fallback runs; no crash |
| `ANTHROPIC_API_KEY` | `OPTIONAL_RECOMMENDED` | Alternative LLM provider; same fail-closed behavior |
| `ANTHROPIC_CHEAP_MODEL` | `OPTIONAL_FEATURE` | Defaults to `claude-haiku-4-5-20251001` |
| `ANTHROPIC_STRONG_MODEL` | `OPTIONAL_FEATURE` | Defaults to `claude-sonnet-5` |
| `OPENAI_CHEAP_MODEL` | `OPTIONAL_FEATURE` | Defaults to `gpt-4o-mini` |
| `OPENAI_STRONG_MODEL` | `OPTIONAL_FEATURE` | Defaults to `gpt-4o` |
| `RESEARCH_PROVIDER` | `OPTIONAL_FEATURE` | `perplexity` or blank |

### 7. Live connectors (external OAuth)

| Variable | Classification | Notes |
|---|---|---|
| `GOOGLE_CLIENT_ID` | `OPTIONAL_FEATURE` | Absent → Google Sheets connector disabled |
| `GOOGLE_CLIENT_SECRET` | `OPTIONAL_FEATURE` | Same; never expose in browser context |
| `GOOGLE_REDIRECT_URI` | `OPTIONAL_FEATURE` | Must match registered OAuth redirect |
| `HUBSPOT_CLIENT_ID` | `OPTIONAL_FEATURE` | Absent → HubSpot connector disabled |
| `HUBSPOT_CLIENT_SECRET` | `OPTIONAL_FEATURE` | Same |
| `HUBSPOT_REDIRECT_URI` | `OPTIONAL_FEATURE` | Must match |
| `QUICKBOOKS_CLIENT_ID` | `OPTIONAL_FEATURE` | Absent → QuickBooks connector disabled |
| `QUICKBOOKS_CLIENT_SECRET` | `OPTIONAL_FEATURE` | Same |
| `QUICKBOOKS_REDIRECT_URI` | `OPTIONAL_FEATURE` | Must match |
| `QUICKBOOKS_ENVIRONMENT` | `OPTIONAL_FEATURE` | `sandbox` or `production` |
| `QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN` | `OPTIONAL_FEATURE` | Absent → webhook endpoint answers 503 (fail-closed); signature secret, never logged |
| `SLACK_BOT_TOKEN` | `OPTIONAL_FEATURE` | Absent → Slack alert delivery disabled |
| `SLACK_DEFAULT_CHANNEL` | `OPTIONAL_FEATURE` | Same |

### 8. Storage

| Variable | Classification | Notes |
|---|---|---|
| `STORAGE_PROVIDER` | `OPTIONAL_RECOMMENDED` | `local` or `s3`; defaults to `local` |
| `STORAGE_LOCAL_PATH` | `OPTIONAL_RECOMMENDED` | Path for local file storage |
| `STORAGE_S3_BUCKET` | `OPTIONAL_FEATURE` | S3 only |
| `STORAGE_S3_REGION` | `OPTIONAL_FEATURE` | S3 only |
| `AWS_ACCESS_KEY_ID` | `OPTIONAL_FEATURE` | S3 storage or CloudWatch; do not set unless those features are active |
| `AWS_SECRET_ACCESS_KEY` | `OPTIONAL_FEATURE` | Same |
| `AWS_REGION` | `OPTIONAL_FEATURE` | Same |

### 9. Email transport

| Variable | Classification | Notes |
|---|---|---|
| `RESEND_API_KEY` | `OPTIONAL_RECOMMENDED` | Absent → in-app-only alert delivery; no data lost |
| `ALERT_FROM_EMAIL` | `OPTIONAL_RECOMMENDED` | Defaults to `alerts@opsiq.app`; must be a verified Resend domain |
| `RESEND_WEBHOOK_SECRET` | `OPTIONAL_FEATURE` | For Resend delivery-status webhooks only |

### 10. Scheduler & webhooks

| Variable | Classification | Notes |
|---|---|---|
| `SCHEDULER_PROVIDER` | `OPTIONAL_RECOMMENDED` | `in-memory` (default) or `database`; in-memory loses tasks on cold start |
| `CRON_SECRET` | `REQUIRED_OWNER_RUNTIME` | Must be set in Vercel env vars; absent → cron endpoint returns 401 on every invocation, no scheduled tasks run; generate with `openssl rand -base64 32` |
| `SCHEDULER_INTERNAL_TOKEN` | `OPTIONAL_FEATURE` | Bearer token for internal scheduler-to-API calls |
| `WEBHOOK_URL` | `OPTIONAL_FEATURE` | Outbound webhook delivery target |

### 11. Logging

| Variable | Classification | Notes |
|---|---|---|
| `LOG_LEVEL` | `OPTIONAL_RECOMMENDED` | Must be `info` or `warn` in production (not `debug`) |
| `LOG_FORMAT` | `OPTIONAL_RECOMMENDED` | `json` for structured log ingestion |

### 12. Observability & monitoring

| Variable | Classification | Notes |
|---|---|---|
| `SENTRY_DSN` | `OPTIONAL_RECOMMENDED` | Error tracking; strongly recommended for production |
| `NEXT_PUBLIC_SENTRY_DSN` | `OPTIONAL_RECOMMENDED` | Client-side Sentry; safe to expose |
| `DECISION_SIGNING_SECRET` | `REQUIRED_OWNER_RUNTIME` | Signs governed decision hashes; absent → signing module FAILS CLOSED (throws); generate with `openssl rand -base64 32` |
| `OPSIQ_DIAGNOSTIC_KEY` | `OPTIONAL_RECOMMENDED` | Gates internal `/api/internal/*` and `/api/ops/*` endpoints; absent → those endpoints stay locked |
| `DATADOG_API_KEY` | `OPTIONAL_FEATURE` | Datadog APM |
| `DATADOG_APP_KEY` | `OPTIONAL_FEATURE` | Same |
| `DATADOG_SITE` | `OPTIONAL_FEATURE` | Defaults to `datadoghq.com` |
| `CLOUDWATCH_ENABLED` | `OPTIONAL_FEATURE` | `false` by default |
| `ENABLE_REQUEST_TRACING` | `OPTIONAL_FEATURE` | Defaults to `false` |
| `CORRELATION_ID_HEADER` | `OPTIONAL_FEATURE` | Defaults to `x-correlation-id` |
| `CACHE_BACKEND` | `OPTIONAL_FEATURE` | `redis` or `memory`; defaults to memory |

### 13. Feature flags

| Variable | Classification | Notes |
|---|---|---|
| `ENABLE_AUDIT_LOGGING` | `OPTIONAL_RECOMMENDED` | Should be `true` in production; default `true` |
| `ENABLE_READINESS_ENFORCEMENT` | `OPTIONAL_RECOMMENDED` | Should be `true`; default `true` |
| `ENABLE_IDEMPOTENCY_CHECKING` | `OPTIONAL_RECOMMENDED` | Should be `true`; default `true` |
| `ENABLE_RATE_LIMITING` | `OPTIONAL_RECOMMENDED` | Default `false`; set `true` in production |
| `ENABLE_METRICS_ENDPOINT` | `OPTIONAL_FEATURE` | Prometheus scrape endpoint |

### 14. Session management

| Variable | Classification | Notes |
|---|---|---|
| `SESSION_EXPIRY_HOURS` | `OPTIONAL_RECOMMENDED` | Defaults to 24; adjust per policy |
| `LOGIN_RATE_LIMIT_MAX_ATTEMPTS` | `OPTIONAL_RECOMMENDED` | Defaults to 5 |

### 15. Signing keys — decision integrity

| Variable | Classification | Notes |
|---|---|---|
| `DECISION_SIGNING_SECRET` | `REQUIRED_OWNER_RUNTIME` | (also listed under §12; authoritative entry here) HMAC secret for decision hash chains; generate with `openssl rand -base64 32`; NEVER hardcode |
| `ASYMMETRIC_PRIVATE_KEY` | `REQUIRED_OWNER_RUNTIME` | **ED25519 PEM — OWNER GENERATES, NEVER IN SOURCE**. Generate on owner-controlled hardware: `openssl genpkey -algorithm ed25519 -out ed25519.key`. Load into secrets manager only. **The previously disclosed key is permanently compromised and must not be used.** |
| `ASYMMETRIC_PUBLIC_KEY` | `REQUIRED_OWNER_RUNTIME` | Ed25519 public key PEM; safe to configure in env; derive from owner-generated private key: `openssl pkey -in ed25519.key -pubout` |

### 16. Data retention TTL overrides

| Variable | Classification | Notes |
|---|---|---|
| `AUDIT_EVENT_TTL_DAYS` | `OPTIONAL_FEATURE` | Defaults to 365 |
| `DECISION_LIFECYCLE_TTL_DAYS` | `OPTIONAL_FEATURE` | Defaults to 90 |
| `LIFECYCLE_EVENT_TTL_DAYS` | `OPTIONAL_FEATURE` | Defaults to 90 |
| `OPERATOR_ITEM_TTL_DAYS` | `OPTIONAL_FEATURE` | Defaults to 180 |

### 17. Security thresholds (calibration)

All 19 `THRESHOLD_*` and `DRIFT_SEVERITY_*` variables:

| Variable | Classification | Notes |
|---|---|---|
| `THRESHOLD_APPROVAL_RATE_CHANGE` | `OPTIONAL_FEATURE` | Overrides compiled default in `src/domain/constants/thresholds.ts` |
| `THRESHOLD_BLOCK_COUNT` | `OPTIONAL_FEATURE` | Same |
| `THRESHOLD_BLOCK_RATE_CHANGE` | `OPTIONAL_FEATURE` | Same |
| `THRESHOLD_CONFIDENCE_CHANGE` | `OPTIONAL_FEATURE` | Same |
| `THRESHOLD_CONFIDENCE_MIN` | `OPTIONAL_FEATURE` | Same |
| `THRESHOLD_FAILURE_COUNT` | `OPTIONAL_FEATURE` | Same |
| `THRESHOLD_FALSE_POSITIVE_RATE` | `OPTIONAL_FEATURE` | Same |
| `THRESHOLD_FIELD_MISSING_RATE` | `OPTIONAL_FEATURE` | Same |
| `THRESHOLD_LOW_CONFIDENCE_FAILURE_RATE` | `OPTIONAL_FEATURE` | Same |
| `THRESHOLD_LOW_CONFIDENCE_VALUE` | `OPTIONAL_FEATURE` | Same |
| `THRESHOLD_MISSING_DATA_VALUE` | `OPTIONAL_FEATURE` | Same |
| `THRESHOLD_OVERRIDE_FAILURE_RATE` | `OPTIONAL_FEATURE` | Same |
| `THRESHOLD_OVERRIDE_FAILURE_VALUE` | `OPTIONAL_FEATURE` | Same |
| `THRESHOLD_PENDING_AGE` | `OPTIONAL_FEATURE` | Same |
| `THRESHOLD_RULE_BLOCK_VALUE` | `OPTIONAL_FEATURE` | Same |
| `THRESHOLD_STALLED_PIPELINE` | `OPTIONAL_FEATURE` | Same |
| `DRIFT_SEVERITY_HIGH` | `OPTIONAL_FEATURE` | Same |
| `DRIFT_SEVERITY_MEDIUM` | `OPTIONAL_FEATURE` | Same |
| `DRIFT_SEVERITY_LOW` | `OPTIONAL_FEATURE` | Same |

### 18. Auth secondary

| Variable | Classification | Notes |
|---|---|---|
| `NEXTAUTH_SECRET` | `DEPRECATED` | Not used by this application; may alias AUTH_SECRET for future use |

### 19. Testing — dev/CI only

| Variable | Classification | Notes |
|---|---|---|
| `TEST_WITH_DB` | `TEST_ONLY` | Set `true` to run DB-dependent tests; NEVER in production |
| `OPSIQ_SMOKE` | `TEST_ONLY` | Set `true` to enable smoke-test routes |

### 20. Private deployment (single-operator)

| Variable | Classification | Notes |
|---|---|---|
| `OPSIQ_PRIVATE_WORKSPACE_ID` | `PRIVATE_DEPLOY_ONLY` | Grants ENTERPRISE entitlement without Stripe to the named workspace; MUST NOT be set in multi-tenant SaaS |
| `OPSIQ_PRIVATE_OWNER_USER_ID` | `PRIVATE_DEPLOY_ONLY` | Paired with above; seed script + authorization checks only |

---

## Summary counts

| Classification | Count |
|---|---|
| `REQUIRED_OWNER_RUNTIME` | 8 |
| `OPTIONAL_RECOMMENDED` | 16 |
| `OPTIONAL_FEATURE` | 38 |
| `PRIVATE_DEPLOY_ONLY` | 2 |
| `TEST_ONLY` | 4 |
| `DEPRECATED` | 3 |
| **Total** | **71** |

---

## REQUIRED_OWNER_RUNTIME — owner action checklist

The following variables MUST be configured before production launch:

| # | Variable | Action |
|---|---|---|
| 1 | `DATABASE_URL` | Configure pooled Neon production URL in secrets manager |
| 2 | `MIGRATION_DATABASE_URL` | Configure direct (non-pooler) Neon production URL in CI/CD only |
| 3 | `NODE_ENV` | Set to `production` |
| 4 | `NEXT_PUBLIC_APP_URL` | Set to canonical production domain |
| 5 | `OAUTH_TOKEN_ENCRYPTION_KEY` | Generate: `openssl rand -base64 32`; store in secrets manager |
| 6 | `CRON_SECRET` | Generate: `openssl rand -base64 32`; set in Vercel project settings |
| 7 | `DECISION_SIGNING_SECRET` | Generate: `openssl rand -base64 32`; store in secrets manager |
| 8 | `ASYMMETRIC_PRIVATE_KEY` | **Owner generates on isolated hardware** — see §15 note above; load into secrets manager; DO NOT generate inside Claude Code or any AI-assisted tool |

---

## Security notes

- `ASYMMETRIC_PRIVATE_KEY`: The previously disclosed Ed25519 private key is permanently compromised and must not be provisioned in any environment. The owner must generate a new key pair on isolated, owner-controlled hardware.
- `DECISION_SIGNING_SECRET`, `OAUTH_TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`: All generated with `openssl rand -base64 32`; never commit to source; always load from secrets manager at runtime.
- `TEST_ONLY` variables (`TEST_WITH_DB`, `OPSIQ_SMOKE`): CI gates must verify these are absent in production config.
- `PRIVATE_DEPLOY_ONLY` variables: deployment pipeline must enforce mutual exclusivity — if `OPSIQ_PRIVATE_WORKSPACE_ID` is set, Stripe entitlement checks bypass; this MUST NOT be reachable in multi-tenant SaaS.
