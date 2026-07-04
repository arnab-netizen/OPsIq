# OpsIQ Wave 9 — Scheduled Reassessment Report + Tier-1 Hostile Audit

> Standard: `OPSIQ_HOSTILE_RUNTIME_AUDIT_STANDARD.md` v3.0. Audit tier: **Tier 1** (infrastructure decision + a
> test-gap closure on an already-proven seam; no production behaviour change). **CI was NOT triggered by this work.**
> Branch `claude/runtime-readiness-wave9-scheduled-reassessment`; base `main @ 920afc6a`. Migration-free; no gate
> weakened; **no scheduler engine built**.

## 1. What changed (diff scope — §9)
| File | Class | Change |
|---|---|---|
| `src/__tests__/api/internal/reassessment-scan.test.ts` | test | Added the authorized happy-path + governed-500 proofs (scanner mocked) to the existing fail-closed suite; asserts the scanner is NOT called on 401 |
| `*_PLAN.md`, `*_DECISION.md`, this report, `*_EVIDENCE_LEDGER.json` | docs | plan + external-trigger infrastructure decision memo + audit |
**No production code touched.** No schema/migration/route/service/workflow change. No baseline/threshold/rule change.

## 2. Why no production change (recon-verified)
The M8 seam is already implemented and proven (merged #87): `scanDueReassessments` (DB-backed, idempotent) + the
fail-closed token-gated `POST /api/internal/reassessment-scan`. Event-driven reassessment is fully wired. The only
open item — **what invokes the seam on a cadence** — was deliberately left as an infrastructure decision (Wave 3), and
building an in-process scheduler is explicitly forbidden (it would never fire in serverless). So Wave 9 is a decision
memo + closing the one verification gap the recon found (the route had **only** 401 tests, no authorized 200 proof).

## 3. Claim-to-proof matrix (§10)
| Claim | Required layer | Actual | Evidence | Verdict |
|---|---|---|---|---|
| The seam fails closed (401 for no/short/wrong token; scanner never reached) | unit | **unit** | `reassessment-scan.test.ts` fail-closed cases + `scanMock not called` | PASS |
| An authorized (correct-token) caller gets 200 and the scanner is invoked exactly once with a real `Date` | unit | **unit** | `reassessment-scan.test.ts` authorized happy-path | PASS |
| A scanner error yields a governed 500 with no raw leak | unit | **unit** | `reassessment-scan.test.ts` governed-500 case | PASS |
| The scan reassesses real overdue businesses / is idempotent per day | DB | **DB** | `due-reassessment.service.db.test.ts` (unchanged, 4 cases) | PASS (pre-existing) |
| A scheduler/cron is wired to invoke the seam automatically | — | **NOT DONE (infra decision)** | decision memo | HONEST NON-CLAIM |

## 4. Honesty / no-overclaim (§20, §34)
No fake scheduler is created; no workflow that pings a production URL is committed (that is an owner-controlled
deployment/external-integration decision, documented as a recipe). The external trigger being un-wired **degrades
silently, not falsely** — the owner surface shows the real due date and never claims an automatic scheduled
reassessment ran (Wave 3-verified). Event-driven reassessment (the primary governed adaptive loop) is fully wired.
The route auth/wiring test mocks the scanner so it does not invoke the **global** scanner against a shared DB (which
would break the sibling service DB test via same-day idempotency) — the scan behaviour stays DB-proven at the service
layer. No gate weakened.

## 5. Local proof (§4, no CI triggered)
- `tsc --noEmit` ✓ (0); `lint:ratchet` **PASS** (2083 ≤ 2155, 0 changed-file errors); `governance:scan:strict`
  **32 frozen / 0 new** (baseline unchanged); `governance:scan:auth` comply.
- **Unit**: `reassessment-scan.test.ts` **5/5** (3 fail-closed + authorized 200 + governed 500).
- **No-regression / isolation**: `reassessment-scan.test.ts` + `due-reassessment.service.db.test.ts` run **together 9/9**
  (the mock removes the global-scanner interference that a second DB scanner-caller would have introduced).

## 6. CI status (§1.1 / §35)
**CI was not triggered by this work.** PR opened after local proof. Until then: `CI_REQUIRED_BUT_NOT_TRIGGERED_BY_AUDIT`.

## 7. Classification
**`SCHEDULED_REASSESSMENT_TRIGGER_DECISION_RECORDED`** — the reassessment seam is complete and now verified at both
ends (fail-closed + authorized), and the external cadence trigger is an explicit, documented owner deployment decision
(Vercel Cron primary / GitHub Actions fallback). Non-blocking for the owner shadow-pilot runtime path (event-driven
reassessment wired; owner surface honest; no fake scheduler). Merge gated on required CI + a final hostile audit.
