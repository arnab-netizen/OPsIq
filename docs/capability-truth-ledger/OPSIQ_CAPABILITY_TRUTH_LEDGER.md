# OpsIQ Capability Truth Ledger

**Date:** 2026-07-07 · **Branch:** `claude/truthful-capability-assessment-promotion-claims-ledger`
**Classification target:** `TRUTH_LEDGER_COMPLETE`

A hostile, evidence-based truth-control audit of every significant OpsIQ
capability, so that all future marketing, demos, and positioning are **truthful by
construction**. Nothing here is asserted from memory — every classification cites
source + tests + the required CI lane + audit directories in this repo.

## The one honest sentence
OpsIQ is a **governed, deterministic reasoning engine for small-business
intervention and recovery**, proven in **backend code, 911 automated tests, and 28
DB-backed CI simulations** — **not** yet an owner-facing product, and **not** yet
run on a real business.

## Files in this ledger
| File | What it is |
|------|-----------|
| `OPSIQ_CAPABILITY_MATRIX.json` | 35 capabilities, each classified (CI-required / CI-related / DB-not-in-CI / unit-only) with proof level + evidence. |
| `OPSIQ_PROOF_LEVEL_MATRIX.json` | The 16-level (L0–L15) proof ladder used to grade capabilities. |
| `OPSIQ_CAPABILITY_EVIDENCE_LEDGER.json` | The countable raw evidence: test counts, LANE_B list, unwired sims, no-live-AI proof, no-outcome-data proof. |
| `OPSIQ_PUBLIC_CLAIMS_ALLOWED.md` | Claims you MAY make, each scoped to CI/test evidence. |
| `OPSIQ_PUBLIC_CLAIMS_FORBIDDEN.md` | 20 claims you may NOT make, with why. |
| `OPSIQ_DEMO_SCRIPT_TRUTH_GUIDE.md` | How to demo without lying; mandatory spoken disclaimers. |
| `OPSIQ_RESTRICTIONS_AND_BOUNDARIES.md` | Enforced-in-code boundaries + honest proof limits. |
| `OPSIQ_PROMOTION_RISK_AUDIT.md` | The 12 over-promotion patterns, ranked, with mitigations. |
| `OPSIQ_CURRENT_POSITIONING_STATEMENT.md` | The single truthful positioning to reuse. |
| `OPSIQ_CLAIMS_REVIEW_CHECKLIST.md` | The 5-gate pre-publish checklist. |
| `OPSIQ_CAPABILITY_TRUTH_LEDGER.md` | This index. |

## Headline findings
1. **Strong where it counts (governance).** Approval gating, evidence gating,
   workspace isolation, no-fabricated-money, no-autonomous-action, honest
   unrecoverable handling — all deterministic and DB-verified in the required CI
   lane.
2. **Backend, not product.** **0 of 35** assessed capabilities are surfaced in an
   owner-visible UI. The biggest honesty gap; it gates every product-readiness claim.
3. **No live AI.** The AI provider has no importer and disables itself without a
   key. All decisions are deterministic rules. "AI-powered" is forbidden.
4. **No real-world outcomes.** All proof is synthetic/controlled fixtures. No
   money-saved, business-saved, ROI, or success-probability claim is supportable.
5. **CI coverage is strong but not total.** 28 of 37 execution DB simulations run
   in the required lane; **10 exist on disk but are unwired**; **4** assessed
   modules are unit-test-only. Claims of "continuously tested" must respect this.

## Classification distribution (of 35)
- `PROVEN_CI_REQUIRED`: 17 — unit + same-name DB sim in required LANE_B.
- `PROVEN_CI_RELATED`: 7 — DB proof in LANE_B via an end-to-end file (weaker name traceability).
- `PROVEN_DB_NOT_IN_CI`: 7 — DB sim on disk, not gated on every PR.
- `PROVEN_UNIT_ONLY`: 4 — unit tests, no DB proof.
- `OWNER_VISIBLE_UI`: 0.

## How to use this ledger
Before any external statement, run `OPSIQ_CLAIMS_REVIEW_CHECKLIST.md`. If a claim
is not on the ALLOWED list and cannot cite evidence here, it is **forbidden by
default** (`CLAIM_RESTRICTED`). When proof cannot be found, mark `NOT_PROVEN` — do
not infer proof that is not in the repo, and do not treat docs as proof unless
backed by source/tests/CI/audit evidence.

## Classification: `TRUTH_LEDGER_COMPLETE`
All 11 ledger files are present and evidence-grounded; every capability is
classified against real repo evidence; allowed/forbidden claims and demo/positioning
guidance are consistent with the matrix and evidence ledger.
