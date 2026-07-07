# Public Business Shadow Run — Results (PASS 43)

**Date:** 2026-07-07 · **Data:** `REAL_PUBLIC_DERIVED_ANONYMIZED_SHADOW_FIXTURES`

## What ran
3 real public-business cases + 1 clean control were built from real public sources
(`PUBLIC_BUSINESS_SOURCE_LEDGER.json`), anonymized/redacted, and run through OpsIQ's proven governed substrate
(survival planner → process-execution bridge → persisted tasks → owner action service) plus the read-only
recovery-status (PASS 37) and public-signals (PASS 39) projections. OpsIQ performed **no** live fetch.

## Cases + archetypes
- **BUSINESS_A** — laundry/dry-cleaning local service (delivery-delay + garment-quality complaints, positive praise, a stale public cleaning tender).
- **BUSINESS_B** — restaurant/hospitality (wait-time + order-accuracy complaints, plus an adversarial PII/injection review).
- **BUSINESS_C** — project-management SaaS (support/onboarding/pricing complaints, conflicting ease-vs-learning-curve reviews).
- **BUSINESS_CLEAN** — control (no public signals).

## Signals
13 public signals classified across STRONG (6), WEAK (2), CONFLICTING (1), STALE (1), MONITOR_ONLY (2),
VALIDATION_REQUIRED (11), DO_NOT_USE (1). See `PUBLIC_BUSINESS_SIGNAL_CLASSIFICATION_MATRIX.json`.

## Results (proven by `real-public-business-shadow-run.db.test.ts`, 12/12)
| Case | Top action | Public uncertainty | Unsafe blocked | Evidence | Reassessment | Verdict |
|------|-----------|--------------------|----------------|----------|--------------|---------|
| BUSINESS_A | CREATE_CORRECTION_TASK | validation required | growth + tender auto-submit + EMD | required | opened | CORRECT |
| BUSINESS_B | CREATE_CORRECTION_TASK | validation required | growth/scale | required | opened | CORRECT |
| BUSINESS_C | CREATE_CORRECTION_TASK | validation required | growth + pricing-without-approval | required | opened | CORRECT |
| BUSINESS_CLEAN | none | NONE | n/a | n/a | n/a | CORRECT (nothing fabricated) |

## Conservative-handling proof
- **Public complaints → correction/validation, not accusation** — no fraud/negligence/staff-blame wording.
- **Weak/subjective staff-attitude signal → coaching/SOP, never discipline.**
- **Conflicting SaaS reviews → retained as a public signal, not treated as fact.**
- **Public praise → monitor-only** — never closes an unresolved risk.
- **Public tender → readiness/missing-data + blocked from auto-submit; stale here (deadline passed).**
- **Growth blocked** until quality/capacity/cash internal proof exists (thrive gate BLOCKED).
- **Internal financials unknown → missing-data**, never fabricated money/ROI/win-probability.

## Privacy proof
Real business names appear only in the internal source ledger. Fixtures/cockpit use BUSINESS_A/B/C. An
adversarial raw review embedding an email, phone, and prompt-injection was seeded for BUSINESS_B and proven
**stripped** — the owner-facing read hides raw text, strips PII, resists the injection, and states
no-live-ingestion (`real-public-business-shadow-run.db.test.ts` test 4).

## Browser
`tests/browser/49-real-public-business-shadow-run.spec.ts` walks the cockpit Outside-signals journey (collapsed
→ public-uncertainty caveat + no-live-ingestion; no PII / raw dump / fake financials). Runs in `owner-pilot-e2e`.

## Limitation
Proves **controlled shadow behaviour on public data**, NOT real-world outcomes. Public signals are unverified;
the shadow run shows OpsIQ treats them conservatively and safely, then requires validation + internal proof.
