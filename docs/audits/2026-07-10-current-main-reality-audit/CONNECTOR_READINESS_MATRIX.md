# A0 — Connector / Local Mode / LLM-NLP Readiness Matrix

**Date:** 2026-07-10  
**Branch:** claude/current-main-reality-audit-operating-layer  
**Base commit:** ef7706b (main)

---

## Connector Classification

| Connector / Integration | Status | Auth | Workspace Bound | Audit Logged | Failure Mode | Owner Approval | Risk |
|------------------------|--------|------|-----------------|--------------|--------------|----------------|------|
| **Google Sheets OAuth** | PLACEHOLDER_ONLY | Code written (PKCE, CSRF state, code exchange) but `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` absent from `.env.example` | Yes — workspace scoped in all service calls | Yes — `ExternalSyncJob` + audit trail | Fail-closed on missing credentials | Required for writes | HIGH — credentials gap means zero live testing possible |
| **Browser Extension Import** | READ_ONLY_REAL | `BrowserImportSession`, `BrowserExtractedTable` DB-backed; approval gating implemented | Yes — workspace + consent model | Yes — `BrowserImportEvent` logged | Validation rejects malformed data | Owner approval gate exists (`BrowserImportConsent`) | MEDIUM — approval flow real, E2E Playwright coverage partial |
| **Stripe Billing** | WRITE_CAPABLE_GATED | `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` in `.env.example`; webhook handler at `/api/webhooks/stripe` | Yes — workspace-level subscription | Yes — `UsageEvent`, `BillingAccount` | Webhook replay handled; idempotency key in header | Not required — automated | LOW — wired and real |
| **OAuth Token Encryption** | PRODUCTION_READY | AES-256-GCM, HKDF-SHA256 workspace-derived keys, fail-closed on missing `OAUTH_TOKEN_ENCRYPTION_KEY` | Yes — per-workspace key derivation | Yes — via ExternalOAuthToken audit trail | Throws on bad/missing master key; no silent fallback | N/A (internal) | LOW — implementation correct |
| **External Opportunity Signals** | PLACEHOLDER_ONLY | `ExternalOpportunitySignal` model exists; `external-opportunity-intake.service.ts` exists | Yes | Partial | Unknown — no real source connected | Not implemented | MEDIUM |
| **External Field Mapping / Raw Record** | PLACEHOLDER_ONLY | `ExternalFieldMapping`, `ExternalRawRecord`, `ExternalProvider` models defined | Schema only | Schema only | Unknown | Unknown | HIGH — models with no service layer found |
| **Webhooks (inbound)** | READ_ONLY_REAL | `/api/webhooks/[id]` + `/api/webhooks/subscribe` exist; `WebhookEvent`/`WebhookDelivery` modeled | Yes | Yes | Replay deduplication via `WebhookEvent` | Not required | LOW |

---

## LLM / AI Integration

| Integration | Status | Key In Env | Fail Behavior | Workspace Bound | Audit | Risk |
|------------|--------|------------|---------------|-----------------|-------|------|
| **OpenAI Chat Completions (Phase AI-16)** | LOCAL_MOCK_ONLY | `OPENAI_API_KEY` NOT in `.env.example`; referenced in code only | Fail-closed → returns `AI_UNAVAILABLE`, falls to deterministic path | Yes — `workspaceId` in context | Advisory only — never mutates state | MEDIUM — fully implemented but untestable without key |
| **AI Provider Interface (Phase AI-1)** | PRODUCTION_READY | N/A (interface layer) | Falls to `UnavailableAiProvider` or `MockAiProvider` | Yes | Yes — governance invariants enforced | LOW |
| **Anthropic Claude** | NOT_STARTED | Not referenced | N/A | N/A | N/A | N/A |
| **LLM-NLP governed analysis** | PARTIAL | OpenAI provider implemented; no key; deterministic path active | Falls to deterministic | Yes | Advisory only | MEDIUM |

---

## Local Mode / Private Mode

| Feature | Status | Implementation | Playwright Coverage |
|---------|--------|---------------|---------------------|
| **Private Mode** | PARTIAL | `PrivateModeAccess` model + `src/middleware/private-mode-gate.ts` + `src/services/private-mode/role-access.service.ts` | Not confirmed |
| **Local Mode (offline-capable)** | NOT_STARTED | No offline-first service worker or local DB detected | None |
| **STORAGE_PROVIDER=local** | PRODUCTION_READY | `.env.example` includes `STORAGE_PROVIDER=local` + `STORAGE_LOCAL_PATH` | N/A |
| **SCHEDULER_PROVIDER=in-memory** | PRODUCTION_READY | `.env.example` includes `SCHEDULER_PROVIDER=in-memory` | N/A |

---

## Key Gaps

1. **Google Sheets credentials**: The integration code is complete (OAuth PKCE, token lifecycle, workspace isolation, sync manager) but `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` are absent from `.env.example`. Any live test or real import is blocked. This is `PLACEHOLDER_ONLY` in practice.

2. **OpenAI API key**: `openai-provider.ts` is fully implemented and fail-closed. Adding `OPENAI_API_KEY` to `.env.example` + secrets would activate the live AI path without code changes. Currently `LOCAL_MOCK_ONLY`.

3. **ExternalFieldMapping / ExternalRawRecord**: Models defined in Prisma schema but no service layer found in source scan. Risk: dead schema weight that implies more connector coverage than exists.

4. **Tender/Application Assistance**: No route, service, or model for tender workflows found. `MISSING`.

5. **Waste/Leakage dedicated module**: `OwnerCapacitySnapshot` and capacity references exist in advisor context but no dedicated waste/leakage route or service. `MISSING` as standalone capability.

---

## Validation Commands

```bash
# Verify connector service files
ls src/services/external-systems/

# Verify Google OAuth not wired
grep GOOGLE_CLIENT_ID .env.example

# Verify OpenAI key not in env
grep OPENAI_API_KEY .env.example

# Verify Stripe is wired
grep STRIPE_SECRET_KEY .env.example
```
