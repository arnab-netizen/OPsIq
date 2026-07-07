# Phase 0 — Truth and Safety Corrections (Final Report)

Surgical correction of the highest-risk false-ready / safety defects found by
`docs/audits/2026-07-07-current-main-reality-audit/`. Minimal, test-backed, no
module rebuilds, no new product/business logic, no Prisma migration, no CI logic
change.

## 1. Branch and HEAD
- **Branch:** `claude/phase-0-truth-safety-corrections` (cut from `origin/main`).
- **HEAD before:** `22d9682f9c52140bdf775475ba24439f454d3f4f` — "Cross module consistency decision memory proof (#180)". (Main advanced past the audit base `a14fae15`; the flagged defects were re-verified present on `22d9682f`.)
- **Working tree at start:** clean.
- **HEAD after commit:** see final response.

## 2. Files changed
Modified (11):
- `src/services/external-systems/oauth-token.service.ts` (A — real crypto)
- `.env.example` (A — document required key, template only)
- `src/middleware/private-mode-gate.ts` (B — DB-backed role, drop header trust)
- `src/app/api/growth/pricing-tiers/route.ts` (C — demo-only prod guard)
- `src/app/api/growth/retention-metrics/route.ts` (C — demo-only prod guard)
- `scripts/smoke-tests.ts` (D — fail closed on placeholder URL + don't swallow auth errors)
- `scripts/production-smoke.mjs` (D — offline classified BLOCKED)
- `src/domain/external-systems/provider-registry.ts` (E — truthful readiness label)
- `src/__tests__/services/external-systems/oauth-token.service.test.ts` (A tests)
- `src/__tests__/middleware/private-mode-gate.test.ts` (B tests, rewritten to prove fix)
- `src/__tests__/domain/external-systems/provider-registry.test.ts` (E tests)

Added (2):
- `src/lib/demo-write-guard.ts` (C — fail-closed guard)
- `src/__tests__/lib/demo-write-guard.test.ts` (C tests)

Net: 13 files, +671 / −147.

## 3. Each audit finding addressed + 4. Fix method

### A. OAuth token crypto truth/safety (audit H-CONN-02)
- **Was:** `encryptOAuthToken` returned `Buffer.from(token).toString("base64")` under header comments claiming "encrypted at rest with workspace-scoped keys".
- **Now:** authenticated **AES-256-GCM**. A per-workspace 32-byte key is derived with **HKDF-SHA256** from an explicit master key read from `OAUTH_TOKEN_ENCRYPTION_KEY` (base64 or hex, ≥32 bytes). Ciphertext is versioned `v1gcm.<iv>.<tag>.<ct>`.
- **Fail closed:** missing/short key → throw (no base64 downgrade, no plaintext). `decrypt` **refuses** any non-`v1gcm` (legacy base64) input, and GCM auth-tag verification makes a wrong-workspace key or tampering throw.
- **Truthful labels:** header + interface comments rewritten to describe the real scheme. New required env var documented in `.env.example` (no secret value).
- Signatures unchanged (still synchronous), so the only caller `token-lifecycle.service.ts` is unaffected.

### B. Private-mode gate wiring (audit H-PRIV-01)
- **Was:** `getPrivateModeAccess` set `hasAccess`/`role` from the client-supplied `x-private-mode-role` header — any client could self-assign OWNER.
- **Now:** the header is never read for authorization. Role is resolved **only from the DB** via an injected `resolveRole`, and `createPrismaPrivateModeResolver(prisma)` wires the real `PrivateModeRoleAccessService.getUserRole` (approved + non-revoked, workspace-scoped). `enforcePrivateModeGate` threads the resolver through. **Fails closed** when identity is incomplete or no resolver is wired.
- Identity (`x-user-id`/`x-workspace-id`) still comes from the same upstream-verified channel the rest of the middleware relies on; only the **authorization decision** moved to the DB. `addPrivateModeContext` still *emits* a response header (output), which is fine.
- The gate has **no production callers today** (grep-verified), so no live request behaviour changed; this removes the latent bypass and supplies the correct wiring point.

### C. Pricing/retention write-route honesty (audit H-GROWTH-01)
- **Was:** `POST /api/growth/pricing-tiers` and `/retention-metrics` accepted writes that `PricingEngine`/`RetentionEngine` stored in `static Map`s (lost on restart, no audit).
- **Now (Option 2, smallest safe fix):** new `src/lib/demo-write-guard.ts`. In production both routes **fail closed** with `503 NOT_PERSISTED_DEMO_ONLY` (`persistence:"in-memory"`, `productionEnabled:false`); outside production the demo path still works. Route docs relabelled **DEMO-ONLY / NON-PERSISTENT**. No Prisma model/migration added (kept out of Phase-0 scope; durable persistence is audit Phase 4).

### D. Smoke scripts fail-close (audit H-SMOKE-01)
- `smoke-tests.ts`: **fail closed** if `NEXT_PUBLIC_APP_URL` is unset or a placeholder (`yourdomain.com`/`example.com`) → prints BLOCKED and exits 1 (was silently running against a fake host). The auth-enforcement test no longer swallows non-timeout network errors — it rethrows, so an unreachable protected endpoint FAILS instead of counting as "auth enforced".
- `production-smoke.mjs`: offline (no `BASE_URL`) is now classified **BLOCKED** (was `PARTIAL`), keeping the existing non-zero exit.
- No CI workflow logic changed.

### E. Connector fake-ready labels
- Added `ConnectorReadiness` and a required `Provider.readiness` field, set to **`PLACEHOLDER_ONLY`** for all 10 providers; clarified `isActive` means "import template available", not "live". Added `isConnectorProductionReady()`. No real connector code added.

## 5. Tests added/updated
- **A:** 9 new proofs (not-plaintext; not-base64 + `v1gcm.` prefix; correct-key decrypt; wrong-workspace-key throws; tamper throws; legacy-base64 refused; missing-key fail-closed; short-key fail-closed; source-contract: no base64-as-encryption).
- **B:** gate test rewritten — spoofed header denied (with/without resolver), DB grant allowed, missing identity denied, role requirement enforced from DB, **workspace isolation**, resolver wiring.
- **C:** guard blocks in production for all in-memory features, allows otherwise, 503 body shape, static check both routes are guarded.
- **E:** no provider is PRODUCTION_READY; every provider declares an explicit readiness.

## 6. Commands run
`git fetch/checkout -B`; targeted `grep`/reads of each defect + its tests; Edits/Writes to 13 files; `[ -d node_modules ]` → NO; `node --check scripts/production-smoke.mjs` → OK; `git diff --cached --stat`; sanity greps (base64 line removed; no authz read of `x-private-mode-role`).

## 7. Pass / fail / deferred status
| Gate | Status | Note |
|---|---|---|
| Static review | **PASS** | all edits reviewed for type/logic correctness |
| `node --check` (.mjs) | **PASS** | production-smoke.mjs parses |
| typecheck (tsc) | **BLOCKED** | node_modules absent; install forbidden → runs in CI |
| lint (eslint) | **BLOCKED** | same |
| unit tests (vitest) | **BLOCKED** | new/updated suites must go green in CI |
| DB tests | **N/A** | no DB / schema / migration touched |
| Prisma validate/generate | **N/A** | schema untouched |

Dynamic gates are reported **BLOCKED, not PASS** (per phase rules).

## 8. Remaining risks
1. Dynamic gates not run locally — the added suites must go green in CI before merge.
2. Token encryption now **requires** `OAUTH_TOKEN_ENCRYPTION_KEY` wherever external tokens are stored; without it `storeOAuthToken` throws (intended). Connectors remain `PLACEHOLDER_ONLY`, so no live token is stored yet — no runtime break today.
3. `private-mode-gate` still has no production callers; wiring it into real routes (via `createPrismaPrivateModeResolver`) is future work.
4. Pricing/retention remain non-persistent (now blocked in production); real persistence is audit Phase 4.

## 9. Rollback plan
All changes are one commit on `claude/phase-0-truth-safety-corrections`. `git revert` the commit (or delete the branch). No DB migration, no data change, no CI change → clean instant revert. The only running-system behaviour change is the two in-memory growth write routes returning 503 in production; reverting restores the prior (unsafe) behaviour.

## 10. Exact next recommended phase
**Phase 1 — Prove what exists** (from the reality audit, §6): re-activate the 91 quarantined tests starting with the `diagnostic-core` engine tests; add browser E2E for the currently-uncovered critical journeys (billing/checkout, signup-from-scratch, member-invite/role-assignment); add a secret-gated live LLM smoke in an automated pipeline. Persisting pricing/retention and finishing one real connector are **Phase 3–4**, not now.

## Product logic changed
**No.** Changes are limited to security/safety hardening (token crypto, private-mode authz wiring, demo-write production guard, connector readiness labels, smoke fail-close). No business rules, governed flows, modules, or Prisma schema were altered.
