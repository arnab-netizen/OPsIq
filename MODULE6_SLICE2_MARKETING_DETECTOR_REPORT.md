# Module 6 (Marketing & Growth Intelligence) — Slice 2: Detector — Report

Status: **BUILT + LOCALLY VERIFIED.** Pure deterministic detector over the Slice 1
engine: risk findings + opportunity findings + deterministic ranking +
`diagnoseMarketingSnapshot` → spine `DomainScore { domain: "marketing" }`. No
DB/API/UI. Module 1 + all proven modules untouched. Public/SaaS frozen.

## 1. Why this is the correct next slice

Slice 1 (engine) is proven. Per the 8-slice contract, Slice 2 is the detector — it
turns the engine's metrics into explainable `OwnerFinding`s and the marketing
`DomainScore` the planner (Slice 3) and command center consume. It implements the
spec's risk-detection set (§13.3): wasted spend, poor conversion, wrong channel,
weak offer, low referral, campaign without follow-up.

## 2. Files created / changed

Created (`src/domain/owner-marketing/`):
- `risk-rules.ts` — `buildMarketingRiskFindings`: invalid currency, missing
  critical data, wasted spend (ROI bands), poor conversion (lead→order bands),
  weak offer (inquiry→order), wrong channel mix (paid-reliant), low referral,
  campaign-without-follow-up (bands). Each emits only when its metric is computable
  and crosses its threshold; `sourceValue` from a real metric only.
- `opportunity-rules.ts` — `buildMarketingOpportunityFindings`: scale the winner
  (healthy ROI), lift conversion, activate referrals, build organic, add
  follow-up, improve data quality. Emitted only when supporting inputs exist.
- `diagnosis.ts` — `rankMarketingFindings` (severity→impact→urgency→confidence→
  code) + `diagnoseMarketingSnapshot` → ranked findings + `DomainScore`
  (`domain: "marketing"`).

Changed: `src/domain/owner-marketing/index.ts` (barrel +3 exports).
Created test: `src/__tests__/owner-marketing/diagnosis.test.ts` (10 tests).

## 3. Honesty / governance

- Deterministic, no LLM. Findings cite sourceMetric/value/threshold/evidence.
- No fabrication: opportunities require real inputs; missing data surfaces as a
  certain finding + `missingData`; ROI is shown even when negative.
- Findings validate against the spine `ownerFindingSchema`; the `DomainScore`
  validates against `domainScoreSchema` with `domain: "marketing"`. No existing
  file modified.

## 4. Verification (local)

| Gate | Result |
|---|---|
| `npx vitest run src/__tests__/owner-marketing/` | 27 passed (engine 17 + detector 10) |
| `npx eslint src/domain/owner-marketing src/__tests__/owner-marketing` | clean |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500/1153 — no increase) |

## 5. Gate status

**No gate reached** (pure domain code + tests). Next: **Slice 3 — action planner**
(`MARKETING_REC_TEMPLATES` per finding code → `OwnerAction`s with pressure-weighted
priority). Migration gate is Slice 4. Public/SaaS stays frozen.
