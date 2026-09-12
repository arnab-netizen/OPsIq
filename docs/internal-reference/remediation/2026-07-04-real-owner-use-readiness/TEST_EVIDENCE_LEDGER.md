# Test Evidence Ledger

**Date:** 2026-07-04 · **DB:** local PostgreSQL 16 (`opsiq_test`), `TEST_WITH_DB=true` ·
**Typecheck:** `npx tsc --noEmit` → **0 errors** · **Build:** `next build` → **success (exit 0)**.

## Suite-level result (this pass)
`npx vitest run src/__tests__/security src/__tests__/owner-mode src/__tests__/services/execution src/__tests__/domain/execution`
→ **123 test files passed, 1139 tests passed, 0 failed.**

## Per-blocker DB/unit tests

| Blocker | Test file | Asserts | Result |
|---------|-----------|---------|--------|
| AUDIT-01 | `security/audit-01-remaining-paths.db.test.ts` | lifecycle transition writes audit atomically; forced audit failure rolls the state change back (row stays `pending`) | PASS |
| DEC-EVID-01 | `security/dec-evid-01-bundle-isolation.db.test.ts` | all 6 bundle entry points reject with `FeatureDisabledError` (501) for valid workspace inputs; nothing written | PASS |
| EVID-01 | `services/execution/proof-intake.service.db.test.ts` | clean low-risk → `AI_PRECHECK_PASSED` (never ACCEPTED); malformed hash → `POSSIBLE_TAMPER_RISK` → `NEEDS_HUMAN_REVIEW`; reused hash → `POSSIBLE_DUPLICATE` → `NEEDS_HUMAN_REVIEW` | PASS (7) |
| EVID-01 (pure) | `domain/execution/proof-precheck.test.ts` | `detectProofArtifactSignals`: well-formed sha1/256 → no signal; absent hash → no signal; malformed → `tamperRisk`; end-to-end → `NEEDS_HUMAN_REVIEW` | PASS |
| REEVAL-01 | `security/reeval-01-remaining-triggers.db.test.ts` | archiving a client fires `major_client_loss` re-eval for its active engagement | PASS |
| Real owner loop | `owner-mode/real-business-owner-loop.db.test.ts` | 5 scenarios below | PASS (5) |
| CM-SEC-02 | covered by build + route scan (no raw leak); signup path verified by source | PASS |

## Real business simulation scenarios (`real-business-owner-loop.db.test.ts`, no mocks)
1. Staff **without evidence** cannot complete a proof-required task → `TaskCompletionBlockedError`; `OWNER_TASK_COMPLETION_BLOCKED` audit written.
2. **Weak/forged proof** → precheck `POSSIBLE_TAMPER_RISK` → `NEEDS_HUMAN_REVIEW`, never ACCEPTED, completion still blocked.
3. **Genuine proof** → owner (not the performer — separation of duty enforced) accepts → gate clears → `APPROVED_COMPLETE`.
4. **Major client loss** → `archiveClient` runs the real re-evaluation engine → `CONDITION_CHANGED` audit for the archived client.
5. **Owner non-compliance** → overdue critical action detected → `ESCALATION_ALERT_HIGH_PRIORITY_OVERDUE` + `CONDITION_CHANGED` re-eval on the engagement.

## Browser evidence
- `next build` compiles every route including all `/owner/*` pages (exit 0).
- Chromium (Playwright, pre-installed) loaded `http://localhost:3111/login` → 200, 2 inputs; `/signup` → 200, 3 inputs.

## Reproduction
```
# start local pg (PGDATA=/home/pgrunner/pgdata, socket /tmp), then:
source dbenv.sh   # sets DATABASE_URL...opsiq_test, TEST_WITH_DB=true
npx tsc --noEmit -p tsconfig.json
npx vitest run src/__tests__/security src/__tests__/owner-mode src/__tests__/services/execution src/__tests__/domain/execution
```
