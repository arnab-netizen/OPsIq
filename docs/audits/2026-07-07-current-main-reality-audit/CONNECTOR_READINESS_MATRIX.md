# OpsIQ Connector / Local Mode / LLM-NLP Readiness Matrix

- Branch `claude/current-main-reality-audit-bqkz4q` · HEAD `a14fae15` · Date 2026-07-07
- Readiness vocabulary: NOT_STARTED / PLACEHOLDER_ONLY / LOCAL_MOCK_ONLY / READ_ONLY_REAL / WRITE_CAPABLE_GATED / OWNER_APPROVAL_REQUIRED / PRODUCTION_READY

## Summary

| Integration path | Readiness | Real auth/scopes | Workspace binding | Audit | Stale-data handling | Failure mode | Owner approval (writes) | Fake "ready" label? |
|---|---|---|---|---|---|---|---|---|
| Google Sheets OAuth import | **PLACEHOLDER_ONLY** | Auth URL + PKCE built; token exchange **throws** | Yes (DB) | via consent models | tracked, never runs | throws "not implemented" | n/a (nothing writes) | **YES — header comment claims tokens "encrypted"** |
| Generic external CRM/accounting (HubSpot, Salesforce, Zoho, Pipedrive, Shopify, Google/Meta Ads, QuickBooks/Xero) | **PLACEHOLDER_ONLY** | provider-registry templates only (columns/mappings); no OAuth | Yes (schema) | lineage/consent models | n/a | no runtime path | n/a | provider-registry is pure data — no false label |
| Browser-import (guided manual export) | **LOCAL_MOCK_ONLY / OWNER_APPROVAL_REQUIRED (by design)** | n/a (no network by design) | Yes | DRAFT + owner-approval + consent models | manual re-export | service-layer only, no route | Yes (DRAFT→approve) | honest (explicitly no-scrape) |
| OAuth token storage/refresh (`oauth-token`, `token-lifecycle`, `sync-manager`) | **PLACEHOLDER_ONLY** | refresh **throws**; token "encryption" = base64 | Yes | job status models | `expiresAt`/`refreshTokenAvailable` tracked | refresh throws → sync never runs | n/a | **YES — "encrypted at rest with workspace-scoped keys"** |
| Stripe billing webhook | **READ_ONLY_REAL (webhook receive)** | real Stripe SDK + `webhooks/stripe/route.ts` | Yes | audit on events | idempotent handler | signature-verified | n/a (inbound) | honest |
| Generic webhooks (`subscribe`, `[id]/test`) | **WRITE_CAPABLE_GATED** | app-internal | Yes | Y | n/a | gated route | capability-gated | honest |
| `decisions/submit-external` | **READ_ONLY_REAL (inbound decision intake)** | app auth | Yes | Y | n/a | validated | n/a | honest |
| LLM / OpenAI (governed copilot) | **WRITE-BLOCKED / OWNER-ADVISORY-ONLY** (real network, key-gated) | real `OPENAI_API_KEY`, fail-closed | Yes (context scoped) | AuditEvent mirror | n/a | AI_UNAVAILABLE fallback | advisory only — **cannot write/approve** | honest ("ADVISORY ONLY") |
| Local / Offline / Private Mode | **PLACEHOLDER_ONLY (gate) + real service** | role-access service real; gate trusts headers | service: Yes; gate: spoofable | service: approval trail; gate: none | n/a | gate has no fail-closed | Yes (role-access grants) | gate self-labels "placeholder" (honest in code, risky if used) |

## Detail & evidence

### Live connectors (external-systems) — PLACEHOLDER_ONLY
Files: `src/services/external-systems/{google-sheets-oauth,oauth-token,token-lifecycle,sync-manager,browser-import,browser-import-approval,import-persistence}.service.ts`; `src/domain/external-systems/{provider-registry,import-parser,types}.ts`.

Verified facts:
- **No live network.** `rg "await fetch"` across `src/services/external-systems/*` returns 0 real API calls; every real endpoint is a comment (`// POST https://oauth2.googleapis.com/token`).
- Explicit throws: `google-sheets-oauth.service.ts:134/149/271/290` ("Token exchange / Sheet data extraction / Token refresh / Token revocation not implemented in this service layer"); `token-lifecycle.service.ts:187`.
- **Token "encryption" is base64.** `oauth-token.service.ts:102` `Buffer.from(token.accessToken).toString("base64")`; line 94 comment "returns a placeholder that indicates encryption is needed"; yet header (lines 4-9) claims "All tokens are encrypted … workspace-scoped keys". **False security label — flag before any launch.**
- **Real auth-URL build exists**: PKCE `code_verifier` (`randomBytes(32).toString("base64url")`), `state`, scopes `spreadsheets.readonly`/`drive.readonly` — i.e. the *start* of OAuth is real, the *exchange* is not.
- **No connector API routes** under `src/app/api` (only `decisions/submit-external` and generic `webhooks/*`). No auth-URL, callback, or sync endpoints.
- Prisma spine (present, unused at runtime): `ExternalProvider`, `ExternalConnection`, `ExternalOAuthToken`, `ExternalSyncJob`, `ExternalRawRecord`, `ExternalFieldMapping`, `ExternalDataLineage`, `ExternalConnectionConsent`, `BrowserImportSession/Event/Consent` (schema ~3054–3290).
- Tests exist but assert contracts/parsing, not live calls (`src/__tests__/services/external-systems/*`).

Verdict: The connector layer is **schema + contract scaffolding with a real OAuth-initiation URL but no token exchange, no data fetch, and no HTTP surface.** Do not represent as "live connectors". Browser-import (guided manual export with DRAFT + owner approval) is the only honest, near-usable path — and it too lacks a route/UI.

### Local / Private Mode — PLACEHOLDER_ONLY gate over a real service
- Real: `src/services/private-mode/role-access.service.ts` (Prisma grant/revoke, `approvalStatus pending|approved`, "Only OWNER can grant roles"), model `PrivateModeAccess` (schema:3454), domain `src/domain/private-mode/role-config.ts`. Tested (`role-access.service.db.test.ts`).
- Stub: `src/middleware/private-mode-gate.ts:53` "This is a placeholder implementation."; reads `x-user-id`/`x-workspace-id`/`x-private-mode-role` from request headers (spoofable), `hasAccess = privateModeRole !== null`. Not wired to the `PrivateModeAccess` table.
- No true offline/on-prem "Local Mode" runtime; "offline" exists only as `src/domain/remote-operations/offline-integrity.ts` domain logic.

### LLM / NLP governed analysis — real, fail-closed, advisory-only
- `src/services/ai/provider.ts` (port), `openai-provider.ts` (real `fetch` POST to `https://api.openai.com/v1/chat/completions`, `response_format: json_object`, AbortController timeout + retries).
- Key-gated: absent `OPENAI_API_KEY` → `AI_UNAVAILABLE`, degrades to deterministic path (never fabricates).
- Governance: `SYSTEM_POLICY` ("ADVISORY ONLY … never approve/verify/mutate"), untrusted context fenced as `DATA`, `advisoryOnly: z.literal(true)` schema, guardrail validate in `copilot.ts`, ledger mirrored to `AuditEvent` (`ledger-persistence.ts`). **Provider cannot mutate business state.**
- Live path: `openai-live-smoke.test.ts` `describe.skipIf(!RUN_LIVE_AI)` — SKIPS by default; `.github/workflows/ai-live-smoke.yml` is `workflow_dispatch` only, skips if secret unset. No `AiCallLedger` Prisma model (AuditEvent mirror only).
- Verdict: **Sound governed design; live behaviour is never exercised in automated CI** — treat as advisory-ready, live-unproven.

## Highest connector risks
1. Any UI/marketing that says "connect QuickBooks / Google Sheets / your CRM" would be false — nothing connects (H-CONN-01).
2. base64 token storage labelled "encrypted" (H-CONN-02) — must be real KMS/crypto before storing any real token.
3. `private-mode-gate` header trust (H-PRIV-01) — must be wired to `role-access.service` before any private-mode enforcement is relied upon.
4. Live LLM and connector network paths are untested in default CI — no automated proof they work end-to-end.
