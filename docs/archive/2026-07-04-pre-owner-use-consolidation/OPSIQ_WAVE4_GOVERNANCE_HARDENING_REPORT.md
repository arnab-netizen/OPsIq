# OpsIQ Wave 4 — GOVERNANCE_HARDENING_SWEEP Report

## Branch / base
- Branch: `claude/wave4-governance-hardening-sweep`.
- Original stacked base: Wave 3 PR #99 head `326da6a4` (worked while #99 finishes CI).
- Post-#99 rebase base: to be set to `main` after #99 merges; Wave 4 will be rebased `--onto main <#99-head>` (only the
  Wave 4 commits replay). Until then the branch carries the Wave 3 commits as its base.
- Final HEAD (pre-report): `c9211111`.
- Working tree: clean.

## Honest framing
Four read-only recon agents mapped the governance/auth surface. The major gates are **already green** — the
auth-governance route scanner passes and is CI-blocking; `governance:scan:strict` is 32 frozen / 0 new;
`lint:ratchet` passes. Prior waves (#88–#96) hardened auth. So the genuinely clean, migration-free,
no-gate-weakening remainder is small: dead-code removal + two honesty/hygiene fixes.

## S1 — Delete grep-proven dead code + baseline hygiene (implemented)
Deleted five files, each with **zero non-test AND zero test importers** (grep-proven; `tsc` still green after
deletion, which proves the deadness):
- `src/services/decision/execution-stub.ts` — the MINOR-3 "unlocked status→executed" footgun (flipped a governed
  decision to `executed` with no lock/idempotency).
- `src/lib/ingestion/csv.ts`, `src/services/ingestion/csv.ts`, `src/services/ingestion/validate.ts` — orphaned CSV
  parsers (the live path is `domain/file-intake/csv-parser.ts` + `decisions/…`, untouched).
- `src/scheduler.ts` — 0-byte empty placeholder (the real scheduler is `src/infra/scheduler.ts`).
Also removed the stale `.claude/lint-baseline.json` entry for the already-deleted
`__ignored_tests__/services/metrics/…decision-metrics-service.test.ts`. `lint:ratchet` 2088→2086 errors.
No test deleted (these files had none).

## S2 — diagnosis-route-proof honesty fix (implemented)
`src/app/api/internal/diagnosis-route-proof/route.ts` is gated by canonical session enforcement
(`ENGAGEMENT_CREATE` capability + workspace) but its docstring falsely claimed "Protected by
x-opsiq-diagnostic-key" and its body hardcoded `diagnosticKey: { headerPresent: true, authorized: true }`
regardless of any key. Corrected the docstring to the real gate and replaced the **fabricated** field with a
truthful `auth: { mechanism: "canonical_session_capability", … }` descriptor. No gate/behavior change; the route
is internal and scoped to the caller's own session. No test referenced the removed field.

## S3 — de-`any` the g6r strict-auth test cast (implemented)
`src/__tests__/phase-g/g6r-auth-bridge.test.ts:71` used `canonicalizeAuthContext(auth as any, …)`; the function
already accepts `AuthContext | null | undefined` and `createAuthContext` returns `AuthContext`, so the cast was
superfluous. Removed it — the fail-closed intent (`session: undefined → UnauthorizedError`) is unchanged and one
`noUnsafeCast` strict-auth violation clears. **Live strict-auth count 7 → 6.**

## Deferred (documented, not coded) — see OPSIQ_WAVE4_GOVERNANCE_HARDENING_DEFERRED_DECISIONS.md
- **M4** log-only escalations — entangled with the Wave-1-deferred broken action detector
  (`detectHighPriorityOverdueActions` queries non-existent `Action.priority`/`dueDate`), which blocks the route;
  real delivery needs a notification model → domain/schema decision.
- **M1** fabricated `workspace.isActive:true` / `limits:{}` in the verified session — latent (no live gate reads
  it); a real read is migration-free but adds a DB round-trip to the security-critical hot path for an unconsumed
  value and enforcing it is new behavior → owner/product decision.
- **3 route strict-auth violations** (`users`/`leads`/`contacts` legacy `internalOnly` handlers) — clearing them
  needs a canonical-wrapper enhancement (`internalOnly`+workspace) or an authz-equivalence decision; a naive
  migration would weaken the internal-only admin gate → not attempted.
- **ClientContact optimistic concurrency** (no `version` column) → needs schema.
- **`demo-password-123`** committed in `seed.ts`+`login-diagnostic`; **TLS `rejectUnauthorized:false`** in prod;
  ungated `startup`/`build-info` metadata endpoints → owner security decisions.
- **31 `raw-error-message`** findings — legitimately frozen server-side strings.
- **Unrouted intake bridges** (persistFileIntake, submitStructuredImport, import-persistence, intake-adapter) —
  test-backed groundwork; kept, not deleted.

## Proof (local)
- `tsc --noEmit` ✓ (post-deletion — proves the 5 files were truly dead).
- `lint:ratchet` **PASS** (2086 ≤ 2155; `changed_file_lint_errors: 0`).
- `governance:scan:strict` **32 matched / 0 new** (deletions removed no frozen finding).
- `governance:scan:auth` comply. Live eslint **strict-auth 7 → 6**.
- No-regression: **520 tests green** across decisions, file-intake (service + domain), external-systems,
  business-facts, owner-mode input-paths, and g6r auth-bridge (the areas adjacent to the deleted modules).

## Metrics
- Dead files removed: **5** (execution-stub footgun + 3 orphaned parsers + empty scheduler).
- Fabricated fields removed: **1** (`diagnosis-route-proof` `authorized:true`).
- strict-auth violations cleared: **1** (7 → 6).
- Gates weakened: **0**. Fabrications added: **0**. Tests deleted: **0**. Schema changes: **0**.

## Classification
**`GOVERNANCE_HARDENING_SWEEP_READY`** — a real footgun + orphaned modules removed (grep-proven, `tsc`-verified),
two honesty/hygiene fixes landed, all gates stay green. Honest note: the sweep is intentionally small because prior
waves already hardened the auth/governance gates; the larger remaining items each require a schema change, a
canonical-wrapper enhancement, or an owner decision, and are documented rather than forced.

## PR readiness
Ready to open after: #99 merged → Wave 4 rebased onto updated `main` → baseline checks re-run → this report final.
