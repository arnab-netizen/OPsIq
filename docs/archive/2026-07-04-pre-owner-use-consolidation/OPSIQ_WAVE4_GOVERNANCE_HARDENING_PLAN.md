# OpsIQ Wave 4 — GOVERNANCE_HARDENING_SWEEP Plan

> Branch: `claude/wave4-governance-hardening-sweep`, stacked on the Wave 3 PR #99 head (`326da6a4`).
> Plan-first: committed before any Wave 4 code. Migration-free. No gate weakened, no gate loosened, no
> fabrication, no masking. **No PR opened and nothing merged until #99 is merged and this branch is rebased.**

## Honest framing
Four read-only recon agents mapped the governance/auth surface. The major gates are **already green**: the
auth-governance route scanner passes and is CI-blocking; `governance:scan:strict` shows 32 frozen / 0 new;
`lint:ratchet` passes (2088 ≤ 2155). Prior waves (#88–#96) already hardened auth. So the genuinely **clean,
migration-free, no-gate-weakening** remainder is narrow — dead-code removal + a small number of honesty/hygiene
fixes. Everything requiring a schema change, a wrapper enhancement, or an owner decision is documented, not guessed.

## Sub-slices (each a commit; all migration-free, behavior-neutral or honesty-only)

### S1 — Delete grep-proven dead code + baseline hygiene
Delete files with **zero non-test AND zero test importers** (proven by grep; deleting changes no behavior):
- `src/services/decision/execution-stub.ts` — the MINOR-3 "unlocked status→executed" footgun (flips a governed
  decision to `executed` with no lock/idempotency); zero references anywhere.
- `src/lib/ingestion/csv.ts`, `src/services/ingestion/csv.ts`, `src/services/ingestion/validate.ts` — orphaned CSV
  parsers, no importers (the live CSV path is `domain/file-intake/csv-parser.ts` + `decisions/…`, untouched).
- `src/scheduler.ts` — 0-byte empty placeholder (the real scheduler is `src/infra/scheduler.ts`; nothing imports `@/scheduler`).
- `.claude/lint-baseline.json` — remove the stale `baseline_file_counts` entry for the already-deleted
  `__ignored_tests__/services/metrics/__tests__/decision-metrics-service.test.ts` (line 32), plus any entries for
  the files deleted above. (Informational map only; the ratchet checks top-level counts.)
Net effect: fewer lint errors (still ≤ baseline), one real footgun removed, cleaner tree. No test deleted (these
files have no tests).

### S2 — Fix the `diagnosis-route-proof` honesty defect
`src/app/api/internal/diagnosis-route-proof/route.ts` hardcodes `diagnosticKey: { headerPresent: true,
authorized: true }` in its response **regardless of any key**, and its header docstring falsely claims it is
"Protected by x-opsiq-diagnostic-key" when it is actually gated by `withCanonicalEnforcement` (session +
capability). Fix: correct the docstring to describe the real gate, and replace the **fabricated** `authorized:true`
with the truthful gate state (the route is capability-gated, not diagnostic-key-gated). Internal diagnostic route,
scoped to the caller's own session; not public SaaS. Anti-fabrication honesty fix, no behavior change to the gate.

### S3 — De-`any` the g6r strict-auth test cast (strict-auth 7 → 6)
`src/__tests__/phase-g/g6r-auth-bridge.test.ts:71` uses `canonicalizeAuthContext(auth as any, …)` purely to feed a
deliberately-malformed context to the fail-closed runtime guard. Replace `as any` with a narrowed cast to the
parameter type — preserves the test's intent (still exercises the fail-closed path) and clears one
`noUnsafeCast` strict-auth violation. Test-only, zero production impact.

## Deferred (documented, not coded) — see OPSIQ_WAVE4_GOVERNANCE_HARDENING_DEFERRED_DECISIONS.md
- **M4** log-only escalations — the honesty label is entangled with the Wave-1-deferred broken action detector
  (`detectHighPriorityOverdueActions` still queries non-existent `Action.priority`/`dueDate` → throws), which
  blocks the whole escalation-checks route. Fixing M4 requires that domain decision first. The KPI-deterioration
  detector works; real delivery needs a notification/delivery model. → domain/schema decision.
- **M1** fabricated `workspace.isActive:true` / `entitlements.limits:{}` in the canonical verified session — the
  values are **latent** (no live authz gate reads them). A real read is migration-free but adds a DB round-trip to
  the security-critical hot path for an unconsumed value; enforcing inactive-workspace/limits is new behavior. →
  owner/product decision (perf + gate semantics).
- **3 route strict-auth violations** (`users/[userId]` PATCH+POST, `leads/[leadId]` POST,
  `clients/…/contacts/[contactId]` DELETE) — the target services are fine, but the legacy handlers are
  `withAuth({internalOnly:true})` + header-workspace scoping; `withCanonicalEnforcement` has no `internalOnly`
  option and `withCanonicalPolicyEnforcement` drops `requireWorkspace`. Migrating naively swaps
  header-targeted-workspace for session-workspace and could weaken the internal-only gate → needs a wrapper
  enhancement / authz-equivalence decision.
- **`ClientContact` optimistic concurrency** — no `version` column → needs schema.
- **`demo-password-123`** committed in `seed.ts` + `login-diagnostic` — move to an env-overridable single source +
  ensure seed never targets prod (rotation is an owner call); **TLS `rejectUnauthorized:false`** unconditional in
  prod (`db.ts`/`seed.ts`) and ungated `startup`/`build-info` metadata endpoints → owner security decisions.
- **31 `raw-error-message`** governance findings — server-side classification/log strings, legitimately frozen.
- **Unrouted intake bridges** (persistFileIntake, submitStructuredImport, import-persistence, intake-adapter) —
  real logic with test coverage (intended groundwork); keep, not delete.

## Required Wave 4 checks
- `tsc --noEmit` ✓ (S1 must not break any import — proves the deletions were truly dead).
- `lint:ratchet` PASS (fewer errors) with 0 changed-file errors.
- `governance:scan:strict` still **0 new** (32 matched — deletions remove no frozen finding).
- `governance:scan:auth` comply. Live eslint strict-auth count **7 → 6** after S3.
- No-regression: full targeted suites for any area whose imports could touch the deleted modules; Wave 2/3 DB
  suites still green.

## Classification (target)
`GOVERNANCE_HARDENING_SWEEP_READY` — dead footgun + orphaned modules removed (grep-proven), two honesty/hygiene
fixes landed, gates stay green, and every item needing schema/wrapper/owner decision is documented. Honest note:
the sweep is small because prior waves already hardened the auth/governance gates.
