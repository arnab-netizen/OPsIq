# OpsIQ Cautious-Proceed Policy — PR Report

Final classification: **`CAUTIOUS_PROCEED_POLICY_READY`**

## 1. Branch
`claude/cautious-proceed-policy-calibration`

## 2. Base `main` HEAD
`f7b3e796eb02df448c6073e8309812d43eb91767` (OpsIQ Real-World Chaos Replay: DB + Browser Representative Proof, PR #62). The branch merge-base equals this commit — the branch is cleanly ahead of `main`.

## 3. Final branch HEAD
`8dc1fd384b9299de68f880cd6d8e149a5a7e643d` (before the PR report commit; this report adds one commit on top).

## 4. Working tree status
Clean and synced with `origin/claude/cautious-proceed-policy-calibration` before this report. The only change in the report commit is `OPSIQ_CAUTIOUS_PROCEED_POLICY_PR_REPORT.md`.

## 5. Implementation summary
Additive, conservative-by-default calibration of the owner action-status spectrum so OpsIQ can recommend **low-risk, reversible, SOP-approved** action where appropriate — without over-automating, allowing autonomous high-risk action, faking confidence, or proceeding while critical evidence is missing.

- **`src/domain/owner-mode/action-status-policy.ts`** (new) — canonical pure `decideActionStatus(signals)` over typed safety/evidence/materiality signals. No DB, no model, no `Date.now`.
- **`src/domain/owner-mode/supervisor-summary.ts`** — optional `SupervisorInput.safeAction`; `deriveActionStatus` delegates to the policy. Behaviour-preserving when `safeAction` is absent.
- **`src/services/owner-mode/owner-whole-business-plan.service.ts`** — emits `safeAction` only for a genuinely-safe business AND only when a deliberate `owner.safe-action-approved` standing instruction exists. `riskClass=low`→proceed, `riskClass=medium`→cautious_proceed.
- **Fixtures/seed** — `SAFE_ACTION_SCENARIOS` (`safe_proceed`, `safe_cautious`, `safe_needs_data`) + seed of the SOP standing instruction; existing 10 scenarios untouched.

## 6. Action-status policy (strict evaluation order)
1. `blocked`
2. `need_more_data`
3. safe-action downgrade (only a fully-safe action may downgrade an owner decision)
4. `owner_decision_required`
5. `cautious_proceed` / `proceed`

`blocked` and `need_more_data` are evaluated **first** and can never be overridden by `safeAction`.

## 7. BLOCKED criteria
Any of: unsafe action · compliance/professional-review boundary without written review · fake/disputed proof · bad contract/payment terms at high risk · cash/runway hard block · staff/customer safety risk · high-risk action with missing critical data · likely-bad-outcome-if-followed.

## 8. NEED_MORE_DATA criteria
(Not blocked) any of: required data missing · confidence cannot reach threshold · material assumptions · weak/one-sided source · confidence below threshold · high decision impact with insufficient evidence.

## 9. OWNER_DECISION_REQUIRED criteria
(Not blocked/need-data, not downgraded by a fully-safe action) any of: financially material · changes staffing/payroll · changes pricing materially · B2B contract terms · brand/compliance/legal/professional boundary · reversible-but-material · owner approval required by standing instruction · high-risk-financial constraint.

## 10. CAUTIOUS_PROCEED criteria
Reversible, low/medium risk, **with a stop-loss threshold**, within an approved SOP, evidence sufficient, cash impact safe, staff capacity ok, customer-quality controlled, no material compliance risk, proof + reassessment defined, owner approval not required (or already granted). (`isCautiousProceedSafe` = `riskLevel !== "high" && hasStopLoss && safeFloor`.)

## 11. PROCEED criteria
Low risk, **routine**, reversible, within an approved SOP, evidence sufficient, proof + reassessment defined, no material cash/staff/customer/compliance risk, no owner approval required. (`isProceedSafe` = `riskLevel === "low" && routine && safeFloor`.)

`safeFloor` = `reversible && withinApprovedSOP && ownerApprovalNotRequiredOrGranted && evidenceSufficient && cashImpactSafe && staffCapacityOk && customerQualityControlled && noMaterialComplianceRisk && hasProofReassessment`.

## 12. Proof that blocked and need_more_data cannot be overridden
- Policy unit tests #2, #4, #10 (`action-status-policy.test.ts`): a `safeAction` passed alongside `complianceOrProofBoundaryWithoutReview`, `unsafe`, `cashHardBlock`, `disputedOrFakeProof`, `criticalDataMissing`, `confidenceNone`, etc. still resolves `blocked` / `need_more_data`.
- Status-coverage (`status-coverage.test.ts`): "missing data even with a safe action (cannot override)" → `need_more_data`; "blocked and need_more_data never render as proceed".
- Supervisor-seam test: "a safeAction NEVER overrides blocked or need_more_data".
- DB proof (`cautious-proceed-policy.db.test.ts`): a compliance-boundary business **with** an SOP grant stays `blocked`; a business with stripped finance/cash **with** an SOP grant stays `need_more_data`.

## 13. Proof that proceed/cautious_proceed require explicit safeAction + owner standing instruction
- Without `safeAction`, `decideActionStatus` falls through to the legacy owner-decision/confidence path — identical to pre-change runtime (behaviour-preservation tests).
- The service emits `safeAction` only when `db.ownerStandingInstruction.findFirst({ scope: "owner.safe-action-approved", status: "active" })` returns a row. DB test: an **identical** healthy `profitable_growth` business **without** the grant resolves `owner_decision_required`; **with** `riskClass=low` → `proceed`; **with** `riskClass=medium` → `cautious_proceed`. The grant is the only lever.

## 14. DB proof — `src/__tests__/behavioral-validation/chaos-replay/cautious-proceed-policy.db.test.ts`
All five statuses proven through the real `getOwnerWholeBusinessPlan` over persisted rows, plus hard-gate negatives (SOP grant cannot bypass a compliance block, a cash hard-risk, or missing evidence). **8/8 pass.**

## 15. Browser/mobile proof — `tests/browser/20-action-status-spectrum.spec.ts`
Five seeded businesses render five distinct badges in real Chromium **and** at mobile 375×812:

| Business | Dominant | Badge |
|---|---|---|
| `safe_proceed` (SOP low) | `profitable_growth` | Proceed (success) |
| `safe_cautious` (SOP medium) | `profitable_growth` | Proceed with caution (warning) |
| `growth_scale` (no SOP) | `profitable_growth` | Owner decision required (warning) |
| `safe_needs_data` (SOP, evidence stripped) | `profitable_growth` | Need more data (muted) |
| `vendor_compliance` | `compliance_block` | Blocked (destructive) |

## 16. Playwright spec 20 proof
Spec 20 asserts all five labels render in one session, that the SOP grant is the only difference between the proceed and owner-decision businesses, that proof + reassessment surface even for proceed/cautious, and that non-proceeding businesses never read as "Proceed". Wired into `.github/workflows/owner-pilot-e2e.yml`. **10/10 pass locally.** Specs 18 + 19 re-run green (15/15) — no browser regression. Combined 18/19/20: **25/25.**

## 17. No-regression proof (local)
| Gate | Result |
|---|---|
| `git status --short` | clean |
| `prisma validate` | valid |
| `tsc --noEmit` | exit 0 |
| ESLint (11 changed files) | exit 0 |
| `lint:ratchet` | PASS (errors 2155 = baseline; changed-file errors 0) |
| Policy + status-coverage | 26/26 |
| DB status proof + chaos-db-replay + chaos-db-isolation + WBP service + business isolation + AI-supervisor | 155/155 |
| Owner-pilot readiness | 92/92 |
| Owner-mode + services + behavioral-validation (incl. DB) | 1048/1048 |
| Playwright specs 18 + 19 + 20 | 25/25 |

## 18. Local 441/446 artifact explanation
Running the broader AI-supervisor / source-privacy / learning-governance / adjudication / governance / business-isolation batch locally, **5 tests fail in one file**: `src/__tests__/runtime-proof/rp3-workspace-isolation-runtime-proof.test.ts`. Root cause: `event-emitter.ts` performs a **raw** SQL INSERT into the `aggregate_locks` table, and the local database — provisioned with `prisma db push` rather than `prisma migrate deploy` — has **no DB-level default for `aggregate_locks.updated_at`**, so the raw insert hits `null value in column "updated_at" ... violates not-null constraint` (Postgres code `23502`). This is the pre-existing artifact documented in `AGGREGATE_LOCKS_FAILED_MIGRATION_FORENSIC_REPORT.md`.

This is **not a regression from this branch**: `git show --stat` confirms the diff touches neither `event-emitter` nor `aggregate_locks`; the failure is purely a local `db push` setup gap. **This is not hidden — it is documented here and in the PR body.**

## 19. CI expectations
The `owner-pilot-e2e.yml` lane and the DB lanes run `prisma migrate deploy`, which applies the migration that provisions the `aggregate_locks.updated_at` default — so the rp3 isolation tests are expected to pass under CI. CI must confirm green before merge. Specs 18/19/20 run in the owner-pilot E2E lane.

## 20. Final classification
**`CAUTIOUS_PROCEED_POLICY_READY`**

## 21. Merge recommendation
Recommend merge **once PR CI is green** (all DB lanes + Playwright specs 18/19/20). Do **not** merge before CI confirms the rp3 isolation tests pass under `migrate deploy`. No product changes beyond the additive, conservative-by-default policy; no gate weakened; no autonomy, no parallel brain, no fake confidence.
