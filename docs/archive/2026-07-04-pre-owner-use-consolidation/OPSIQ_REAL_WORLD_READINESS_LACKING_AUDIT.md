# OpsIQ Real-World Readiness — Hostile "What Is Still Lacking" Audit

Status codes: `already_proven_no_code_needed` · `partially_present_needs_tests` · `present_but_not_dashboard_visible` · `present_but_not_mobile_proven` · `real_gap_requires_minimal_code` · `out_of_scope_until_live_pilot`.

| # | Area | Status | Evidence / Reason |
|---|---|---|---|
| 1 | Input quality & data sufficiency | **already_proven_no_code_needed** | Default-on gate `recommendation-input-quality-gate.ts` (BLOCK/OWNER_REVIEW/PROFESSIONAL_REVIEW); confidence from real/stale/missing critical domains `owner-domain-ingestion.ts:118`. Adding a consolidation test only. |
| 2 | Confidence from weak/stale/conflicting | **already_proven_no_code_needed** | `deriveConfidence` caps to low on missing critical; stale ⇒ ≤medium. Covered by `novelty-training.test.ts` + supervisor tests. |
| 3 | Next-best data request quality | **partially_present_needs_tests** | Ranked `nextBestInput`/`missingDataRequests` exist (`input-guidance.ts:187`). Add a test asserting top-3 ranked requests + responsible party. |
| 4 | Local/legal/professional boundary | **already_proven_no_code_needed** | 4-tier `classifyComplianceRisk` + professional_review_required + blocked_until_review (`compliance-boundary.ts:43`); compliance_block ⇒ supervisor blocked. Consolidation test only. |
| 5 | Novelty / OOD handling | **already_proven_no_code_needed** | Novelty = missing-critical ⇒ confidence suppression + action-status (need_more_data/owner_decision/blocked); high-risk never auto-proceeds. `novelty-training.test.ts` (10 cases). Do NOT add a separate novelty engine. |
| 6 | Expected-vs-actual outcome measurement | **partially_present_needs_tests** | Expected + actual sides both exist (successMetrics/expectedOutcome + OwnerFinanceVerification/OwnerSelfEvaluation/OwnerActionOutcome, variance>200%, reassessment). Add a consolidation test proving "no success claim without actual" + "negative variance ⇒ reassessment". |
| 7 | Profit/cash/margin outcome proof | **out_of_scope_until_live_pilot** | Requires real before/after business financials over a time window. Guardrail (§11 area) must forbid claiming it from simulation/DB/mobile. |
| 8 | Owner workload outcome proof | **out_of_scope_until_live_pilot** | Same — needs live owner-workload before/after. Expected side exists (workload impact); actual requires live data. |
| 9 | 5-second dashboard clarity | **already_proven_no_code_needed** | SupervisorSummary renders all essentials, advanced reasoning collapsed, no static fallback; desktop+mobile proven (spec 18). Consolidation covered by existing specs. |
| 10 | Mobile first-screen usability | **partially_present_needs_tests** | Spec 18/22 assert mobile no-overflow. The full-mobile all-180 lane (area 17) strengthens this. |
| 11 | Readiness classification honesty | **real_gap_requires_minimal_code** | Readiness is a binary `pilotReady`; NO code-enforced state ladder forbidding live/profit overclaim from simulation/DB/mobile. Add pure `pilot-readiness-policy.ts` + tests. |
| 12 | Shadow pilot with partial real data | **real_gap_requires_minimal_code** | No shadow-pilot mode/report. Add thin pure `shadow-pilot.ts` over existing readiness/ingestion/guidance (verified vs assumptions, prep-now vs wait, intake checklist, no live claim). |
| 13 | Live outcome proof limitation | **out_of_scope_until_live_pilot** | No live business data in this environment. Guardrail forbids the claim; not faked. |
| 14 | Public SaaS readiness limitation | **out_of_scope_until_live_pilot** | Requires live-outcome evidence or explicit owner waiver. Guardrail blocks `PUBLIC_SAAS_READY`. |
| 15 | Staff proof / anti-gaming linkage | **already_proven_no_code_needed** | Proof lifecycle ("never complete without accepted proof"), duplicate-flagged proof ⇒ proof_fraud_block; fraud check in `outcome/verification.ts`. Covered by chaos proof-fraud scenarios (already green). |
| 16 | Learning / adjudication linkage | **already_proven_no_code_needed** | Deterministic adjudication + controlled-learning eligibility (no synthetic/AI/cross-tenant promotion, human-approved, workspace-scoped). Green in governance suite. |
| 17 | Full mobile chaos proof | **present_but_not_mobile_proven** → **real_gap (proof only)** | 45/180 today. Extend to all 180 mobile Playwright + CI lane + ledger 180/180. |

## Real gaps to close (why it matters / risk / reuse / min code / min tests / proof)

**Gap A — Full mobile all-180 (area 17)**
- Why: owners run OpsIQ on phones; the whole decision surface must be usable on mobile for the full chaos pack, not a sample.
- Risk if unfixed: a mobile-only owner could hit an unrendered/broken scenario; `FULL_MOBILE` overclaim.
- Reuse: `CHAOS_LEDGER`, `chaosBusinessId`, `seed-chaos-e2e`, spec-22 structure, `chaos-exhaustive.yml`.
- Min code: data-drive spec 22 over all 180 (sharded); extend CI. Min tests: the spec itself (180) + a coverage assertion. Proof: mobile browser required (180/180 ledger).

**Gap B — Pilot reality guardrail (area 11)**
- Why: prevents claiming "profit improved" / "live proven" from simulation/DB/mobile evidence.
- Risk if unfixed: dishonest readiness marketing; owner trusts an unproven claim.
- Reuse: readiness-score result shape; classification strings.
- Min code: pure `pilot-readiness-policy.ts` (ReadinessState ladder + `assertReadinessClaim`). Min tests: 8. Proof: unit (pure) — no DB/browser.

**Gap C — Shadow pilot mode (area 12)**
- Why: an owner can start with partial real data (owner "on ship") and get safe prep + honest missing-data + no fake certainty.
- Risk if unfixed: either no pilot path, or a pilot that fakes certainty from partial data.
- Reuse: `getOwnerWholeBusinessPlan`/ingestion (confidence, missing data), input-guidance (next-best), supervisor summary (owner/delegate/proof), readiness.
- Min code: pure `shadow-pilot.ts` derivation (no new service). Min tests: 10. Proof: unit + optional 1 DB-backed check; mobile/desktop surfacing reuses the existing panel.

## Rules honoured
- Nothing marked `already_proven_no_code_needed` is rebuilt.
- No duplicate engines: gaps B and C are pure derivations over existing runtime.
- Areas 7/8/13/14 are `out_of_scope_until_live_pilot` — a guardrail is added instead of faked proof.
